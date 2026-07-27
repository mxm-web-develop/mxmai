/**
 * End 节点执行器 - 输出验证和最终结果生成
 * 支持三种输出类型：
 * - generated_content: 输出到虚拟文件夹
 * - business_template: 直接写入 DB（Task + PromptEngineeringConfig）
 * - simple_data: 直接返回 string/json
 */

import { SmartflowNode, ExecutionContext } from '../models/types';
import { BaseExecutor, ExecutorResult } from './base';
import { VariableResolver } from '../variables/resolver';
import { RepositoryFactory } from '@mxmai/mxmdata';

interface VirtualFolderItem {
  from_node: string;
  from_field: string;
  display_name: string;
  content_type: 'image' | 'video' | 'audio' | 'text';
}

interface VirtualFolderConfig {
  name: string;
  path: string;
  items: VirtualFolderItem[];
  tags?: string[];
}

interface BusinessTemplateConfig {
  scope: string;
  type: string;
  name: string;
  agent_rule?: string;
  agent_keywords?: string[];
  smartflow_id?: string;
  smartflow_definition?: any;
  include_task_template: boolean;
  include_schema: boolean;
  task_template?: {
    formSchema?: object;
    prompt?: object;
  };
}

interface SimpleDataConfig {
  from_node: string;
  from_field: string;
  format: 'string' | 'json';
}

interface EndNodeConfig {
  output_type: 'generated_content' | 'business_template' | 'simple_data';
  virtual_folder?: VirtualFolderConfig;
  business_template?: BusinessTemplateConfig;
  data_output?: SimpleDataConfig;
}

export class EndExecutor extends BaseExecutor {
  async execute(node: SmartflowNode, context: ExecutionContext): Promise<ExecutorResult> {
    try {
      const config = (node as any).config as EndNodeConfig | undefined;
      const output_type = config?.output_type || 'simple_data';

      switch (output_type) {
        case 'generated_content':
          return await this.executeVirtualFolderOutput(config!, node, context);
        case 'business_template':
          return await this.executeBusinessTemplateOutput(config!, context);
        case 'simple_data':
        default:
          return await this.executeSimpleDataOutput(node, context);
      }
    } catch (error: any) {
      return this.createErrorResult(`End executor error: ${error.message}`);
    }
  }

  /**
   * 输出到虚拟文件夹
   */
  private async executeVirtualFolderOutput(
    config: EndNodeConfig,
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<ExecutorResult> {
    const vfConfig = config?.virtual_folder;
    if (!vfConfig) {
      return this.createErrorResult('virtual_folder config is required for generated_content output');
    }

    try {
      const resolvedName = VariableResolver.resolve(vfConfig.name, context);
      const resolvedPath = VariableResolver.resolve(vfConfig.path, context);

      // 收集所有文件项
      const items: Array<{
        name: string;
        url: string;
        content_type: string;
        source_node: string;
        source_field: string;
      }> = [];

      for (const itemConfig of vfConfig.items || []) {
        const sourceRef = `${itemConfig.from_node}.${itemConfig.from_field}`;
        const resolved = VariableResolver.resolve(sourceRef, context);
        const displayName = VariableResolver.resolve(itemConfig.display_name, context);

        items.push({
          name: displayName,
          url: resolved || '',
          content_type: itemConfig.content_type,
          source_node: itemConfig.from_node,
          source_field: itemConfig.from_field,
        });
      }

      // 创建虚拟文件夹记录
      const folderId = `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return this.createSuccessResult({
        type: 'generated_content',
        folder: {
          id: folderId,
          name: resolvedName,
          path: resolvedPath,
          items,
          tags: vfConfig.tags || [],
        },
        metadata: {
          workflow_id: context.execution.smartflow_id,
          execution_id: context.execution.id,
          item_count: items.length,
        },
      });
    } catch (error: any) {
      return this.createErrorResult(`Virtual folder output error: ${error.message}`);
    }
  }

  /**
   * 输出业务线模板到 DB
   * 写入 PromptEngineeringConfig + 可选的 Smartflow 定义
   */
  private async executeBusinessTemplateOutput(
    config: EndNodeConfig,
    context: ExecutionContext
  ): Promise<ExecutorResult> {
    const btConfig = config?.business_template;
    if (!btConfig) {
      return this.createErrorResult('business_template config is required');
    }

    try {
      const scope = VariableResolver.resolve(btConfig.scope, context) || btConfig.scope;
      const type = VariableResolver.resolve(btConfig.type, context) || btConfig.type;
      const name = VariableResolver.resolve(btConfig.name, context) || btConfig.name;
      const agentRule = btConfig.agent_rule
        ? VariableResolver.resolve(btConfig.agent_rule, context)
        : '';
      const agentKeywords = btConfig.agent_keywords || [];

      // 构建 extra 对象
      const extra: Record<string, any> = {
        display: { taskLabel: name },
        agent_rule: agentRule,
        agent_keywords: agentKeywords,
      };

      // 如果配置了 smartflow_id
      if (btConfig.smartflow_id) {
        extra.smartflow_id = VariableResolver.resolve(btConfig.smartflow_id, context);
      }

      // 如果包含 taskTemplate
      if (btConfig.include_task_template && btConfig.task_template) {
        extra.taskTemplate = btConfig.task_template;
      }

      // 写入 PromptEngineeringConfig
      const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
      const saved = await repo.upsert({
        scope,
        type,
        extra,
        is_active: true,
      });

      const result: any = {
        type: 'business_template',
        template: {
          id: saved.id,
          scope,
          type,
          name,
          agent_rule: agentRule,
          agent_keywords: agentKeywords,
        },
        metadata: {
          workflow_id: context.execution.smartflow_id,
          execution_id: context.execution.id,
          created_at: saved.created_at,
        },
      };

      // 如果有 smartflow_definition，保存 Smartflow
      if (btConfig.smartflow_id && btConfig.smartflow_definition) {
        try {
          const smartflowRepo = (await import('../engine/repository')).smartflowRepository;
          const smartflowData = VariableResolver.resolve(
            JSON.stringify(btConfig.smartflow_definition),
            context
          );
          const sfJson = typeof smartflowData === 'string' ? JSON.parse(smartflowData) : smartflowData;

          const sf = await smartflowRepo.create({
            id: btConfig.smartflow_id,
            name: `Auto: ${name}`,
            description: `由工作流自动创建: ${name}`,
            schema: sfJson,
            is_public: false,
          });

          result.template.smartflow = {
            id: sf.id,
            name: sf.name,
          };
        } catch (sfError) {
          console.warn('[EndExecutor] Smartflow creation failed:', sfError);
          result.template.smartflow_error = 'Smartflow creation failed (see logs)';
        }
      }

      return this.createSuccessResult(result);
    } catch (error: any) {
      return this.createErrorResult(`Business template output error: ${error.message}`);
    }
  }

  /**
   * 输出简单数据（string 或 json）
   */
  private async executeSimpleDataOutput(
    node: SmartflowNode,
    context: ExecutionContext
  ): Promise<ExecutorResult> {
    const output_mapping = node.output_mapping || {};
    const nullable_outputs = node.nullable_outputs || [];
    const validate_outputs = node.validate_outputs ?? true;

    const expectedOutputs = context.variables.expected_outputs || [];
    const requiredOutputs = expectedOutputs
      .filter((out: any) => out.required)
      .map((out: any) => out.name);

    const finalOutput: Record<string, any> = {};

    for (const [outputName, sourceRef] of Object.entries(output_mapping)) {
      const resolved = VariableResolver.resolve(sourceRef as string, context);
      finalOutput[outputName] = resolved;
    }

    if (validate_outputs) {
      for (const required of requiredOutputs) {
        if (!(required in finalOutput) || finalOutput[required] === undefined || finalOutput[required] === null) {
          if (!nullable_outputs.includes(required)) {
            return this.createErrorResult(`Required output "${required}" is missing or null`);
          }
        }
      }
    }

    // 如果配置了 data_output 格式
    const config = (node as any).config as EndNodeConfig | undefined;
    if (config?.data_output) {
      const dataConfig = config.data_output;
      const sourceRef = `${dataConfig.from_node}.${dataConfig.from_field}`;
      const resolved = VariableResolver.resolve(sourceRef, context);

      return this.createSuccessResult({
        type: 'simple_data',
        data: dataConfig.format === 'json'
          ? (typeof resolved === 'string' ? JSON.parse(resolved) : resolved)
          : String(resolved || ''),
        metadata: {
          workflow_id: context.execution.smartflow_id,
          execution_id: context.execution.id,
        },
      });
    }

    return this.createSuccessResult({
      outputs: finalOutput,
      validation_passed: true,
    });
  }
}
