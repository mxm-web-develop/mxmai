/**
 * AI 测试失败分析器
 *
 * 利用 Claude Code 分析测试失败原因，生成修复建议
 */

import { Anthropic } from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';

const anthropic = new Anthropic();

export interface TestFailureContext {
  testName: string;
  errorMessage: string;
  stackTrace?: string;
  screenshotPath?: string;
  consoleLogs?: string[];
  networkLogs?: string[];
  pageUrl?: string;
  userAgent?: string;
}

export interface DiagnosisResult {
  rootCause: string;
 修复建议: string[];
  预防措施: string[];
  相关文件?: string[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * 分析测试失败原因
 */
export async function diagnoseTestFailure(
  context: TestFailureContext
): Promise<DiagnosisResult> {
  let contextDescription = `【测试信息】
测试名称: ${context.testName}
错误信息: ${context.errorMessage}
`;

  // 1. 截图视觉分析
  if (context.screenshotPath && fs.existsSync(context.screenshotPath)) {
    try {
      const { analyzeScreenshot } = await import('./vision');
      const visualAnalysis = await analyzeScreenshot(
        context.screenshotPath,
        `这是一个测试失败时的截图。请详细分析：
1. 页面上实际显示了什么内容？
2. 是否有错误提示、加载失败、空白页面？
3. UI 元素是否正常渲染？
4. 可能导致测试失败的原因？`
      );
      contextDescription += `\n【视觉分析】
评分: ${visualAnalysis.score}/10
问题: ${visualAnalysis.issues.join(', ') || '无'}
详情: ${visualAnalysis.details}
`;
    } catch (e) {
      contextDescription += `\n【视觉分析】截图分析失败\n`;
    }
  }

  // 2. 控制台日志
  if (context.consoleLogs?.length) {
    contextDescription += `\n【控制台错误】
${context.consoleLogs.slice(-30).join('\n')}
`;
  }

  // 3. 网络日志
  if (context.networkLogs?.length) {
    contextDescription += `\n【网络请求】
${context.networkLogs.slice(-10).join('\n')}
`;
  }

  // 4. 调用 Claude 进行诊断
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `作为高级测试工程师和前端开发专家，分析以下 Playwright 测试失败：

${contextDescription}

请提供：
1. 最可能的失败根因（root cause）
2. 具体修复建议（3-5 条）
3. 预防措施（如何避免类似问题）
4. 可能相关的代码文件

请用 JSON 格式返回：
{
  "rootCause": "<根因分析>",
  "修复建议": ["<建议1>", "<建议2>", ...],
  "预防措施": ["<措施1>", "<措施2>", ...],
  "相关文件": ["<文件路径>", ...],
  "confidence": "high|medium|low"
}`,
    }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    return {
      rootCause: '分析失败',
      修复建议: ['请手动检查测试失败原因'],
      预防措施: [],
      confidence: 'low',
    };
  }

  try {
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // 解析失败
  }

  return {
    rootCause: content.text.substring(0, 500),
    修复建议: ['查看完整分析输出'],
    预防措施: [],
    confidence: 'medium',
  };
}

/**
 * 生成测试报告
 */
export async function generateTestReport(
  failures: TestFailureContext[]
): Promise<string> {
  const results: DiagnosisResult[] = [];

  for (const failure of failures) {
    const diagnosis = await diagnoseTestFailure(failure);
    results.push(diagnosis);
  }

  let report = `# Playwright 测试失败报告

生成时间: ${new Date().toISOString()}
测试数量: ${failures.length}
失败数量: ${results.length}

---

`;

  for (let i = 0; i < failures.length; i++) {
    const failure = failures[i];
    const diagnosis = results[i];

    report += `## 测试 ${i + 1}: ${failure.testName}

**错误信息**: ${failure.errorMessage}

**根因分析** (置信度: ${diagnosis.confidence}):
${diagnosis.rootCause}

**修复建议**:
${diagnosis.修复建议.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

**预防措施**:
${diagnosis.预防措施.map((s, idx) => `- ${s}`).join('\n')}

${diagnosis.相关文件 ? `**相关文件**: ${diagnosis.相关文件.join(', ')}` : ''}

---

`;
  }

  return report;
}
