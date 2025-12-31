/**
 * Prompt 模板库
 * 内置模板和模板管理接口
 */

/**
 * Prompt 模板定义
 */
export interface PromptTemplate {
  name: string;                    // 模板名称
  displayName: string;              // 显示名称
  description: string;              // 模板描述
  template: string;                  // 模板内容（支持变量占位符 {{variable}}）
  variables: string[];               // 模板变量列表
  category?: string;                // 分类
}

/**
 * 内置 Prompt 模板库
 */
export const BUILTIN_TEMPLATES: Record<string, PromptTemplate> = {
  'nano-banana-photo-prompt': {
    name: 'nano-banana-photo-prompt',
    displayName: 'Nano Banana 摄影生图 Prompt',
    description: '专业摄影风格提示词模板，适用于 Nano Banana 模型',
    template: `专业摄影风格提示词：
主题：{{theme}}
风格：{{style}}
细节：{{details}}
质量要求：{{quality}}`,
    variables: ['theme', 'style', 'details', 'quality'],
    category: 'image',
  },
  
  // 可以继续添加更多内置模板
  'text-summary': {
    name: 'text-summary',
    displayName: '文本摘要模板',
    description: '将长文本转换为简洁摘要',
    template: `请将以下内容总结为简洁的摘要（不超过 {{max_length}} 字）：

{{content}}`,
    variables: ['content', 'max_length'],
    category: 'text',
  },
  
  'json-formatter': {
    name: 'json-formatter',
    displayName: 'JSON 格式化模板',
    description: '将文本内容转换为规范的 JSON 格式',
    template: `请将以下内容转换为 JSON 格式：

{{content}}

要求：
1. 确保 JSON 格式正确
2. 包含所有关键信息
3. 使用中文键名`,
    variables: ['content'],
    category: 'formatter',
  },
};

/**
 * 获取模板
 */
export function getTemplate(templateName: string): PromptTemplate | undefined {
  return BUILTIN_TEMPLATES[templateName];
}

/**
 * 获取所有模板
 */
export function getAllTemplates(): PromptTemplate[] {
  return Object.values(BUILTIN_TEMPLATES);
}

/**
 * 按分类获取模板
 */
export function getTemplatesByCategory(category: string): PromptTemplate[] {
  return Object.values(BUILTIN_TEMPLATES).filter(
    template => template.category === category
  );
}

/**
 * 填充模板变量
 */
export function fillTemplate(
  template: PromptTemplate | string,
  variables: Record<string, any>
): string {
  let templateContent: string;
  
  if (typeof template === 'string') {
    templateContent = template;
  } else {
    templateContent = template.template;
  }
  
  // 替换所有 {{variable}} 占位符
  let filled = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    filled = filled.replace(placeholder, String(value));
  }
  
  // 检查是否有未填充的变量
  const remainingPlaceholders = filled.match(/\{\{(\w+)\}\}/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    console.warn(`⚠️  模板中仍有未填充的变量: ${remainingPlaceholders.join(', ')}`);
  }
  
  return filled;
}

/**
 * 验证模板变量
 */
export function validateTemplateVariables(
  template: PromptTemplate,
  variables: Record<string, any>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const varName of template.variables) {
    if (!(varName in variables)) {
      missing.push(varName);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
