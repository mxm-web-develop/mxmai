/**
 * Writing 核心服务
 * 处理文本生成、格式化、存储等核心逻辑
 */

import { MODEL_MAP } from '../../routes/text';
import type { ProviderType } from '../providers/types';
import { selectModel, type TaskType } from './model-selector';
import { retrieveKnowledge, formatKnowledgeContext, enhancePromptWithKnowledge, hasKnowledgeResults } from './knowledge-enhancer';
import { formatDocument, getFileExtension, getMimeType, type StorageFormat } from './document-formatter';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { taskExecutor } from '../task/task-executor';
import type { Outline, WritingGenerateParams, RewritingParams, PolishingParams, SyncToTaskParams } from './type';
import { getWritingTypeConfig, getWritingTypeRules, getWritingTypeOutputFormat } from './wtconfigs';

export interface WritingResult {
  text: string;                    // 生成的原始文本
  formattedContent: string | Buffer; // 格式化后的内容
  format: StorageFormat;
  storageInfo?: {
    key: string;
    bucket: string;
    url: string;
  };
  metadata: {
    title?: string;
    wordCount: number;
    fileSize: number;
    [key: string]: any;
  };
}

/**
 * 扩展的流式输出数据结构（支持段落位置标记）
 */
export interface WritingStreamChunk {
  chunk: string;
  status: 'streaming' | 'completed';
  collection: string;
  /** 段落位置信息（当基于大纲生成时） */
  section?: {
    uid: string;        // 段落在大纲中的 uid
    index: number;      // 段落在大纲中的顺序索引（从0开始）
    position: number;   // 在最终文章中的位置（用于前端排序）
  };
}

/**
 * 展开后的段落节点（用于生成）
 */
interface ExpandedSection {
  uid: string;
  content: string;
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];
  depth: number;  // 嵌套深度
  index: number;  // 在扁平列表中的索引
  position: number; // 在最终文章中的位置
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
  }[];
}

/**
 * 格式化大纲结构（只显示标题，不显示参数）
 */
function formatOutlineStructure(outline: Outline, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  let result = `${indent}- ${outline.content}`;
  
  // 递归处理子节点
  if (outline.children && outline.children.length > 0) {
    result += '\n' + outline.children.map(child => formatOutlineStructure(child, depth + 1)).join('\n');
  }
  
  return result;
}

/**
 * 格式化每个章节的写作指导参数（单独列出，不附加在标题后）
 */
function formatChapterGuidance(outline: Outline, chapterPath: string = ''): string[] {
  const results: string[] = [];
  const currentPath = chapterPath ? `${chapterPath} > ${outline.content}` : outline.content;
  
  const guidance: string[] = [];
  if (outline.motivation) guidance.push(`动机: ${outline.motivation}`);
  if (outline.stance) guidance.push(`立场: ${outline.stance}`);
  if (outline.tone) guidance.push(`语调: ${outline.tone}`);
  if (outline.length) guidance.push(`长度: ${outline.length}`);
  if (outline.key_elements && outline.key_elements.length > 0) {
    guidance.push(`关键要素: ${outline.key_elements.join('、')}`);
  }
  
  if (guidance.length > 0) {
    results.push(`【${currentPath}】`);
    results.push(...guidance.map(g => `  ${g}`));
    results.push('');
  }
  
  // 递归处理子节点
  if (outline.children && outline.children.length > 0) {
    outline.children.forEach(child => {
      results.push(...formatChapterGuidance(child, currentPath));
    });
  }
  
  return results;
}

/**
 * 计算总字数要求
 */
function calculateTotalLength(outlines: Outline[]): string {
  let total = 0;
  const parseLength = (len: string): number => {
    const match = len.match(/(\d+)-?(\d+)?/);
    if (match) {
      const min = parseInt(match[1]);
      const max = match[2] ? parseInt(match[2]) : min;
      return Math.floor((min + max) / 2);
    }
    return 0;
  };
  
  const traverse = (outline: Outline) => {
    if (outline.length) {
      total += parseLength(outline.length);
    }
    if (outline.children) {
      outline.children.forEach(traverse);
    }
  };
  
  outlines.forEach(traverse);
  return total > 0 ? `约 ${total} 字` : '';
}

/**
 * 递归展开大纲为扁平列表（包括所有节点，包括有 children 的）
 * 每一段都按照自己的配置进行生成，如果该层没有配置则只生成标题，无实际内容
 */
function expandOutlinesToSections(
  outlines: Outline[],
  depth: number = 0,
  startIndex: number = 0
): ExpandedSection[] {
  const sections: ExpandedSection[] = [];
  let currentIndex = startIndex;

  for (const outline of outlines) {
    const section: ExpandedSection = {
      uid: outline.uid,
      content: outline.content,
      motivation: outline.motivation,
      stance: outline.stance,
      tone: outline.tone,
      length: outline.length,
      key_elements: outline.key_elements,
      depth,
      index: currentIndex,
      position: currentIndex,
      knowledgeBase: outline.knowledgeBase,
    };
    sections.push(section);
    currentIndex++;

    // 递归处理子节点
    if (outline.children && outline.children.length > 0) {
      const childSections = expandOutlinesToSections(
        outline.children,
        depth + 1,
        currentIndex
      );
      sections.push(...childSections);
      currentIndex += childSections.length;
    }
  }

  return sections;
}

/**
 * 文本压缩函数（滑动窗口：保留最后200字 + 总结前文）
 * 如果文本超过500字，则压缩到800字以内
 */
async function compressText(
  text: string,
  maxLength: number = 500,
  provider?: ProviderType
): Promise<string> {
  // 如果文本已经在限制内，直接返回
  if (text.length <= maxLength) {
    return text;
  }

  // 计算需要保留的最后部分（200字）
  const keepLastChars = 200;
  const lastPart = text.slice(-keepLastChars);
  const firstPart = text.slice(0, text.length - keepLastChars);

  // 使用 LLM 总结压缩前文部分
  const modelName = selectModel('paragraph');
  const compressPrompt = `请将以下内容压缩总结到${maxLength - keepLastChars}字以内，保留关键信息和逻辑关系：

${firstPart}

要求：
- 保留核心观点和关键信息
- 保持逻辑连贯性
- 压缩后的内容应该能够与后续内容自然衔接
- 只返回压缩后的文本，不要添加任何说明或标记`;

  try {
    const compressedFirstPart = await generateText(modelName, compressPrompt, provider);
    return compressedFirstPart.trim() + lastPart;
  } catch (error) {
    console.error('[WritingService] 文本压缩失败，使用截断方式:', error);
    // 如果压缩失败，使用简单截断（保留最后部分）
    return text.slice(-maxLength);
  }
}

/**
 * 从任务系统获取之前的文本内容
 */
async function getPreviousContentFromTask(taskId: string, userId?: string): Promise<string | null> {
  try {
    const taskManager = taskExecutor.getTaskManager();
    const { task } = await taskManager.getTask(taskId);

    // 权限校验
    if (userId && task.metadata?.userId !== userId) {
      throw new Error('无权访问该任务');
    }

    // 从任务结果中提取文本
    if (task.result?.metadata?.text) {
      return task.result.metadata.text;
    }

    // 如果有存储信息，尝试从 MinIO 读取
    if (task.result?.storageInfo) {
      const storageRepo = RepositoryFactory.createStorageRepository();
      const { bucket, keys } = task.result.storageInfo;
      if (keys && keys.length > 0) {
        const fileBuffer = await storageRepo.downloadFile(bucket, keys[0]);
        return fileBuffer.toString('utf-8');
      }
    }

    return null;
  } catch (error) {
    console.error(`[WritingService] 获取任务内容失败 (taskId: ${taskId}):`, error);
    return null;
  }
}

/**
 * 生成文本（调用 LLM）- 同步模式
 */
async function generateText(
  modelName: string,
  prompt: string,
  provider?: ProviderType,
  llmParams?: Record<string, any>
): Promise<string> {
  const model = MODEL_MAP[modelName];
  if (!model) {
    throw new Error(`模型 "${modelName}" 不存在`);
  }

  const result = await model.generate({
    prompt,
    outputFormat: 'json', // 强制使用 JSON 格式获取完整文本
    ...llmParams,
  }, provider);

  if (!result.text) {
    throw new Error('LLM 生成结果为空');
  }

  return result.text;
}

/**
 * 生成文本（调用 LLM）- 流式模式
 */
async function generateTextStream(
  modelName: string,
  prompt: string,
  provider?: ProviderType,
  llmParams?: Record<string, any>
): Promise<AsyncIterable<any>> {
  const model = MODEL_MAP[modelName];
  if (!model) {
    throw new Error(`模型 "${modelName}" 不存在`);
  }

  const result = await model.generate({
    prompt,
    outputFormat: 'stream', // 使用流式输出
    enableCollection: false, // 禁用 collection 累积，节省内存和带宽
    ...llmParams,
  }, provider);

  if (result.stream) {
    return result.stream;
  } else if (result.streamString) {
    // 兼容旧格式：将 streamString 转换为 stream 格式
    return (async function* () {
      for await (const chunk of result.streamString!) {
        yield { chunk, status: 'streaming' as const, collection: '' };
      }
      yield { chunk: '', status: 'completed' as const, collection: '' };
    })();
  } else {
    throw new Error('LLM 不支持流式输出');
  }
}

/**
 * 生成大纲
 */
/**
 * 生成大纲（流式模式）
 */
export async function* generateOutlineStream(
  params: {
    uid: string;
    prompt: string;
    maxDepth?: number;
    expectedNodes?: number;
    knowledgeBase?: Array<{
      knowledgeBaseId: string;
      query: string;
      limit?: number;
    }>;
  },
  userId?: string,
  provider?: ProviderType
): AsyncGenerator<{ chunk: string; status: 'streaming' | 'completed'; collection: string }, void, unknown> {
  // 1. 选择模型（大纲生成使用 outline 类型）
  const modelName = selectModel('outline');

  // 2. 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 3. 构建大纲生成的 prompt
  const outlinePrompt = `请根据以下要求生成一个写作大纲：

${enhancedPrompt}

要求：
- 大纲层级深度：${params.maxDepth || 3} 级
${params.expectedNodes ? `- 期望节点总数：约 ${params.expectedNodes} 个` : ''}
- 每个节点需要包含：content（标题内容）、motivation（写作动机，可选）、stance（立场，可选）、tone（语调，可选）、length（长度要求，可选）、key_elements（关键要素，可选）
- 返回 JSON 格式，包含 uid、content 和可选的 children 数组（嵌套结构）

请返回一个有效的 JSON 对象，格式如下：
{
  "uid": "${params.uid}",
  "content": "主标题",
  "children": [
    {
      "uid": "sub_1",
      "content": "子标题1",
      "children": [...]
    }
  ]
}`;

  // 4. 调用 LLM 生成（流式）
  const stream = await generateTextStream(modelName, outlinePrompt, provider);

  // 5. 返回流式结果
  for await (const chunk of stream) {
    yield chunk;
  }
}

export async function generateOutline(
  params: {
    uid: string;
    prompt: string;
    maxDepth?: number;
    expectedNodes?: number;
    knowledgeBase?: Array<{
      knowledgeBaseId: string;
      query: string;
      limit?: number;
    }>;
  },
  userId?: string,
  provider?: ProviderType
): Promise<Outline> {
  // 1. 选择模型（大纲生成使用 outline 类型）
  const modelName = selectModel('outline');

  // 2. 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 3. 构建大纲生成的 prompt
  const outlinePrompt = `请根据以下要求生成一个写作大纲：

${enhancedPrompt}

要求：
- 大纲层级深度：${params.maxDepth || 3} 级
${params.expectedNodes ? `- 期望节点总数：约 ${params.expectedNodes} 个` : ''}
- 每个节点需要包含：content（标题内容）、motivation（写作动机，可选）、stance（立场，可选）、tone（语调，可选）、length（长度要求，可选）、key_elements（关键要素，可选）
- 返回 JSON 格式，包含 uid、content 和可选的 children 数组（嵌套结构）

请返回一个有效的 JSON 对象，格式如下：
{
  "uid": "${params.uid}",
  "content": "主标题",
  "children": [
    {
      "uid": "sub_1",
      "content": "子标题1",
      "children": [...]
    }
  ]
}`;

  // 4. 调用 LLM 生成
  const resultText = await generateText(modelName, outlinePrompt, provider);

  // 5. 解析 JSON 结果
  try {
    // 尝试提取 JSON（可能包含 markdown 代码块）
    let jsonText = resultText.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const outline = JSON.parse(jsonText) as Outline;
    
    // 确保 uid 正确
    if (!outline.uid) {
      outline.uid = params.uid;
    }

    return outline;
  } catch (error) {
    console.error('[WritingService] 解析大纲 JSON 失败:', error);
    throw new Error(`大纲生成失败：无法解析 JSON 结果。原始结果：${resultText.substring(0, 200)}...`);
  }
}

/**
 * 并行模式：生成公用总结 + 并行生成各段落
 */
async function* generateWritingParallel(
  sections: ExpandedSection[],
  params: WritingGenerateParams,
  userId: string | undefined,
  provider: ProviderType | undefined,
  enhancedPrompt: string,
  hasGlobalKnowledgeInPrompt: boolean = false
): AsyncGenerator<WritingStreamChunk, void, unknown> {
  const modelName = selectModel('paragraph');
  const enableMarkdown = params.enable_markdown !== false;

  // 第一步：生成公用总结（500字内）
  const summaryPrompt = `请根据以下大纲生成一个800字以内的总结，作为整篇文章的公用引用和背景信息：

${sections.map(s => `- ${s.content}`).join('\n')}

要求：
- 总结应该涵盖所有章节的核心主题
- 提供整篇文章的背景和总体框架
- 控制在800字以内
- 只返回总结文本，不要添加任何标记`;

  let sharedSummary = '';
  try {
    sharedSummary = await generateText(modelName, summaryPrompt, provider);
    // 输出总结（作为第一个段落，index: -1 表示总结）
    yield {
      chunk: `<section uid="summary" index="-1" position="0">${sharedSummary}</section>`,
      status: 'completed',
      collection: '',
      section: { uid: 'summary', index: -1, position: 0 },
    };
  } catch (error) {
    console.error('[WritingService] 生成公用总结失败:', error);
    // 继续执行，即使总结失败
  }

  // 第二步：并行生成各段落
  const sectionPromises = sections.map(async (section) => {
    try {
      // 构建段落 prompt
      const sectionGuidance: string[] = [];
      if (section.motivation) sectionGuidance.push(`动机: ${section.motivation}`);
      if (section.stance) sectionGuidance.push(`立场: ${section.stance}`);
      if (section.tone) sectionGuidance.push(`语调: ${section.tone}`);
      if (section.length) sectionGuidance.push(`长度: ${section.length}`);
      if (section.key_elements && section.key_elements.length > 0) {
        sectionGuidance.push(`关键要素: ${section.key_elements.join('、')}`);
      }

      // 检索知识库（优先使用段落配置，否则使用全局配置）
      let sectionKnowledgeContext = '';
      let hasKnowledge = false;
      const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
      const processStyle = params.process_style || 'silent';
      
      if (knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
        const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
        hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
        sectionKnowledgeContext = formatKnowledgeContext(knowledgeResults, knowledgeBaseConfig);
        
        // 严格模式：如果没有召回，抛出错误
        if (processStyle === 'strict' && !hasKnowledge) {
          throw new Error('没有相关的知识内容');
        }
      }

      // 解释模式：如果没有知识库内容，在 prompt 中添加说明
      const explainNote = processStyle === 'explain' && !hasKnowledge 
        ? '\n⚠️ 注意：当前没有找到相关的专业知识库内容，请在回答开头使用"我们没有相关的专业知识，但是根据我的了解"作为开头，然后继续回答。'
        : '';

      // 获取写作类型配置
      const currentWritingType = params.writing_type || 'articles';
      const typeRules = getWritingTypeRules(currentWritingType);
      const typeOutputFormat = getWritingTypeOutputFormat(currentWritingType);

      const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
【段落标题】：${section.content}
${sectionGuidance.length > 0 ? `【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${sectionGuidance.join('\n')}

⚠️ 关键要求：这些参数（动机、立场、语调、长度、关键要素）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来` : ''}
${sharedSummary ? `【公用总结】（请参考）：
${sharedSummary}` : ''}
${sectionKnowledgeContext ? `【知识库内容】：
${sectionKnowledgeContext}` : ''}${explainNote}
【整体写作要求】：
${enhancedPrompt}
${typeOutputFormat ? `

---

${typeOutputFormat}` : ''}

【重要要求】：
1. **绝对禁止**：不要在生成的段落内容中输出"动机：xxx"、"立场：xxx"、"语调：xxx"、"关键要素：xxx"等参数文字
2. **正确做法**：根据写作指导参数来组织内容，让内容自然体现这些参数的要求，但不要明确说出来
3. 必须严格遵守字数要求：${section.length || '根据内容需要'}
4. 输出格式：使用 <section> </section> 包裹整个段落内容
5. ${enableMarkdown 
  ? `**Markdown 格式要求**（必须严格遵守）：
   - 段落标题必须使用 Markdown 标题语法：一级标题用 #，二级标题用 ##，三级标题用 ###
   - 根据大纲层级使用对应的标题级别（主章节用 #，子章节用 ##，子子章节用 ###）
   - 列表必须使用 Markdown 列表语法：无序列表用 - 或 *，有序列表用 1. 2. 3.
   - 可以使用引用（>）、代码块（\`\`\`）、表格（|）等 Markdown 语法
   - 段落之间使用空行分隔
   - 在 <section> 标签内的内容必须使用完整的 Markdown 格式` 
  : `**纯文本格式要求**：
   - 不使用任何 Markdown 语法
   - 只使用空格和换行符进行格式化
   - 标题使用空行分隔，不使用 # 等符号
   - 列表使用数字或符号，但不要使用 Markdown 列表语法`}
6. 如果该段落没有配置（无 motivation、stance、tone、length、key_elements），则只生成标题，无实际内容

请开始生成段落正文（不要输出任何参数说明）：`;

      // 使用流式生成段落，实时输出
      const stream = await generateTextStream(modelName, sectionPrompt, provider);
      let sectionContent = '';
      const chunks: WritingStreamChunk[] = [];
      
      for await (const chunk of stream) {
        sectionContent += chunk.chunk || '';
        chunks.push({
          chunk: chunk.chunk || '',
          status: chunk.status || 'streaming',
          collection: chunk.collection || '',
          section: {
            uid: section.uid,
            index: section.index,
            position: section.position,
          },
        });
      }
      
      // 提取 section 标签内的内容
      const sectionMatch = sectionContent.match(/<section[^>]*>([\s\S]*?)<\/section>/);
      let finalContent = sectionMatch ? sectionMatch[1].trim() : sectionContent.trim();
      
      // 解释模式：如果没有知识库内容，在结果前添加说明前缀
      if (processStyle === 'explain' && !hasKnowledge) {
        const explainPrefix = '我们没有相关的专业知识，但是根据我的了解，';
        // 检查是否已经包含前缀，避免重复
        if (!finalContent.startsWith(explainPrefix)) {
          finalContent = explainPrefix + finalContent;
        }
      }
      
      // 添加完成标记
      chunks.push({
        chunk: '',
        status: 'completed',
        collection: '',
        section: {
          uid: section.uid,
          index: section.index,
          position: section.position,
        },
      });
      
      return {
        section,
        content: finalContent || section.content,
        chunks,
        success: true,
      };
    } catch (error) {
      console.error(`[WritingService] 段落生成失败 (uid: ${section.uid}):`, error);
      // 返回错误内容
      return {
        section,
        content: `[错误：段落生成失败 - ${error instanceof Error ? error.message : String(error)}]`,
        chunks: [{
          chunk: `[错误：段落生成失败 - ${error instanceof Error ? error.message : String(error)}]`,
          status: 'completed' as const,
          collection: '',
          section: {
            uid: section.uid,
            index: section.index,
            position: section.position,
          },
        }],
        success: false,
      };
    }
  });

  // 等待所有段落生成完成（并行执行）
  const results = await Promise.allSettled(sectionPromises);
  
  // 收集所有段落的 chunks，按 position 排序
  const allChunks: Array<{ position: number; chunk: WritingStreamChunk }> = [];
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { chunks } = result.value;
      for (const chunk of chunks) {
        if (chunk.section) {
          allChunks.push({ position: chunk.section.position, chunk });
        }
      }
    }
  }
  
  // 按 position 排序，但保持每个段落内部的流式顺序
  // 使用一个更智能的合并策略：轮询输出各段落的 chunks
  const sectionChunks = new Map<number, WritingStreamChunk[]>();
  for (const { position, chunk } of allChunks) {
    if (!sectionChunks.has(position)) {
      sectionChunks.set(position, []);
    }
    sectionChunks.get(position)!.push(chunk);
  }
  
  // 轮询输出：每次从每个段落取一个 chunk，直到所有段落输出完成
  const maxLength = Math.max(...Array.from(sectionChunks.values()).map(chunks => chunks.length));
  
  for (let i = 0; i < maxLength; i++) {
    // 按 position 顺序输出当前轮次的 chunks
    const sortedPositions = Array.from(sectionChunks.keys()).sort((a, b) => a - b);
    for (const position of sortedPositions) {
      const chunks = sectionChunks.get(position)!;
      if (i < chunks.length) {
        yield chunks[i];
      }
    }
  }
}

/**
 * 流水形模式：按顺序递归生成段落
 */
async function* generateWritingSequential(
  sections: ExpandedSection[],
  params: WritingGenerateParams,
  userId: string | undefined,
  provider: ProviderType | undefined,
  enhancedPrompt: string,
  hasGlobalKnowledgeInPrompt: boolean = false
): AsyncGenerator<WritingStreamChunk, void, unknown> {
  const modelName = selectModel('paragraph');
  const enableMarkdown = params.enable_markdown !== false;
  let previousMemory = ''; // 前文记忆

  for (const section of sections) {
    try {
      // 如果前文超过500字，压缩记忆
      if (previousMemory.length > 500) {
        previousMemory = await compressText(previousMemory, 500, provider);
      }

      // 构建段落 prompt
      const sectionGuidance: string[] = [];
      if (section.motivation) sectionGuidance.push(`动机: ${section.motivation}`);
      if (section.stance) sectionGuidance.push(`立场: ${section.stance}`);
      if (section.tone) sectionGuidance.push(`语调: ${section.tone}`);
      if (section.length) sectionGuidance.push(`长度: ${section.length}`);
      if (section.key_elements && section.key_elements.length > 0) {
        sectionGuidance.push(`关键要素: ${section.key_elements.join('、')}`);
      }

      // 检索知识库（优先使用段落配置，否则使用全局配置）
      let sectionKnowledgeContext = '';
      let hasKnowledge = false;
      const hasSectionKnowledge = section.knowledgeBase && section.knowledgeBase.length > 0;
      const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
      const processStyle = params.process_style || 'silent';
      
      // 只有当段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中时，才检索和显示知识库
      if (knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
        // 如果段落没有段落级配置，且全局知识库已经整合到 enhancedPrompt 中，则跳过
        if (!hasSectionKnowledge && hasGlobalKnowledgeInPrompt) {
          // 仍然需要检查是否有知识（用于 process_style 判断），但不显示在段落 prompt 中
          const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
          hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
          
          // 严格模式：如果没有召回，抛出错误
          if (processStyle === 'strict' && !hasKnowledge) {
            throw new Error('没有相关的知识内容');
          }
        } else {
          // 段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中，正常检索和显示
          const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
          hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
          sectionKnowledgeContext = formatKnowledgeContext(knowledgeResults, knowledgeBaseConfig);
          
          // 严格模式：如果没有召回，抛出错误
          if (processStyle === 'strict' && !hasKnowledge) {
            throw new Error('没有相关的知识内容');
          }
        }
      }

      // 解释模式：如果没有知识库内容，在 prompt 中添加说明
      const explainNote = processStyle === 'explain' && !hasKnowledge 
        ? '\n⚠️ 注意：当前没有找到相关的专业知识库内容，请在回答开头使用"我们没有相关的专业知识，但是根据我的了解"作为开头，然后继续回答。'
        : '';

      // 获取写作类型配置
      const currentWritingType = params.writing_type || 'articles';
      const typeRules = getWritingTypeRules(currentWritingType);
      const typeOutputFormat = getWritingTypeOutputFormat(currentWritingType);

      const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
【段落标题】：${section.content}
${sectionGuidance.length > 0 ? `【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${sectionGuidance.join('\n')}

⚠️ 关键要求：这些参数（动机、立场、语调、长度、关键要素）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来` : ''}
${previousMemory ? `【前文记忆】（请参考，保持连贯性）：
${previousMemory}` : ''}
${sectionKnowledgeContext ? `【知识库内容】：
${sectionKnowledgeContext}` : ''}${explainNote}
【整体写作要求】：
${enhancedPrompt}
${typeOutputFormat ? `

---

${typeOutputFormat}` : ''}

【重要要求】：
1. **绝对禁止**：不要在生成的段落内容中输出"动机：xxx"、"立场：xxx"、"语调：xxx"、"关键要素：xxx"等参数文字
2. **正确做法**：根据写作指导参数来组织内容，让内容自然体现这些参数的要求，但不要明确说出来
3. 必须严格遵守字数要求：${section.length || '根据内容需要'}
4. 输出格式：使用 <section> </section> 包裹整个段落内容
5. ${enableMarkdown 
  ? '使用标准 Markdown 格式（标题、列表、引用等）' 
  : '输出纯文本格式（只有空格和换行，不使用 Markdown 语法）'}
6. 如果该段落没有配置（无 motivation、stance、tone、length、key_elements），则只生成标题，无实际内容
7. 与前文保持逻辑连贯，自然过渡

请开始生成段落正文（不要输出任何参数说明）：`;

      // 流式生成段落
      const stream = await generateTextStream(modelName, sectionPrompt, provider);
      let sectionContent = '';
      let isFirstChunk = true;
      
      for await (const chunk of stream) {
        sectionContent += chunk.chunk || '';
        
        // 解释模式：第一个 chunk 需要添加前缀
        let chunkContent = chunk.chunk || '';
        if (processStyle === 'explain' && !hasKnowledge && isFirstChunk && chunkContent) {
          const explainPrefix = '我们没有相关的专业知识，但是根据我的了解，';
          if (!chunkContent.startsWith(explainPrefix)) {
            chunkContent = explainPrefix + chunkContent;
            isFirstChunk = false;
          }
        }
        
        // 实时输出流式内容
        yield {
          chunk: chunkContent,
          status: chunk.status || 'streaming',
          collection: chunk.collection || '',
          section: {
            uid: section.uid,
            index: section.index,
            position: section.position,
          },
        };
      }
      
      // 提取 section 标签内的内容
      const sectionMatch = sectionContent.match(/<section[^>]*>([\s\S]*?)<\/section>/);
      let finalContent = sectionMatch ? sectionMatch[1].trim() : sectionContent.trim();
      
      // 解释模式：如果没有知识库内容，在结果前添加说明前缀（流式输出时可能已经添加，这里确保添加）
      if (processStyle === 'explain' && !hasKnowledge) {
        const explainPrefix = '我们没有相关的专业知识，但是根据我的了解，';
        if (!finalContent.startsWith(explainPrefix)) {
          finalContent = explainPrefix + finalContent;
        }
      }
      
      // 更新记忆（添加当前段落）
      if (previousMemory) {
        previousMemory += '\n\n' + finalContent;
      } else {
        previousMemory = finalContent;
      }

      // 标记段落完成
      yield {
        chunk: '',
        status: 'completed',
        collection: '',
        section: {
          uid: section.uid,
          index: section.index,
          position: section.position,
        },
      };
    } catch (error) {
      console.error(`[WritingService] 段落生成失败 (uid: ${section.uid}):`, error);
      // 输出错误内容，继续生成下一段
      yield {
        chunk: `[错误：段落生成失败 - ${error instanceof Error ? error.message : String(error)}]`,
        status: 'completed',
        collection: '',
        section: {
          uid: section.uid,
          index: section.index,
          position: section.position,
        },
      };
    }
  }
}

/**
 * 生成文章（流式模式）
 */
export async function* generateWritingStream(
  params: WritingGenerateParams,
  userId?: string,
  provider?: ProviderType
): AsyncGenerator<WritingStreamChunk, void, unknown> {
  // 1. 获取之前的文本内容（如果有）
  let previousContent: string | null = null;
  if (params.previous_content) {
    previousContent = params.previous_content;
  } else if (params.previous_task) {
    previousContent = await getPreviousContentFromTask(params.previous_task, userId);
  }

  // 2. 检索全局知识库内容（如果有，用于没有段落级配置的情况）
  let enhancedPrompt = params.prompt;
  let knowledgeResults: Map<string, any[]> | null = null;
  let hasKnowledge = true; // 默认认为有知识（如果没有配置知识库）
  
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    // 检查是否有段落级知识库配置，如果没有则使用全局配置
    const hasSectionKnowledge = params.outlines?.some(outline => 
      outline.knowledgeBase && outline.knowledgeBase.length > 0
    );
    if (!hasSectionKnowledge) {
      knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
      hasKnowledge = hasKnowledgeResults(knowledgeResults, params.knowledgeBase);
      const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
      enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
    }
  }

  // 3. 如果有大纲，使用新的多段生成模式
  if (params.outlines && params.outlines.length > 0) {
    // 展开大纲为扁平列表
    const sections = expandOutlinesToSections(params.outlines);
    
    // 确定生成模式
    let generationMode = params.generation_mode || 'parallel';
    if (generationMode === 'auto') {
      // auto 模式：大纲节点 < 5 个用 sequential，>= 5 个用 parallel
      generationMode = sections.length < 5 ? 'sequential' : 'parallel';
    }

    // 判断 enhancedPrompt 是否已经包含全局知识库内容
    // 如果有全局知识库且没有段落级配置，enhancedPrompt 会包含知识库内容
    const hasGlobalKnowledgeInPrompt = !!(params.knowledgeBase && params.knowledgeBase.length > 0 && 
      !params.outlines?.some(outline => outline.knowledgeBase && outline.knowledgeBase.length > 0));

    // 根据模式选择生成函数
    if (generationMode === 'parallel') {
      // 并行模式
      yield* generateWritingParallel(sections, params, userId, provider, enhancedPrompt, hasGlobalKnowledgeInPrompt);
    } else {
      // 流水形模式
      yield* generateWritingSequential(sections, params, userId, provider, enhancedPrompt, hasGlobalKnowledgeInPrompt);
    }
    return;
  }

  // 4. 如果没有大纲，使用原有的单次生成模式
  // 4.1. 检查 process_style（在调用 LLM 之前）
  if (!params.outlines || params.outlines.length === 0) {
    if (params.knowledgeBase && params.knowledgeBase.length > 0) {
      const processStyle = params.process_style || 'silent';
      if (processStyle === 'strict' && !hasKnowledge) {
        throw new Error('没有相关的知识内容');
      }
    }
  }

  const taskType: TaskType = 'full';
  const modelName = selectModel(taskType);

  // 5. 构建生成 prompt（无大纲时的单次生成）
  // 获取写作类型配置
  const currentWritingType = params.writing_type || 'articles';
  const typeRules = getWritingTypeRules(currentWritingType);
  const typeOutputFormat = getWritingTypeOutputFormat(currentWritingType);

  let generatePrompt = enhancedPrompt;
  
  // 整合写作类型配置的 rules
  if (typeRules) {
    generatePrompt = `${typeRules}

---

${generatePrompt}`;
  }
  
  // 解释模式：如果没有知识库内容，在 prompt 中添加说明（仅在没有大纲的情况下）
  if (!params.outlines || params.outlines.length === 0) {
    if (params.knowledgeBase && params.knowledgeBase.length > 0) {
      const processStyle = params.process_style || 'silent';
      if (processStyle === 'explain' && !hasKnowledge) {
        generatePrompt = `${generatePrompt}

⚠️ 注意：当前没有找到相关的专业知识库内容，请在回答开头使用"我们没有相关的专业知识，但是根据我的了解"作为开头，然后继续回答。`;
      }
    }
    
    // 添加全局写作参数（仅在没有大纲的情况下）
    const writingGuidance: string[] = [];
    if (params.motivation) writingGuidance.push(`动机: ${params.motivation}`);
    if (params.stance) writingGuidance.push(`立场: ${params.stance}`);
    if (params.tone) writingGuidance.push(`语调: ${params.tone}`);
    if (params.length) writingGuidance.push(`长度: ${params.length}`);
    if (params.key_elements && params.key_elements.length > 0) {
      writingGuidance.push(`关键要素: ${params.key_elements.join('、')}`);
    }
    
    if (writingGuidance.length > 0) {
      generatePrompt = `${generatePrompt}

【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${writingGuidance.join('\n')}

⚠️ 关键要求：这些参数（动机、立场、语调、长度、关键要素）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来`;
    }
  }
  
  if (params.enable_markdown === false) {
    generatePrompt = `${generatePrompt}

【格式要求】：
- 输出纯文本格式（不使用任何 Markdown 语法）
- 只使用空格和换行符进行格式化
- 标题使用空行分隔，不使用 # 等符号
- 列表使用数字或符号，但不要使用 Markdown 列表语法
- 保持段落清晰，逻辑连贯`;
  } else {
    generatePrompt = `${generatePrompt}

【格式要求】：
- 使用标准 Markdown 格式输出
- 可以使用标题（#）、列表（- 或 1.）、引用（>）、表格（|）、代码块（\`\`\`）等 Markdown 语法
- 保持段落清晰，逻辑连贯`;
  }

  // 整合写作类型配置的 outputformat
  if (typeOutputFormat) {
    generatePrompt = `${generatePrompt}

---

${typeOutputFormat}`;
  }

  // 如果有之前的内容，加入上下文
  if (previousContent) {
    generatePrompt = `请基于以下原文进行写作：

原文：
${previousContent}

---
${generatePrompt}`;
  }

  // 5. 调用 LLM 生成（流式）
  const stream = await generateTextStream(modelName, generatePrompt, provider);

  // 6. 返回流式结果（转换为新的数据结构）
  for await (const chunk of stream) {
    yield {
      chunk: chunk.chunk || '',
      status: chunk.status || 'streaming',
      collection: chunk.collection || '',
    };
  }
}

/**
 * 进度回调函数类型
 */
export type ProgressCallback = (progress: number, message: string) => Promise<void> | void;

/**
 * 生成文章（同步模式）
 */
export async function generateWriting(
  params: WritingGenerateParams,
  userId?: string,
  provider?: ProviderType,
  onProgress?: ProgressCallback
): Promise<WritingResult> {
  // 1. 获取之前的文本内容（如果有）
  let previousContent: string | null = null;
  if (params.previous_content) {
    previousContent = params.previous_content;
  } else if (params.previous_task) {
    previousContent = await getPreviousContentFromTask(params.previous_task, userId);
  }

  // 2. 检索全局知识库内容（如果有，用于没有段落级配置的情况）
  let enhancedPrompt = params.prompt;
  let knowledgeResults: Map<string, any[]> | null = null;
  let hasKnowledge = true; // 默认认为有知识（如果没有配置知识库）
  
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    // 检查是否有段落级知识库配置，如果没有则使用全局配置
    const hasSectionKnowledge = params.outlines?.some(outline => 
      outline.knowledgeBase && outline.knowledgeBase.length > 0
    );
    if (!hasSectionKnowledge) {
      knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
      hasKnowledge = hasKnowledgeResults(knowledgeResults, params.knowledgeBase);
      const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
      enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
    }
  }

  // 3. 如果有大纲，使用新的多段生成模式
  if (params.outlines && params.outlines.length > 0) {
    // 展开大纲为扁平列表
    const sections = expandOutlinesToSections(params.outlines);
    
    if (onProgress) {
      await onProgress(20, `已展开大纲，共 ${sections.length} 个段落`);
    }
    
    // 确定生成模式
    let generationMode = params.generation_mode || 'parallel';
    if (generationMode === 'auto') {
      // auto 模式：大纲节点 < 5 个用 sequential，>= 5 个用 parallel
      generationMode = sections.length < 5 ? 'sequential' : 'parallel';
    }

    // 收集所有段落内容
    const sectionContents: Array<{ position: number; content: string }> = [];
    
    // 进度分配：30% 开始，80% 完成所有段落生成
    // 并行模式：30% 开始，35% 总结完成，35-80% 段落生成（每个段落占 (80-35)/段落数）
    // 流水形模式：30% 开始，30-80% 段落生成（每个段落占 (80-30)/段落数）
    const progressStart = 30;
    const progressEnd = 80;
    const progressPerSection = (progressEnd - progressStart) / sections.length;
    
    if (generationMode === 'parallel') {
      // 并行模式：生成公用总结 + 并行生成各段落
      const modelName = selectModel('paragraph');
      
      // 生成公用总结
      const summaryPrompt = `请根据以下大纲生成一个800字以内的总结，作为整篇文章的公用引用和背景信息：

${sections.map(s => `- ${s.content}`).join('\n')}

要求：
- 总结应该涵盖所有章节的核心主题
- 提供整篇文章的背景和总体框架
- 控制在800字以内
- 只返回总结文本，不要添加任何标记`;

      let sharedSummary = '';
      try {
        if (onProgress) {
          await onProgress(30, '开始生成公用总结...');
        }
        sharedSummary = await generateText(modelName, summaryPrompt, provider);
        if (onProgress) {
          await onProgress(35, '公用总结生成完成');
        }
      } catch (error) {
        console.error('[WritingService] 生成公用总结失败:', error);
        if (onProgress) {
          await onProgress(35, '公用总结生成失败，继续生成段落');
        }
      }

      // 并行生成各段落
      let completedSections = 0;
      const totalSections = sections.length;
      
      const sectionPromises = sections.map(async (section, index) => {
        try {
          const sectionGuidance: string[] = [];
          if (section.motivation) sectionGuidance.push(`动机: ${section.motivation}`);
          if (section.stance) sectionGuidance.push(`立场: ${section.stance}`);
          if (section.tone) sectionGuidance.push(`语调: ${section.tone}`);
          if (section.length) sectionGuidance.push(`长度: ${section.length}`);
          if (section.key_elements && section.key_elements.length > 0) {
            sectionGuidance.push(`关键要素: ${section.key_elements.join('、')}`);
          }

          // 检索知识库
          let sectionKnowledgeContext = '';
          let hasKnowledge = false;
          const hasSectionKnowledge = section.knowledgeBase && section.knowledgeBase.length > 0;
          const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
          const processStyle = params.process_style || 'silent';
          
          // 判断 enhancedPrompt 是否已经包含全局知识库内容
          const hasGlobalKnowledgeInPrompt = !!(params.knowledgeBase && params.knowledgeBase.length > 0 && 
            !params.outlines?.some(outline => outline.knowledgeBase && outline.knowledgeBase.length > 0));
          
          // 只有当段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中时，才检索和显示知识库
          if (knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
            // 如果段落没有段落级配置，且全局知识库已经整合到 enhancedPrompt 中，则跳过
            if (!hasSectionKnowledge && hasGlobalKnowledgeInPrompt) {
              // 仍然需要检查是否有知识（用于 process_style 判断），但不显示在段落 prompt 中
              const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
              hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
              
              // 严格模式：如果没有召回，抛出错误
              if (processStyle === 'strict' && !hasKnowledge) {
                throw new Error('没有相关的知识内容');
              }
            } else {
              // 段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中，正常检索和显示
              const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
              hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
              sectionKnowledgeContext = formatKnowledgeContext(knowledgeResults, knowledgeBaseConfig);
              
              // 严格模式：如果没有召回，抛出错误
              if (processStyle === 'strict' && !hasKnowledge) {
                throw new Error('没有相关的知识内容');
              }
            }
          }

          // 解释模式：如果没有知识库内容，在 prompt 中添加说明
          const explainNote = processStyle === 'explain' && !hasKnowledge 
            ? '\n⚠️ 注意：当前没有找到相关的专业知识库内容，请在回答开头使用"我们没有相关的专业知识，但是根据我的了解"作为开头，然后继续回答。'
            : '';

          // 获取写作类型配置
          const currentWritingType = params.writing_type || 'articles';
          const typeRules = getWritingTypeRules(currentWritingType);
          const typeOutputFormat = getWritingTypeOutputFormat(currentWritingType);

          const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
【段落标题】：${section.content}
${sectionGuidance.length > 0 ? `【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${sectionGuidance.join('\n')}

⚠️ 关键要求：这些参数（动机、立场、语调、长度、关键要素）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来` : ''}
${sharedSummary ? `【公用总结】（请参考）：
${sharedSummary}` : ''}
${sectionKnowledgeContext ? `【知识库内容】：
${sectionKnowledgeContext}` : ''}${explainNote}
【整体写作要求】：
${enhancedPrompt}
${typeOutputFormat ? `

---

${typeOutputFormat}` : ''}

【重要要求】：
1. **绝对禁止**：不要在生成的段落内容中输出"动机：xxx"、"立场：xxx"、"语调：xxx"、"关键要素：xxx"等参数文字
2. **正确做法**：根据写作指导参数来组织内容，让内容自然体现这些参数的要求，但不要明确说出来
3. 必须严格遵守字数要求：${section.length || '根据内容需要'}
4. 输出格式：使用 <section> </section> 包裹整个段落内容
5. ${params.enable_markdown !== false 
  ? `**Markdown 格式要求**（必须严格遵守）：
   - 段落标题必须使用 Markdown 标题语法：一级标题用 #，二级标题用 ##，三级标题用 ###
   - 根据大纲层级使用对应的标题级别（主章节用 #，子章节用 ##，子子章节用 ###）
   - 列表必须使用 Markdown 列表语法：无序列表用 - 或 *，有序列表用 1. 2. 3.
   - 可以使用引用（>）、代码块（\`\`\`）、表格（|）等 Markdown 语法
   - 段落之间使用空行分隔
   - 在 <section> 标签内的内容必须使用完整的 Markdown 格式` 
  : `**纯文本格式要求**：
   - 不使用任何 Markdown 语法
   - 只使用空格和换行符进行格式化
   - 标题使用空行分隔，不使用 # 等符号
   - 列表使用数字或符号，但不要使用 Markdown 列表语法`}
6. 如果该段落没有配置（无 motivation、stance、tone、length、key_elements），则只生成标题，无实际内容

请开始生成段落正文（不要输出任何参数说明）：`;

          const sectionText = await generateText(modelName, sectionPrompt, provider);
          const sectionMatch = sectionText.match(/<section[^>]*>([\s\S]*?)<\/section>/);
          let content = sectionMatch ? sectionMatch[1].trim() : sectionText.trim();
          
          // 解释模式：如果没有知识库内容，在结果前添加说明前缀
          if (processStyle === 'explain' && !hasKnowledge) {
            const explainPrefix = '我们没有相关的专业知识，但是根据我的了解，';
            if (!content.startsWith(explainPrefix)) {
              content = explainPrefix + content;
            }
          }
          
          // 更新进度（使用原子操作避免竞态条件）
          const currentCompleted = ++completedSections;
          if (onProgress) {
            const currentProgress = Math.min(
              progressStart + 5 + Math.floor((currentCompleted / totalSections) * (progressEnd - progressStart - 5)),
              progressEnd
            );
            await onProgress(
              currentProgress,
              `段落生成进度: ${currentCompleted}/${totalSections} (${section.content})`
            );
          }
          
          return {
            position: section.position,
            content: content || section.content,
          };
        } catch (error) {
          console.error(`[WritingService] 段落生成失败 (uid: ${section.uid}):`, error);
          return {
            position: section.position,
            content: `[错误：段落生成失败 - ${error instanceof Error ? error.message : String(error)}]`,
          };
        }
      });

      const results = await Promise.allSettled(sectionPromises);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          sectionContents.push(result.value);
        }
      }
      
      if (onProgress) {
        await onProgress(progressEnd, `所有段落生成完成 (${sections.length} 个段落)`);
      }
    } else {
      // 流水形模式：按顺序递归生成段落
      const modelName = selectModel('paragraph');
      let previousMemory = '';

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        try {
          // 更新进度
          if (onProgress) {
            const currentProgress = Math.min(
              progressStart + Math.floor((i + 1) * progressPerSection),
              progressEnd
            );
            await onProgress(
              currentProgress,
              `正在生成段落 ${i + 1}/${sections.length}: ${section.content}`
            );
          }
          
          // 压缩记忆
          if (previousMemory.length > 500) {
            previousMemory = await compressText(previousMemory, 500, provider);
          }

          const sectionGuidance: string[] = [];
          if (section.motivation) sectionGuidance.push(`动机: ${section.motivation}`);
          if (section.stance) sectionGuidance.push(`立场: ${section.stance}`);
          if (section.tone) sectionGuidance.push(`语调: ${section.tone}`);
          if (section.length) sectionGuidance.push(`长度: ${section.length}`);
          if (section.key_elements && section.key_elements.length > 0) {
            sectionGuidance.push(`关键要素: ${section.key_elements.join('、')}`);
          }

          // 检索知识库
          let sectionKnowledgeContext = '';
          let hasKnowledge = false;
          const hasSectionKnowledge = section.knowledgeBase && section.knowledgeBase.length > 0;
          const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
          const processStyle = params.process_style || 'silent';
          
          // 判断 enhancedPrompt 是否已经包含全局知识库内容
          const hasGlobalKnowledgeInPrompt = !!(params.knowledgeBase && params.knowledgeBase.length > 0 && 
            !params.outlines?.some(outline => outline.knowledgeBase && outline.knowledgeBase.length > 0));
          
          // 只有当段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中时，才检索和显示知识库
          if (knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
            // 如果段落没有段落级配置，且全局知识库已经整合到 enhancedPrompt 中，则跳过
            if (!hasSectionKnowledge && hasGlobalKnowledgeInPrompt) {
              // 仍然需要检查是否有知识（用于 process_style 判断），但不显示在段落 prompt 中
              const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
              hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
              
              // 严格模式：如果没有召回，抛出错误
              if (processStyle === 'strict' && !hasKnowledge) {
                throw new Error('没有相关的知识内容');
              }
            } else {
              // 段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中，正常检索和显示
              const knowledgeResults = await retrieveKnowledge(knowledgeBaseConfig, userId);
              hasKnowledge = hasKnowledgeResults(knowledgeResults, knowledgeBaseConfig);
              sectionKnowledgeContext = formatKnowledgeContext(knowledgeResults, knowledgeBaseConfig);
              
              // 严格模式：如果没有召回，抛出错误
              if (processStyle === 'strict' && !hasKnowledge) {
                throw new Error('没有相关的知识内容');
              }
            }
          }

          // 解释模式：如果没有知识库内容，在 prompt 中添加说明
          const explainNote = processStyle === 'explain' && !hasKnowledge 
            ? '\n⚠️ 注意：当前没有找到相关的专业知识库内容，请在回答开头使用"我们没有相关的专业知识，但是根据我的了解"作为开头，然后继续回答。'
            : '';

          // 获取写作类型配置
          const currentWritingType = params.writing_type || 'articles';
          const typeRules = getWritingTypeRules(currentWritingType);
          const typeOutputFormat = getWritingTypeOutputFormat(currentWritingType);

          const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
【段落标题】：${section.content}
${sectionGuidance.length > 0 ? `【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${sectionGuidance.join('\n')}

⚠️ 关键要求：这些参数（动机、立场、语调、长度、关键要素）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来` : ''}
${previousMemory ? `【前文记忆】（请参考，保持连贯性）：
${previousMemory}` : ''}
${sectionKnowledgeContext ? `【知识库内容】：
${sectionKnowledgeContext}` : ''}${explainNote}
【整体写作要求】：
${enhancedPrompt}
${typeOutputFormat ? `

---

${typeOutputFormat}` : ''}

【重要要求】：
1. **绝对禁止**：不要在生成的段落内容中输出"动机：xxx"、"立场：xxx"、"语调：xxx"、"关键要素：xxx"等参数文字
2. **正确做法**：根据写作指导参数来组织内容，让内容自然体现这些参数的要求，但不要明确说出来
3. 必须严格遵守字数要求：${section.length || '根据内容需要'}
4. 输出格式：使用 <section> </section> 包裹整个段落内容
5. ${params.enable_markdown !== false 
  ? `**Markdown 格式要求**（必须严格遵守）：
   - 段落标题必须使用 Markdown 标题语法：一级标题用 #，二级标题用 ##，三级标题用 ###
   - 根据大纲层级使用对应的标题级别（主章节用 #，子章节用 ##，子子章节用 ###）
   - 列表必须使用 Markdown 列表语法：无序列表用 - 或 *，有序列表用 1. 2. 3.
   - 可以使用引用（>）、代码块（\`\`\`）、表格（|）等 Markdown 语法
   - 段落之间使用空行分隔
   - 在 <section> 标签内的内容必须使用完整的 Markdown 格式` 
  : `**纯文本格式要求**：
   - 不使用任何 Markdown 语法
   - 只使用空格和换行符进行格式化
   - 标题使用空行分隔，不使用 # 等符号
   - 列表使用数字或符号，但不要使用 Markdown 列表语法`}
6. 如果该段落没有配置（无 motivation、stance、tone、length、key_elements），则只生成标题，无实际内容
7. 与前文保持逻辑连贯，自然过渡

请开始生成段落正文（不要输出任何参数说明）：`;

          const sectionText = await generateText(modelName, sectionPrompt, provider);
          const sectionMatch = sectionText.match(/<section[^>]*>([\s\S]*?)<\/section>/);
          let content = sectionMatch ? sectionMatch[1].trim() : sectionText.trim();
          
          // 解释模式：如果没有知识库内容，在结果前添加说明前缀
          if (processStyle === 'explain' && !hasKnowledge) {
            const explainPrefix = '我们没有相关的专业知识，但是根据我的了解，';
            if (!content.startsWith(explainPrefix)) {
              content = explainPrefix + content;
            }
          }
          
          sectionContents.push({
            position: section.position,
            content: content || section.content,
          });

          // 更新记忆
          if (previousMemory) {
            previousMemory += '\n\n' + content;
          } else {
            previousMemory = content;
          }
        } catch (error) {
          console.error(`[WritingService] 段落生成失败 (uid: ${section.uid}):`, error);
          sectionContents.push({
            position: section.position,
            content: `[错误：段落生成失败 - ${error instanceof Error ? error.message : String(error)}]`,
          });
        }
      }
    }

    // 按 position 排序并拼接
    sectionContents.sort((a, b) => a.position - b.position);
    const generatedText = sectionContents.map(sc => sc.content).join('\n\n');

    if (onProgress) {
      await onProgress(85, '正在格式化文档...');
    }

    // 格式化文档
    const format: StorageFormat = (params.storage_form as StorageFormat) || 'markdown';
    const formattedContent = await formatDocument(
      generatedText,
      format,
      params.metadata?.title,
      params.metadata
    );

    // 计算元数据
    const wordCount = generatedText.length;
    const fileSize = Buffer.byteLength(formattedContent.toString(), 'utf-8');

    // 存储到 MinIO（如果需要）
    let storageInfo: WritingResult['storageInfo'] = undefined;
    if (params.storeToMinio !== false) {
      if (onProgress) {
        await onProgress(90, '正在保存到 MinIO...');
      }
      const storageRepo = RepositoryFactory.createStorageRepository();
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const extension = getFileExtension(format);
      const key = `${userId || 'anonymous'}/writing/${timestamp}-${randomStr}.${extension}`;
      const bucket = 'user-media';

      await storageRepo.uploadFile(
        bucket,
        key,
        Buffer.from(formattedContent.toString(), 'utf-8'),
        {
          contentType: `${getMimeType(format)}; charset=utf-8`,
          metadata: {
            'user-id': userId || 'anonymous',
            'format': format,
            'word-count': wordCount.toString(),
          },
        }
      );

      const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 60 * 60); // 7天有效期
      storageInfo = {
        key,
        bucket,
        url,
      };
      
      if (onProgress) {
        await onProgress(95, '文件已保存到 MinIO');
      }
    }

    return {
      text: generatedText,
      formattedContent,
      format,
      storageInfo,
      metadata: {
        wordCount,
        fileSize,
        ...params.metadata,
      },
    };
  }

  // 4. 如果没有大纲，使用原有的单次生成模式
  // 4.1. 检查 process_style（在调用 LLM 之前）
  if (!params.outlines || params.outlines.length === 0) {
    if (params.knowledgeBase && params.knowledgeBase.length > 0) {
      const processStyle = params.process_style || 'silent';
      if (processStyle === 'strict' && !hasKnowledge) {
        throw new Error('没有相关的知识内容');
      }
    }
  }

  const taskType: TaskType = 'full';
  const modelName = selectModel(taskType);

  // 5. 构建生成 prompt
  let generatePrompt = enhancedPrompt;
  
  // 解释模式：如果没有知识库内容，在 prompt 中添加说明（仅在没有大纲的情况下）
  if (!params.outlines || params.outlines.length === 0) {
    if (params.knowledgeBase && params.knowledgeBase.length > 0) {
      const processStyle = params.process_style || 'silent';
      if (processStyle === 'explain' && !hasKnowledge) {
        generatePrompt = `${enhancedPrompt}

⚠️ 注意：当前没有找到相关的专业知识库内容，请在回答开头使用"我们没有相关的专业知识，但是根据我的了解"作为开头，然后继续回答。`;
      }
    }
    
    // 添加全局写作参数（仅在没有大纲的情况下）
    const writingGuidance: string[] = [];
    if (params.motivation) writingGuidance.push(`动机: ${params.motivation}`);
    if (params.stance) writingGuidance.push(`立场: ${params.stance}`);
    if (params.tone) writingGuidance.push(`语调: ${params.tone}`);
    if (params.length) writingGuidance.push(`长度: ${params.length}`);
    if (params.key_elements && params.key_elements.length > 0) {
      writingGuidance.push(`关键要素: ${params.key_elements.join('、')}`);
    }
    
    if (writingGuidance.length > 0) {
      generatePrompt = `${generatePrompt}

【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${writingGuidance.join('\n')}

⚠️ 关键要求：这些参数（动机、立场、语调、长度、关键要素）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来`;
    }
  }
  
  if (params.enable_markdown === false) {
    generatePrompt = `${generatePrompt}

【格式要求】：
- 输出纯文本格式（不使用任何 Markdown 语法）
- 只使用空格和换行符进行格式化
- 标题使用空行分隔，不使用 # 等符号
- 列表使用数字或符号，但不要使用 Markdown 列表语法
- 保持段落清晰，逻辑连贯`;
  } else {
    generatePrompt = `${generatePrompt}

【格式要求】：
- 使用标准 Markdown 格式输出
- 可以使用标题（#）、列表（- 或 1.）、引用（>）、表格（|）、代码块（\`\`\`）等 Markdown 语法
- 保持段落清晰，逻辑连贯`;
  }

  // 如果有之前的内容，加入上下文
  if (previousContent) {
    generatePrompt = `请基于以下原文进行写作：

原文：
${previousContent}

---
${generatePrompt}`;
  }

  // 5. 调用 LLM 生成
  let generatedText = await generateText(modelName, generatePrompt, provider);

  // 6. 格式化文档
  const format: StorageFormat = (params.storage_form as StorageFormat) || 'markdown';
  const formattedContent = await formatDocument(
    generatedText,
    format,
    params.metadata?.title,
    params.metadata
  );

  // 7. 计算元数据
  const wordCount = generatedText.length;
  const fileSize = Buffer.isBuffer(formattedContent)
    ? formattedContent.length
    : Buffer.byteLength(formattedContent, 'utf-8');

  // 8. 存储到 MinIO（如果需要）
  let storageInfo: WritingResult['storageInfo'] | undefined;
  if (params.storeToMinio !== false) {
    const storageRepo = RepositoryFactory.createStorageRepository();
    const bucket = process.env.CGI_STORAGE_BUCKET || 'user-media';
    const ext = getFileExtension(format);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 8);
    const key = `${userId || 'anonymous'}/writing/${timestamp}-${randomId}.${ext}`;

    // 确保内容转换为 UTF-8 编码的 Buffer
    let fileBuffer: Buffer;
    if (Buffer.isBuffer(formattedContent)) {
      fileBuffer = formattedContent;
    } else {
      // 确保字符串使用 UTF-8 编码
      fileBuffer = Buffer.from(formattedContent, 'utf-8');
    }

    // 设置正确的 Content-Type 和字符集
    const contentType = `${getMimeType(format)}; charset=utf-8`;

    await storageRepo.uploadFile(bucket, key, fileBuffer, {
      contentType,
      metadata: {
        userId: userId || 'anonymous',
        format,
        wordCount: wordCount.toString(),
        charset: 'utf-8',
        ...(params.metadata ? Object.fromEntries(
          Object.entries(params.metadata).map(([k, v]) => [k, String(v)])
        ) : {}),
      },
    });

    const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 3600); // 7天有效期

    storageInfo = {
      key,
      bucket,
      url,
    };
  }

  return {
    text: generatedText,
    formattedContent,
    format,
    storageInfo,
    metadata: {
      wordCount,
      fileSize,
      ...params.metadata,
    },
  };
}

/**
 * 改写文章（流式模式）
 */
export async function* rewriteWritingStream(
  params: RewritingParams,
  userId?: string,
  provider?: ProviderType
): AsyncGenerator<{ chunk: string; status: 'streaming' | 'completed'; collection: string }, void, unknown> {
  // 获取之前的文本内容
  let previousContent: string | null = null;
  if (params.previous_content) {
    previousContent = params.previous_content;
  } else if (params.previous_task) {
    previousContent = await getPreviousContentFromTask(params.previous_task, userId);
  }

  if (!previousContent) {
    throw new Error('改写需要提供 previous_content 或 previous_task');
  }

  // 选择模型（段落写作）
  const modelName = selectModel('paragraph');

  // 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 构建改写 prompt
  const rewritePrompt = `请基于以下原文进行改写：

原文：
${previousContent}

改写要求：
${enhancedPrompt}`;

  // 调用 LLM 生成（流式）
  const stream = await generateTextStream(modelName, rewritePrompt, provider);

  // 返回流式结果
  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * 改写文章（同步模式）
 */
export async function rewriteWriting(
  params: RewritingParams,
  userId?: string,
  provider?: ProviderType
): Promise<WritingResult> {
  // 获取之前的文本内容
  let previousContent: string | null = null;
  if (params.previous_content) {
    previousContent = params.previous_content;
  } else if (params.previous_task) {
    previousContent = await getPreviousContentFromTask(params.previous_task, userId);
  }

  if (!previousContent) {
    throw new Error('改写需要提供 previous_content 或 previous_task');
  }

  // 选择模型（段落写作）
  const modelName = selectModel('paragraph');

  // 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 构建改写 prompt
  const rewritePrompt = `请基于以下原文进行改写：

原文：
${previousContent}

改写要求：
${enhancedPrompt}`;

  // 调用 LLM 生成
  const rewrittenText = await generateText(modelName, rewritePrompt, provider);

  // 格式化（默认 Markdown）
  const formattedContent = await formatDocument(rewrittenText, 'markdown');

  const wordCount = rewrittenText.length;
  const fileSize = Buffer.isBuffer(formattedContent)
    ? formattedContent.length
    : Buffer.byteLength(formattedContent, 'utf-8');

  return {
    text: rewrittenText,
    formattedContent,
    format: 'markdown',
    metadata: {
      wordCount,
      fileSize,
    },
  };
}

/**
 * 润色文章（流式模式）
 */
export async function* polishWritingStream(
  params: PolishingParams,
  userId?: string,
  provider?: ProviderType
): AsyncGenerator<{ chunk: string; status: 'streaming' | 'completed'; collection: string }, void, unknown> {
  // 获取之前的文本内容
  let previousContent: string | null = null;
  if (params.previous_content) {
    previousContent = params.previous_content;
  } else if (params.previous_task) {
    previousContent = await getPreviousContentFromTask(params.previous_task, userId);
  }

  if (!previousContent) {
    throw new Error('润色需要提供 previous_content 或 previous_task');
  }

  // 选择模型（段落写作）
  const modelName = selectModel('paragraph');

  // 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 构建润色 prompt（包含润色参数）
  const polishRequirements: string[] = [];
  if (params.motivation) polishRequirements.push(`写作动机：${params.motivation}`);
  if (params.stance) polishRequirements.push(`立场：${params.stance}`);
  if (params.tone) polishRequirements.push(`语调：${params.tone}`);
  if (params.length) polishRequirements.push(`长度：${params.length}`);
  if (params.key_elements && params.key_elements.length > 0) {
    polishRequirements.push(`关键要素：${params.key_elements.join('、')}`);
  }

  const polishPrompt = `请对以下文章进行润色，保持原意不变：

原文：
${previousContent}

${polishRequirements.length > 0 ? `润色要求：\n${polishRequirements.join('\n')}\n\n` : ''}其他要求：
${enhancedPrompt}`;

  // 调用 LLM 生成（流式）
  const stream = await generateTextStream(modelName, polishPrompt, provider);

  // 返回流式结果
  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * 润色文章（同步模式）
 */
export async function polishWriting(
  params: PolishingParams,
  userId?: string,
  provider?: ProviderType
): Promise<WritingResult> {
  // 获取之前的文本内容
  let previousContent: string | null = null;
  if (params.previous_content) {
    previousContent = params.previous_content;
  } else if (params.previous_task) {
    previousContent = await getPreviousContentFromTask(params.previous_task, userId);
  }

  if (!previousContent) {
    throw new Error('润色需要提供 previous_content 或 previous_task');
  }

  // 选择模型（段落写作）
  const modelName = selectModel('paragraph');

  // 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 构建润色 prompt（包含润色参数）
  const polishRequirements: string[] = [];
  if (params.motivation) polishRequirements.push(`写作动机：${params.motivation}`);
  if (params.stance) polishRequirements.push(`立场：${params.stance}`);
  if (params.tone) polishRequirements.push(`语调：${params.tone}`);
  if (params.length) polishRequirements.push(`长度：${params.length}`);
  if (params.key_elements && params.key_elements.length > 0) {
    polishRequirements.push(`关键要素：${params.key_elements.join('、')}`);
  }

  const polishPrompt = `请对以下文章进行润色，保持原意不变：

原文：
${previousContent}

${polishRequirements.length > 0 ? `润色要求：\n${polishRequirements.join('\n')}\n\n` : ''}其他要求：
${enhancedPrompt}`;

  // 调用 LLM 生成
  const polishedText = await generateText(modelName, polishPrompt, provider);

  // 格式化（默认 Markdown）
  const formattedContent = await formatDocument(polishedText, 'markdown');

  const wordCount = polishedText.length;
  const fileSize = Buffer.isBuffer(formattedContent)
    ? formattedContent.length
    : Buffer.byteLength(formattedContent, 'utf-8');

  return {
    text: polishedText,
    formattedContent,
    format: 'markdown',
    metadata: {
      wordCount,
      fileSize,
    },
  };
}

/**
 * 将 stream 生成的文本同步到任务系统
 * 用于用户在接收完 stream 后，将拼接的文本保存为任务，方便后续追踪
 */
export async function syncToTask(
  params: SyncToTaskParams,
  userId: string
): Promise<{
  taskId: string;
  storageInfo?: {
    key: string;
    bucket: string;
    url: string;
  };
  metadata: {
    wordCount: number;
    fileSize: number;
    format: StorageFormat;
    [key: string]: any;
  };
}> {
  // 1. 格式化文档
  const format: StorageFormat = (params.storage_form as StorageFormat) || 'markdown';
  const formattedContent = await formatDocument(
    params.text,
    format,
    params.metadata?.title,
    params.metadata
  );

  // 2. 计算元数据
  const wordCount = params.text.length;
  const fileSize = Buffer.isBuffer(formattedContent)
    ? formattedContent.length
    : Buffer.byteLength(formattedContent, 'utf-8');

  // 3. 存储到 MinIO（如果需要）
  let storageInfo: WritingResult['storageInfo'] | undefined;
  if (params.storeToMinio !== false) {
    const storageRepo = RepositoryFactory.createStorageRepository();
    const bucket = process.env.CGI_STORAGE_BUCKET || 'user-media';
    const ext = getFileExtension(format);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 8);
    const key = `${userId}/writing/${timestamp}-${randomId}.${ext}`;

    // 确保内容转换为 UTF-8 编码的 Buffer
    let fileBuffer: Buffer;
    if (Buffer.isBuffer(formattedContent)) {
      fileBuffer = formattedContent;
    } else {
      // 确保字符串使用 UTF-8 编码
      fileBuffer = Buffer.from(formattedContent, 'utf-8');
    }

    // 设置正确的 Content-Type 和字符集
    const contentType = `${getMimeType(format)}; charset=utf-8`;

    await storageRepo.uploadFile(bucket, key, fileBuffer, {
      contentType,
      metadata: {
        userId,
        format,
        wordCount: wordCount.toString(),
        charset: 'utf-8',
        source: 'stream-sync', // 标记来源为 stream 同步
        ...(params.metadata ? Object.fromEntries(
          Object.entries(params.metadata).map(([k, v]) => [k, String(v)])
        ) : {}),
      },
    });

    const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 3600); // 7天有效期

    storageInfo = {
      key,
      bucket,
      url,
    };
  }

  // 4. 创建任务并立即设置为完成状态
  const taskManager = taskExecutor.getTaskManager();
  
  // 从 metadata 中提取标题，如果没有则从 prompt 或文本前40个字符生成
  const prompt = params.metadata?.prompt || '';
  const title = params.metadata?.title || 
    (prompt ? prompt.slice(0, 40).replace(/\n/g, ' ').trim() : 
     params.text ? params.text.slice(0, 40).replace(/\n/g, ' ').trim() : '写作内容');
  
  const createResponse = await taskManager.createTask({
    type: 'writing',
    model: 'writing-sync', // 标记为同步任务
    provider: undefined,
    params: {
      taskType: 'generate', // 使用 generate 类型
      params: {
        text: params.text,
        storage_form: format,
        metadata: {
          ...params.metadata,
          title, // 确保标题被保存到 metadata
          prompt, // 保存 prompt 用于显示
        },
        prompt: prompt || params.text?.slice(0, 100) || '', // 同时保存到顶层，用于 syncWritingFromRemote 提取标题
      },
      userId,
    },
    userId,
    storeToMinio: params.storeToMinio !== false,
  });

  // 5. 立即设置任务为完成状态，并保存结果
  await taskManager.updateTaskStatus(createResponse.taskId, 'processing', {
    progress: 50,
    logs: ['正在保存文档到 MinIO'],
    startedAt: new Date(),
  });

  await taskManager.setTaskResult(createResponse.taskId, {
    mediaUrls: storageInfo ? [storageInfo.url] : [],
    storageInfo: storageInfo ? {
      keys: [storageInfo.key],
      bucket: storageInfo.bucket,
      urls: [storageInfo.url],
    } : undefined,
    metadata: {
      type: 'writing',
      text: params.text,
      formattedContent: Buffer.isBuffer(formattedContent)
        ? formattedContent.toString('base64')
        : formattedContent,
      format,
      wordCount,
      fileSize,
      source: 'stream-sync',
      ...params.metadata,
    },
  });

  await taskManager.updateTaskStatus(createResponse.taskId, 'completed', {
    progress: 100,
    completedAt: new Date(),
    logs: ['文档已成功保存到任务系统'],
  });

  return {
    taskId: createResponse.taskId,
    storageInfo,
    metadata: {
      wordCount,
      fileSize,
      format,
      ...params.metadata,
    },
  };
}

