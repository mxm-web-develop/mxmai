/**
 * 初始化内置 Smartflow 工作流
 * 创建一些示例工作流供用户使用
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSmartflowRepository } from '../factories/RepositoryFactory';
import type { CreateSmartflowDto } from '../models/Smartflow';

// ES module 中获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../../.env') });

/**
 * 简单文本生成工作流
 */
const simpleTextFlow: CreateSmartflowDto = {
  id: 'simple-text-generation',
  name: '简单文本生成',
  description: '根据用户输入的主题生成文本内容',
  category: 'text',
  tags: ['文本生成', '简单', '入门'],
  schema: {
    nodes: [
      {
        id: 'start',
        type: 'start',
        expected_outputs: [
          {
            type: 'text',
            name: 'result',
            required: true,
          },
        ],
        smartflow_name: '简单文本生成工作流',
      },
      {
        id: 'model1',
        type: 'model',
        name: '文本生成',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: '生成关于用户输入主题的文章，要求内容详实、结构清晰。\n用户输入：{{input.topic}}',
      },
      {
        id: 'end',
        type: 'end',
        output_mapping: {
          result: 'model1.text',
        },
      },
    ],
    edges: [
      { from: 'start', to: 'model1' },
      { from: 'model1', to: 'end' },
    ],
  },
  status: 'active',
  is_public: true,
  version: '1.0.0',
};

/**
 * 图片生成工作流（使用 Prompt 模板）
 */
const imageGenerationFlow: CreateSmartflowDto = {
  id: 'professional-photo-generation',
  name: '专业摄影生图',
  description: '使用 nano-banana 模型生成专业摄影风格的图片',
  category: 'image',
  tags: ['图片生成', '摄影', 'nano-banana'],
  schema: {
    nodes: [
      {
        id: 'start',
        type: 'start',
        expected_outputs: [
          {
            type: 'image',
            name: 'cover_image',
            required: true,
          },
        ],
        smartflow_name: '专业摄影生图工作流',
      },
      {
        id: 'formatter1',
        type: 'formatter',
        name: 'Prompt 格式化',
        template: 'nano-banana-photo-prompt',
        format_prompt: '将用户输入转换为专业的摄影生图 prompt，包含主题、风格、细节、质量等要素',
        reference_nodes: [],
        formatter_model: 'gpt-5-nano',
      },
      {
        id: 'model1',
        type: 'model',
        name: '图片生成',
        model_type: 'image',
        model: 'nano-banana',
        prompt: '{{formatter1.output}}',
      },
      {
        id: 'end',
        type: 'end',
        output_mapping: {
          cover_image: 'model1.image_url',
        },
      },
    ],
    edges: [
      { from: 'start', to: 'formatter1' },
      { from: 'formatter1', to: 'model1' },
      { from: 'model1', to: 'end' },
    ],
  },
  status: 'active',
  is_public: true,
  version: '1.0.0',
};

/**
 * 文本摘要工作流
 */
const textSummaryFlow: CreateSmartflowDto = {
  id: 'text-summary-generation',
  name: '文本摘要生成',
  description: '对输入的文本内容进行摘要生成',
  category: 'text',
  tags: ['文本摘要', '内容处理'],
  schema: {
    nodes: [
      {
        id: 'start',
        type: 'start',
        expected_outputs: [
          {
            type: 'text',
            name: 'summary',
            required: true,
          },
        ],
        smartflow_name: '文本摘要生成工作流',
      },
      {
        id: 'formatter1',
        type: 'formatter',
        name: '摘要格式化',
        template: 'text-summary',
        format_prompt: '生成文本摘要，要求简洁明了，突出核心要点',
        reference_nodes: [],
        formatter_model: 'gpt-5-nano',
      },
      {
        id: 'model1',
        type: 'model',
        name: '生成摘要',
        model_type: 'text',
        model: 'gpt-5-nano',
        prompt: '{{formatter1.output}}',
      },
      {
        id: 'end',
        type: 'end',
        output_mapping: {
          summary: 'model1.text',
        },
      },
    ],
    edges: [
      { from: 'start', to: 'formatter1' },
      { from: 'formatter1', to: 'model1' },
      { from: 'model1', to: 'end' },
    ],
  },
  status: 'active',
  is_public: true,
  version: '1.0.0',
};

/**
 * 初始化内置工作流
 */
async function initBuiltinSmartflows() {
  try {
    console.log('🚀 开始初始化内置 Smartflow 工作流...\n');

    const repo = createSmartflowRepository();
    const flows = [simpleTextFlow, imageGenerationFlow, textSummaryFlow];

    for (const flow of flows) {
      try {
        if (!flow.id) {
          console.error(`❌ 工作流 "${flow.name}" 缺少 ID，跳过`);
          continue;
        }

        // 检查是否已存在
        const existing = await repo.findById(flow.id);
        if (existing) {
          console.log(`⏭️  工作流 "${flow.name}" (ID: ${flow.id}) 已存在，跳过`);
          continue;
        }

        // 创建新工作流
        const created = await repo.create(flow);
        console.log(`✅ 成功创建工作流: ${created.name} (ID: ${created.id})`);
      } catch (error) {
        console.error(`❌ 创建工作流 "${flow.name}" 失败:`, error);
      }
    }

    console.log('\n✨ 内置工作流初始化完成！');
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    process.exit(1);
  }
}

// 执行初始化
initBuiltinSmartflows();
