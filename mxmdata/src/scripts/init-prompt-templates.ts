/**
 * 初始化内置 Prompt 模板到数据库
 * 将内置模板添加为公开模板，供所有用户使用
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ES module 中获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
process.env.DOTENV_CONFIG_DEBUG = 'false';
dotenv.config({ path: resolve(__dirname, '../../../.env') });
dotenv.config();

import { RepositoryFactory } from '../factories/RepositoryFactory';
import type { CreatePromptTemplateDto } from '../models/PromptTemplate';

// 内置模板定义（Smartflow 模板，原 mxmagent 已并入 mxmcgi）
const BUILTIN_TEMPLATES: CreatePromptTemplateDto[] = [
  {
    id: 'nano-banana-photo-prompt',
    name: 'nano-banana-photo-prompt',
    display_name: 'Nano Banana 摄影生图 Prompt',
    description: '专业摄影风格提示词模板，适用于 Nano Banana 模型',
    template: `专业摄影风格提示词：
主题：{{theme}}
风格：{{style}}
细节：{{details}}
质量要求：{{quality}}`,
    variables: ['theme', 'style', 'details', 'quality'],
    category: 'image',
    is_public: true,
  },
  {
    id: 'text-summary',
    name: 'text-summary',
    display_name: '文本摘要模板',
    description: '将长文本转换为简洁摘要',
    template: `请将以下内容总结为简洁的摘要（不超过 {{max_length}} 字）：

{{content}}`,
    variables: ['content', 'max_length'],
    category: 'text',
    is_public: true,
  },
  {
    id: 'json-formatter',
    name: 'json-formatter',
    display_name: 'JSON 格式化模板',
    description: '将文本内容转换为规范的 JSON 格式',
    template: `请将以下内容转换为 JSON 格式：

{{content}}

要求：
1. 确保 JSON 格式正确
2. 包含所有关键信息
3. 使用中文键名`,
    variables: ['content'],
    category: 'formatter',
    is_public: true,
  },
];

/**
 * 初始化内置模板
 */
async function initBuiltinTemplates() {
  try {
    // 初始化 RepositoryFactory
    RepositoryFactory.init();

    const templateRepo = RepositoryFactory.createPromptTemplateRepository();

    console.log('🚀 开始初始化内置 Prompt 模板...\n');

    for (const template of BUILTIN_TEMPLATES) {
      try {
        // 检查模板是否已存在（如果表不存在，这个调用会失败，我们直接尝试创建）
        let existing = null;
        try {
          existing = await templateRepo.findByName(template.name);
        } catch (checkError: any) {
          // 如果错误是表不存在，继续尝试创建
          if (checkError?.originalError?.code === 'PGRST205' || 
              checkError?.message?.includes('Could not find the table')) {
            console.log(`⚠️  表 prompt_templates 可能不存在，将尝试创建模板 "${template.name}"`);
          } else {
            // 其他错误，重新抛出
            throw checkError;
          }
        }

        if (existing) {
          console.log(`⏭️  模板 "${template.name}" 已存在，跳过`);
          continue;
        }

        // 创建模板
        const created = await templateRepo.create(template);
        console.log(`✅ 成功创建模板: ${created.display_name} (${created.name})`);
      } catch (error: any) {
        // 检查是否是表不存在的错误
        if (error?.originalError?.code === 'PGRST205' || 
            error?.message?.includes('Could not find the table')) {
          console.error(`❌ 创建模板 "${template.name}" 失败: 表 prompt_templates 不存在`);
          console.error(`   请先在 Supabase Studio 中执行 SQL 创建表，然后重启 PostgREST 服务`);
          console.error(`   SQL 文件位置: mxmdata/src/database/schemas/mxmagent_final_safe.sql`);
          console.error(`   重启命令: cd mxmdata && pnpm run reset:db`);
        } else {
          console.error(`❌ 创建模板 "${template.name}" 失败:`, error);
          if (error instanceof Error) {
            console.error(`   错误信息: ${error.message}`);
          }
        }
      }
    }

    console.log('\n✨ 内置模板初始化完成！');
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 执行初始化
initBuiltinTemplates();
