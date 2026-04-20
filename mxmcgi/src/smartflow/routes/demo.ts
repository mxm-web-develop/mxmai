/**
 * Demo 路由 - 测试完整的 Smartflow 执行流程（使用模拟数据）
 */

import { Router, Request, Response } from 'express';

const router = Router();

router.post('/photography-analysis-v2', async (req: Request, res: Response) => {
  try {
    const { 
      photography_type = 'portrait',
      style = 'classical',
      tone = 'warm',
      location = '中国',
      cultural_background = '中国古典文化',
      subject = '一位穿着汉服的年轻女子在古典园林中',
    } = req.body;

    await new Promise(resolve => setTimeout(resolve, 100));

    const executionId = `demo-${Date.now()}`;
    
    const result = {
      success: true,
      execution_id: executionId,
      output_data: {
        cultural_style_analysis: {
          title: '🎭 中国古典风格摄影分析',
          content: `基于您的文化背景（中国古典文化），我们为您深入分析古典风格摄影的特征：

**一、古典风格的定义**
中国古典风格摄影融合了传统绘画美学与摄影技术，强调意境、留白与含蓄之美。

**二、典型元素分析**
- **构图**：遵循中国传统绘画的"三远法"（高远、平远、深远）
- **光线**：偏好自然光的柔和运用，避免强烈直射光
- **色彩**：以低饱和度的暖色调为主
- **题材**：人物、园林、建筑、文物等具有历史文化内涵的元素`,
        },
        
        similar_photographers: {
          title: '📷 类似风格的摄影师推荐',
          content: `**1. 肖全 (Xiao Quan)** - 中国最好的人像摄影师，色调温暖，构图典雅。匹配度：★★★★★

**2. 郎静山 (Lang Jingshan)** - 中国摄影艺术先驱，将水墨画意境融入摄影。匹配度：★★★★☆

**3. 孙郡 (unco)** - 当代中国时尚摄影师，将工笔画与现代摄影结合。匹配度：★★★★★

**4. 冯方宇 (Feng Fangyu)** - 独特的中国古典园林人像，画面空灵。匹配度：★★★★☆`,
        },
        
        composition_analysis: {
          title: '🖼️ 暖色调人像构图与元素分析',
          content: `**1. 构图方式**
- 经典三分法，人物置于画面三分线处
- 框架构图，利用门窗、树枝等引导视线
- 留白法则，借鉴中国画理念

**2. 光线运用**
- 黄金时段：清晨或傍晚的柔和阳光
- 窗户光：利用花窗引入散射光
- 补光技巧：使用反光板补足阴影

**3. 色彩搭配**
- 主色调：暖橙、米黄、赭石
- 辅助色：浅青、墨绿（点缀）`,
        },
        
        final_prompt: {
          title: '✨ 生成的AI摄影Prompt',
          content: `**Professional Classical Chinese Portrait Photography Prompt**

A beautiful young woman in traditional Hanfu, standing gracefully in a classical Chinese garden with elegant pavilions and flowing water. The composition follows classical Chinese painting principles with careful attention to negative space. Soft warm golden hour sunlight filtering through ancient maple trees, creating a dreamy, ethereal atmosphere.

**Subject Details:**
- Young East Asian woman with serene, contemplative expression
- Traditional Chinese Hanfu in warm burgundy and gold tones
- Subtle traditional makeup enhancing natural beauty
- Hair styled with delicate traditional ornaments

**Environment Setting:**
- Classical Chinese garden with moon gate, stone bridges, and lotus ponds
- Aged stone walls covered with climbing vines
- Soft morning mist adding depth and mystery

**Style Elements:**
- Shot on medium format digital, 85mm f/1.4 lens
- Shallow depth of field with creamy bokeh
- Warm color palette: amber, ochre, soft orange
- Low contrast, high key lighting with soft shadows`,
        },
      },
      metadata: {
        photography_type,
        style,
        tone,
        location,
        cultural_background,
        subject,
        generated_at: new Date().toISOString(),
        workflow_version: '2.0.0',
      },
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'DEMO_ERROR', message: error.message },
    });
  }
});

export default router;
