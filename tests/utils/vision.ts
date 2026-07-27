/**
 * MiniMax Vision MCP 封装
 *
 * 提供截图分析和视觉回归检测能力
 */

import { mcp__MiniMax__understand_image } from '../types/mcp.js';
import fs from 'fs';
import path from 'path';

export interface VisionAnalysisResult {
  score: number;          // 视觉质量评分 1-10
  issues: string[];       // 发现的问题列表
  summary: string;         // 简短总结
  details: string;         // 详细分析
}

export interface VisualDiffResult {
  hasDifference: boolean;
  description: string;
  severity: 'none' | 'minor' | 'moderate' | 'severe';
}

/**
 * 分析截图是否存在 UI 异常
 */
export async function analyzeScreenshot(
  screenshotPath: string,
  prompt?: string
): Promise<VisionAnalysisResult> {
  const imageBuffer = fs.readFileSync(screenshotPath);
  const base64Image = imageBuffer.toString('base64');

  const defaultPrompt = prompt || `分析这个页面截图，检测：
1. 是否有明显的 UI 异常（布局错乱、元素缺失、空白页面）
2. 侧边栏导航是否正常显示
3. 主要内容区域是否可见
4. 是否有错误提示、加载失败、404 等异常状态
5. 整体视觉质量评分 1-10

请用 JSON 格式返回：
{
  "score": <1-10的数字>,
  "issues": [<问题列表>],
  "summary": "<简短总结>",
  "details": "<详细分析>"
}`;

  const analysis = await mcp__MiniMax__understand_image({
    prompt: defaultPrompt,
    image_source: `data:image/png;base64,${base64Image}`,
  });

  // 尝试解析 JSON
  try {
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // JSON 解析失败，返回文本分析
  }

  // 返回默认结构
  return {
    score: 5,
    issues: [],
    summary: analysis.substring(0, 100),
    details: analysis,
  };
}

/**
 * 检测两个截图的视觉差异
 */
export async function compareScreenshots(
  baselinePath: string,
  currentPath: string
): Promise<VisualDiffResult> {
  const baselineBuffer = fs.readFileSync(baselinePath);
  const currentBuffer = fs.readFileSync(currentPath);

  // 检查文件是否相同大小（简单差异检测）
  const hasDifference = baselineBuffer.length !== currentBuffer.length;

  await mcp__MiniMax__understand_image({
    prompt: '描述这个页面截图的整体状态',
    image_source: `data:image/png;base64,${baselineBuffer.toString('base64')}`,
  });

  const currentAnalysis = await mcp__MiniMax__understand_image({
    prompt: '分析这个截图与之前版本相比是否有视觉差异，如布局变化、元素增减等',
    image_source: `data:image/png;base64,${currentBuffer.toString('base64')}`,
  });

  // 简单判断
  let severity: 'none' | 'minor' | 'moderate' | 'severe' = 'none';
  if (hasDifference) {
    if (currentAnalysis.includes('不同') || currentAnalysis.includes('变化')) {
      severity = 'minor';
    }
    if (currentAnalysis.includes('错误') || currentAnalysis.includes('缺失')) {
      severity = 'moderate';
    }
    if (currentAnalysis.includes('严重') || currentAnalysis.includes('完全')) {
      severity = 'severe';
    }
  }

  return {
    hasDifference,
    description: currentAnalysis,
    severity,
  };
}

/**
 * 验证页面关键元素存在
 */
export async function verifyPageElements(
  screenshotPath: string,
  expectedElements: string[]
): Promise<{ passed: boolean; missingElements: string[] }> {
  const imageBuffer = fs.readFileSync(screenshotPath);
  const base64Image = imageBuffer.toString('base64');

  const analysis = await mcp__MiniMax__understand_image({
    prompt: `检测页面中是否存在以下元素：${expectedElements.join(', ')}。
请返回 JSON 格式：
{
  "passed": <boolean>,
  "missingElements": [<缺失的元素列表>]
}`,
    image_source: `data:image/png;base64,${base64Image}`,
  });

  try {
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // 解析失败
  }

  return {
    passed: false,
    missingElements: expectedElements,
  };
}

/**
 * 截取页面指定区域
 */
export async function captureAndAnalyze(
  page: any,
  selector: string,
  _options?: { timeout?: number; quality?: number }
): Promise<VisionAnalysisResult> {
  const screenshotPath = path.join(
    '/tmp',
    `screenshot-${Date.now()}.png`
  );

  await page.locator(selector).screenshot({ path: screenshotPath });

  const result = await analyzeScreenshot(screenshotPath);

  // 清理临时文件
  fs.unlinkSync(screenshotPath);

  return result;
}
