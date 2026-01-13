/**
 * 提示词优化 API 路由
 */

import express, { Request, Response } from 'express';
import { createPromptOptimizerWorkflow, PromptOptimizerState } from '../services/prompt-optimizer';

const router = express.Router();

/**
 * POST /api/prompt-optimizer/optimize
 * 
 * 优化提示词并推荐模型
 * 
 * 请求体：
 * {
 *   "userDescription": "用户输入的文字描述",
 *   "userId": "用户ID（可选）",
 *   "taskType": "任务类型（可选，如 portrait, fashion）"
 * }
 * 
 * 响应：
 * {
 *   "success": true,
 *   "data": {
 *     "selectedBaseModel": { ... },
 *     "selectedLoRAModel": { ... },
 *     "optimizedPrompt": "...",
 *     "recommendations": {
 *       "baseModels": [ ... ],
 *       "loraModels": [ ... ],
 *       "prompts": [ ... ]
 *     }
 *   }
 * }
 */
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const { userDescription, userId, taskType } = req.body;

    // 验证输入
    if (!userDescription || typeof userDescription !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userDescription 是必需的，且必须是字符串'
      });
    }

    if (!taskType || typeof taskType !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'taskType 是必需的，且必须是字符串（如 image_generation, music_generation）'
      });
    }

    // 创建工作流
    const workflow = createPromptOptimizerWorkflow();

    // 准备初始状态
    const initialState: PromptOptimizerState = {
      userDescription,
      userId,
      taskType
    };

    // 执行工作流
    console.log('🚀 开始执行提示词优化工作流...');
    const result = await workflow.invoke(initialState);

    // 检查错误
    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    // 返回结果
    res.json({
      success: true,
      data: {
        selectedBaseModel: result.selectedBaseModel,
        selectedLoRAModel: result.selectedLoRAModel,
        optimizedPrompt: result.optimizedPrompt,
        recommendations: {
          baseModels: result.baseModelRecommendations || [],
          loraModels: result.loraModelRecommendations || [],
          prompts: result.promptRecommendations || []
        },
        analyzedFeatures: result.analyzedFeatures
      }
    });
  } catch (error) {
    console.error('❌ 提示词优化失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    });
  }
});

export default router;
