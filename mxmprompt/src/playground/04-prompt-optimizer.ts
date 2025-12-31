/**
 * 提示词优化工作流演示
 * 
 * 演示如何使用 LangChain 和 LangGraph 实现提示词优化系统
 * 
 * 功能：
 * 1. 用户输入文字描述
 * 2. 从向量数据库检索：
 *    - 适配的主力模型
 *    - 推荐的 LoRA 模型
 *    - 精准命中的提示词模板
 * 3. 生成优化后的提示词
 */

import { createPromptOptimizerWorkflow, PromptOptimizerState } from '../services/prompt-optimizer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 演示函数：运行提示词优化工作流
 */
async function runPromptOptimizerDemo() {
  console.log('\n=== 提示词优化工作流演示 ===\n');
  console.log('工作流结构:');
  console.log('  开始');
  console.log('    ↓');
  console.log('  [节点1: 生成查询向量]');
  console.log('    ↓');
  console.log('    ├─→ [节点2: 分析任务特征]');
  console.log('    ├─→ [节点3: 检索主力模型]');
  console.log('    ├─→ [节点4: 检索 LoRA 模型]');
  console.log('    └─→ [节点5: 检索提示词]');
  console.log('        ↓');
  console.log('  [节点6: 选择最佳推荐]');
  console.log('        ↓');
  console.log('       结束\n');
  console.log('='.repeat(50));
  console.log('开始执行工作流...\n');

  // 创建工作流实例
  const workflow = createPromptOptimizerWorkflow();

  // 准备初始状态
  const initialState: PromptOptimizerState = {
    userDescription: '我想要生成一张专业的人像摄影照片，近景，工作室灯光，高质量',
    userId: 'user-123',
    taskType: 'portrait'
  };

  console.log('📝 用户输入:', initialState.userDescription);
  console.log('👤 用户ID:', initialState.userId);
  console.log('📋 任务类型:', initialState.taskType);
  console.log('\n');

  // 执行工作流
  const result = await workflow.invoke(initialState);

  // 展示结果
  console.log('\n' + '='.repeat(50));
  console.log('✅ 工作流执行完成！\n');

  console.log('🎯 推荐的主力模型:');
  if (result.selectedBaseModel) {
    console.log(`  - 名称: ${result.selectedBaseModel.name}`);
    console.log(`  - 模型ID: ${result.selectedBaseModel.modelId}`);
    console.log(`  - 描述: ${result.selectedBaseModel.description}`);
  } else {
    console.log('  - 无推荐');
  }

  console.log('\n🎨 推荐的 LoRA 模型:');
  if (result.selectedLoRAModel) {
    console.log(`  - 名称: ${result.selectedLoRAModel.name}`);
    console.log(`  - 任务类型: ${result.selectedLoRAModel.taskType}`);
    console.log(`  - 存储类型: ${result.selectedLoRAModel.storageType}`);
    console.log(`  - 模型URL: ${result.selectedLoRAModel.modelUrl || 'N/A'}`);
    console.log(`  - 触发词: ${result.selectedLoRAModel.triggerWords?.join(', ') || 'N/A'}`);
    console.log(`  - 推荐强度: ${result.selectedLoRAModel.strength || 'N/A'}`);
  } else {
    console.log('  - 无推荐');
  }

  console.log('\n📝 优化后的提示词:');
  console.log(`  ${result.optimizedPrompt || 'N/A'}`);

  console.log('\n📊 任务特征分析:');
  if (result.analyzedFeatures) {
    console.log(`  - 主体: ${result.analyzedFeatures.subject}`);
    console.log(`  - 场景: ${result.analyzedFeatures.scene}`);
    console.log(`  - 风格: ${result.analyzedFeatures.style}`);
    console.log(`  - 技术参数: ${result.analyzedFeatures.technicalParams}`);
  }

  console.log('\n📚 所有推荐（Top 3）:');
  
  console.log('\n  主力模型推荐:');
  result.baseModelRecommendations?.slice(0, 3).forEach((model, index) => {
    console.log(`    ${index + 1}. ${model.name} (相似度: ${(model.similarity * 100).toFixed(2)}%)`);
  });

  console.log('\n  LoRA 模型推荐:');
  result.loraModelRecommendations?.slice(0, 3).forEach((model, index) => {
    console.log(`    ${index + 1}. ${model.name} (相似度: ${(model.similarity * 100).toFixed(2)}%)`);
  });

  console.log('\n  提示词推荐:');
  result.promptRecommendations?.slice(0, 3).forEach((prompt, index) => {
    console.log(`    ${index + 1}. ${prompt.template.substring(0, 50)}... (相似度: ${(prompt.similarity * 100).toFixed(2)}%)`);
  });

  console.log('\n--- 演示完成 ---\n');
}

/**
 * 主函数
 */
async function main() {
  try {
    await runPromptOptimizerDemo();
  } catch (error) {
    console.error('\n❌ 演示失败:', error);
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  main();
}

export { runPromptOptimizerDemo };
