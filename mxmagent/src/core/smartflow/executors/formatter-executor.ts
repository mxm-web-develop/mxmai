/**
 * Formatter 节点执行器
 * 支持 Prompt 模板、格式转换（基于 text 模型）
 */

import type { SmartflowNode } from '@mxmai/mxmdata';
import type { ExecutionContext, NodeExecutionResult } from './types';
import { VariableResolver } from './variable-resolver';
import { getTemplate, fillTemplate, validateTemplateVariables, BUILTIN_TEMPLATES } from '../templates/prompt-templates';
import { callTextGeneration } from '../http-client';
import { RepositoryFactory } from '@mxmai/mxmdata';

export class FormatterExecutor {
  /**
   * 执行 formatter 节点
   */
  static async execute(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    try {
      // 验证必需字段：必须提供 template 或 format_prompt 之一
      if (!node.template && !node.format_prompt) {
        return {
          success: false,
          error: 'Formatter 节点缺少必需字段: 必须提供 template 或 format_prompt 之一',
        };
      }
      
      // 1. 处理 Prompt 模板（如果指定了）
      let formatPrompt: string = '';
      let templateVariables: Record<string, any> = {};
      
      if (node.template) {
        // 如果提供了 template，直接使用模板（不需要 format_prompt）
        // 首先尝试从内置模板获取
        let template = getTemplate(node.template);
        
        // 如果内置模板不存在，尝试从数据库加载
        if (!template) {
          try {
            const templateRepo = RepositoryFactory.createPromptTemplateRepository();
            const dbTemplate = await templateRepo.findByName(node.template);
            
            if (dbTemplate) {
              // 转换为内置模板格式
              template = {
                name: dbTemplate.name,
                displayName: dbTemplate.display_name,
                description: dbTemplate.description || '',
                template: dbTemplate.template,
                variables: dbTemplate.variables || [],
                category: dbTemplate.category,
              };
              
              // 增加使用次数
              await templateRepo.incrementUsageCount(dbTemplate.id).catch(err => {
                console.warn(`Failed to increment usage count for template ${dbTemplate.id}:`, err);
              });
            }
          } catch (error) {
            console.warn(`Failed to load template from database: ${node.template}`, error);
          }
        }
        
        if (template) {
          // 使用模板（内置或数据库）
          // 从 reference_nodes 或 context 中获取变量值
          templateVariables = this.collectTemplateVariables(
            template,
            node.reference_nodes || [],
            context
          );
          
          // 验证变量
          const validation = validateTemplateVariables(template, templateVariables);
          if (!validation.valid) {
            return {
              success: false,
              error: `模板变量缺失: ${validation.missing.join(', ')}`,
            };
          }
          
          // 填充模板
          const filledTemplate = fillTemplate(template, templateVariables);
          formatPrompt = filledTemplate;
        } else {
          // 自定义模板（直接使用 template 作为模板内容）
          // 解析模板中的变量
          templateVariables = this.collectTemplateVariables(
            { template: node.template, variables: [] },
            node.reference_nodes || [],
            context
          );
          formatPrompt = fillTemplate(node.template, templateVariables);
        }
      } else if (node.format_prompt) {
        // 如果没有 template 但有 format_prompt，使用 format_prompt
        // 解析 format_prompt 中的变量（如 {{text_model.text}}）
        templateVariables = this.collectTemplateVariables(
          { template: node.format_prompt, variables: [] },
          node.reference_nodes || [],
          context
        );
        formatPrompt = fillTemplate(node.format_prompt, templateVariables);
      } else {
        // 理论上不会到达这里（因为前面已经验证），但为了类型安全
        return {
          success: false,
          error: 'Formatter 节点缺少必需字段: 必须提供 template 或 format_prompt',
        };
      }
      
      // 2. 收集参考节点的数据
      const referenceData = this.collectReferenceData(
        node.reference_nodes || [],
        context
      );
      
      // 3. 构建格式转换提示词
      const conversionPrompt = this.buildConversionPrompt(
        formatPrompt,
        referenceData,
        node.output_format
      );
      
      // 4. 使用 text 模型进行格式转换（默认使用快速模型，通过 Gateway）
      const model = node.formatter_model || 'gpt-5-nano';
      
      // 传递用户 token（如果存在）
      const userToken = context.token;
      
      const response = await callTextGeneration(
        model,
        conversionPrompt,
        {
          temperature: 0.7,
          max_tokens: 2000,
        },
        userToken
      );
      
      // Gateway 返回格式：{ success: true, data: { result: { text: ... } } }
      const actualResult = response.data?.result || response.result || response;
      const formattedText = actualResult.text || '';
      
      // 5. 根据 output_format 处理输出
      const formattedOutput = this.formatOutput(
        formattedText,
        node.output_format || 'text'
      );
      
      return {
        success: true,
        output: {
          formatted: formattedOutput,
          original: referenceData,
        },
        metadata: {
          template: node.template,
          output_format: node.output_format,
          model,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * 收集模板变量
   */
  private static collectTemplateVariables(
    template: { template: string; variables?: string[] },
    referenceNodes: string[],
    context: ExecutionContext
  ): Record<string, any> {
    const variables: Record<string, any> = {};
    
    // 1. 从 reference_nodes 的输出中提取变量
    for (const nodeId of referenceNodes) {
      const nodeOutput = context.nodeOutputs[nodeId];
      if (nodeOutput) {
        // 尝试提取常见字段
        if (typeof nodeOutput === 'object') {
          Object.assign(variables, nodeOutput);
        } else {
          variables[nodeId] = nodeOutput;
        }
      }
    }
    
    // 2. 从 context.input 中提取变量（用户输入）
    if (context.input) {
      Object.assign(variables, context.input);
    }
    
    // 3. 如果变量仍然缺失，尝试从文本输出中提取
    // 例如：如果 reference_nodes 的输出是文本，尝试提取为 content 或 text
    for (const nodeId of referenceNodes) {
      const nodeOutput = context.nodeOutputs[nodeId];
      if (nodeOutput && typeof nodeOutput === 'object') {
        // 如果输出有 text 字段，将其作为 content 或 text 变量
        if (nodeOutput.text && !variables.content && !variables.text) {
          variables.content = nodeOutput.text;
          variables.text = nodeOutput.text;
        }
        // 如果输出有 response 字段，也作为 content
        if (nodeOutput.response && !variables.content) {
          variables.content = nodeOutput.response;
        }
      }
    }
    
    // 4. 为缺失的必需变量提供默认值或从文本中推断
    // 如果模板需要 theme, details, quality 等，但只有 text/content，则使用文本作为基础
    const requiredVars = template.variables || [];
    const missingVars = requiredVars.filter(v => !variables[v]);
    
    if (missingVars.length > 0 && variables.content) {
      // 如果只有 content/text，但需要 theme, details 等，使用 content 作为这些变量的基础
      // 这样 LLM 可以在 format_prompt 中处理
      for (const varName of missingVars) {
        if (!variables[varName]) {
          // 对于常见的变量名，提供合理的默认值或从 content 推断
          if (varName === 'theme' || varName === 'details') {
            variables[varName] = variables.content;
          } else if (varName === 'quality') {
            variables[varName] = 'hd'; // 默认高质量
          } else if (varName === 'style') {
            variables[varName] = variables.content; // 使用内容作为风格描述
          } else {
            // 其他变量使用 content 作为默认值
            variables[varName] = variables.content;
          }
        }
      }
    }
    
    return variables;
  }
  
  /**
   * 收集参考节点数据
   */
  private static collectReferenceData(
    referenceNodes: string[],
    context: ExecutionContext
  ): Record<string, any> {
    const data: Record<string, any> = {};
    
    for (const nodeId of referenceNodes) {
      const nodeOutput = context.nodeOutputs[nodeId];
      if (nodeOutput !== undefined) {
        data[nodeId] = nodeOutput;
      }
    }
    
    return data;
  }
  
  /**
   * 构建格式转换提示词
   */
  private static buildConversionPrompt(
    formatPrompt: string,
    referenceData: Record<string, any>,
    outputFormat?: string
  ): string {
    let prompt = formatPrompt;
    
    // 添加参考数据
    if (Object.keys(referenceData).length > 0) {
      prompt += `\n\n参考数据：\n${JSON.stringify(referenceData, null, 2)}`;
    }
    
    // 添加输出格式要求
    if (outputFormat) {
      switch (outputFormat) {
        case 'json':
          prompt += '\n\n要求：输出格式为 JSON';
          break;
        case 'markdown':
          prompt += '\n\n要求：输出格式为 Markdown';
          break;
        case 'html':
          prompt += '\n\n要求：输出格式为 HTML';
          break;
        case 'prompt':
          prompt += '\n\n要求：输出格式为提示词';
          break;
      }
    }
    
    return prompt;
  }
  
  /**
   * 格式化输出
   */
  private static formatOutput(
    text: string,
    outputFormat: string
  ): any {
    switch (outputFormat) {
      case 'json':
        try {
          return JSON.parse(text);
        } catch {
          return { text };
        }
      case 'prompt':
        // 对于 prompt 格式，清理输出：
        // 1. 移除多余的描述性文本（如"输出格式：..."、"以上为..."等）
        // 2. 移除特殊字符（非ASCII字符，保留常见标点）
        // 3. 提取实际的提示词内容
        return this.cleanPromptOutput(text);
      case 'markdown':
      case 'html':
      case 'text':
      default:
        return text;
    }
  }
  
  /**
   * 清理 prompt 输出
   * 移除多余的描述性文本和特殊字符
   */
  private static cleanPromptOutput(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }
    
    let cleaned = text.trim();
    
    // 1. 优先提取引号内的内容（最常见的格式）
    const quotedPatterns = [
      /["""]([^"""]+)["""]/,  // 中文引号
      /"([^"]+)"/,             // 英文双引号
      /'([^']+)'/,             // 英文单引号
    ];
    
    for (const pattern of quotedPatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1] && match[1].length > 20) {
        // 如果引号内容足够长，使用它
        cleaned = match[1].trim();
        break;
      }
    }
    
    // 2. 移除常见的描述性文本模式（在引号提取之后）
    const patternsToRemove = [
      /输出格式[：:].*?可直接用于AI生成的提示词集合.*?/gi,
      /以上为.*?可直接用于AI生成的提示词集合.*?/gi,
      /按需组合成完整提示句[，,].*?如[：:]\s*/gi,
      /输出格式[：:].*?/gi,
      /^提示词[：:]\s*/gi,
      /^输出[：:]\s*/gi,
      /这是.*?最后生成的提示词[，,].*?/gi,
      /这些.*?多余描述.*?/gi,
    ];
    
    for (const pattern of patternsToRemove) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // 3. 移除特殊字符（保留 ASCII 字符、常见标点、中文、空格、换行）
    // 移除非 ASCII 字符（除了中文），包括俄语、emoji 等
    cleaned = cleaned.replace(/[^\x20-\x7E\n\r\u4e00-\u9fa5，。、；：？！""''（）【】《》]/g, '');
    
    // 4. 清理多余的空白字符（保留单个空格和换行）
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // 多个空格/制表符合并为单个空格
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // 多个换行合并为最多两个
    
    // 5. 移除开头和结尾的标点符号（如果只是装饰性的）
    cleaned = cleaned.replace(/^[，。、；：？！\s]+/, '');
    cleaned = cleaned.replace(/[，。、；：？！\s]+$/, '');
    
    // 6. 如果清理后为空或太短，尝试更宽松的清理
    if (!cleaned || cleaned.length < 10) {
      // 回退：只移除明显的描述性前缀，保留更多内容
      cleaned = text.replace(/^(输出格式|以上为|提示词|输出|这是|这些)[：:，,]\s*/gi, '').trim();
      // 再次尝试提取引号内容
      for (const pattern of quotedPatterns) {
        const match = cleaned.match(pattern);
        if (match && match[1]) {
          cleaned = match[1].trim();
          break;
        }
      }
      // 移除特殊字符
      cleaned = cleaned.replace(/[^\x20-\x7E\n\r\u4e00-\u9fa5，。、；：？！""''（）【】《》]/g, '');
    }
    
    return cleaned.trim() || text.trim(); // 如果清理后为空，返回原始文本（至少trim过）
  }
}
