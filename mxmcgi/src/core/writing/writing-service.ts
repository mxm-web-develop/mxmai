/**
 * Writing 核心服务
 * 处理文本生成、格式化、存储等核心逻辑
 */

import type { ProviderType } from '../providers/types';
import { runByModelKey } from '../../models/run';
import { type TaskType } from './model-selector';
import { resolveWritingModel } from './writing-model-routing';
import { getWritingBusinessKeyFromParams } from './business-key';
import { retrieveKnowledge, formatKnowledgeContext, enhancePromptWithKnowledge, hasKnowledgeResults } from './knowledge-enhancer';
import { formatDocument, getFileExtension, getMimeType, type StorageFormat } from './document-formatter';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { normalizeWritingLanguage, writingLangInstruction, writingListJoin } from './writing-locale';
import crypto from 'crypto';
import { taskExecutor } from '../../task/task-executor';
import { getGeneratedBucket } from '../../storage/generated-temp';
import type {
  Outline,
  WritingGenerateParams,
  SyncToTaskParams,
  OutlineType,
  OutlineStructureType,
  CharacterProfile,
  OutlineApplyTo,
  StoryboardChunk,
  StoryboardShot,
  StoryboardChunkSeconds,
} from './type';
import { OUTLINE_APPLY_TO_VALUES } from './type';
import { fillChunkPrompts } from './storyboard-chunk-utils';
import { CHUNK_MAX_CHARS, getStoryboardChunkOutputFormat, fillStoryboardOutputFormatTemplate } from './wtconfigs/storyboard-scripts';
import { SUBTYPE_RULES_MAP } from './wtconfigs/subtype-rules';
import { getStructurePromptTemplate } from './outline-structure-types';
import { getWritingRulesAndFormatResolved, getPromptFullConfig } from '../../prompts';
import { runBasicText } from '../text/basic-text';
import { 
  getWritingTypeConfig, 
  extractWritingBusinessParams,
  getParamLabel,
  getWritingParamsForType,
  getWritingParamsForTypeWithSubtype,
} from './wtconfigs';

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

function shouldGenerateCharactersForOutline(params: {
  applyto?: OutlineApplyTo;
  outline_type?: OutlineType;
}): boolean {
  // 规则：故事小说 或 口播/分镜
  return (
    params.outline_type === 'story-novel' ||
    params.applyto === 'voice-scripts' ||
    params.applyto === 'storyboard-scripts'
  );
}

function ensureUuid36(id: unknown): string {
  const s = typeof id === 'string' ? id : '';
  // 36位 UUID（含4个连字符），允许大小写
  const uuid36 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuid36.test(s) ? s : crypto.randomUUID();
}

function normalizeCharacters(characters?: CharacterProfile[]): CharacterProfile[] | undefined {
  if (!characters || characters.length === 0) return characters;
  return characters.map((c) => ({
    ...c,
    id: ensureUuid36((c as any).id),
  }));
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
  cast?: string[];
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
  /** 全局参数（作为基础，节点参数在此基础上进行相对调整） */
  globalParams?: {
    motivation?: string;
    stance?: string;
    tone?: string;
    length?: string;
    key_elements?: string[];
  };
}

async function getCharactersFromParams(
  params: WritingGenerateParams,
  _userId?: string
): Promise<CharacterProfile[] | undefined> {
  const chars = (params as any)?.metadata?.characters as CharacterProfile[] | undefined;
  return Array.isArray(chars) && chars.length > 0 ? chars : undefined;
}

function formatCharactersForPrompt(characters: CharacterProfile[]): string {
  return characters
    .map((c) => {
      const parts: string[] = [];
      parts.push(`- id=${c.id} name=${c.name}`);
      if (c.age) parts.push(`  age: ${c.age}`);
      if (c.appearance) parts.push(`  appearance: ${c.appearance}`);
      if (c.voice_description) parts.push(`  voice_description: ${c.voice_description}`);
      if (c.clothing_style) parts.push(`  clothing_style: ${c.clothing_style}`);
      if (c.personality) parts.push(`  personality: ${c.personality}`);
      if (c.others) parts.push(`  others: ${c.others}`);
      return parts.join('\n');
    })
    .join('\n');
}

function resolveCastCharacters(
  characters: CharacterProfile[],
  cast?: string[],
): CharacterProfile[] {
  if (!cast || cast.length === 0) return [];
  const castSet = new Set(cast.map((s) => String(s).trim()).filter(Boolean));
  return characters.filter(
    (c) => castSet.has(c.id) || castSet.has(c.name),
  );
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
 * 解析和验证 Suno 歌词 JSON 格式
 * @param text 生成的文本内容
 * @returns 解析后的 JSON 对象，如果解析失败返回 null
 */
function parseSunoLyricsJson(text: string): {
  title?: string;
  prompt: string;
  tags?: string;
  negative_tags?: string;
} | null {
  try {
    // 尝试解析 JSON
    // 先清理可能的 markdown 代码块标记
    let cleanedText = text.trim();
    
    // 移除可能的 markdown 代码块标记
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    // 尝试找到 JSON 对象的开始和结束
    const jsonStart = cleanedText.indexOf('{');
    const jsonEnd = cleanedText.lastIndexOf('}');
    
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      console.warn('[Writing Service] 未找到有效的 JSON 对象');
      return null;
    }
    
    const jsonText = cleanedText.substring(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(jsonText);
    
    // 验证必需字段
    if (!parsed.prompt || typeof parsed.prompt !== 'string') {
      console.warn('[Writing Service] JSON 缺少必需的 prompt 字段');
      return null;
    }
    
    // 返回验证后的对象
    return {
      title: parsed.title && typeof parsed.title === 'string' ? parsed.title : undefined,
      prompt: parsed.prompt,
      tags: parsed.tags && typeof parsed.tags === 'string' ? parsed.tags : undefined,
      negative_tags: parsed.negative_tags && typeof parsed.negative_tags === 'string' ? parsed.negative_tags : undefined,
    };
  } catch (error) {
    console.error('[Writing Service] 解析 Suno 歌词 JSON 失败:', error);
    return null;
  }
}

/**
 * 若 video_description 实为内嵌的 JSON 字符串（如 '{"chunks":[...]}' 或单 chunk 对象），则解析并返回应使用的字段
 * 用于修复 LLM 把整段 JSON 写进 video_description 导致的格式错误
 */
function unwrapJsonFromVideoDescription(videoDescription: string): {
  video_description: string;
  dialogue?: string;
  camera_movement?: string;
  sound_effects?: string;
  transition?: string;
  chunk_seconds?: number;
  characters_in_shot?: string[];
} | null {
  const raw = (videoDescription || '').trim();
  if (!raw || raw.length < 10) return null;
  let toParse = raw;
  if ((toParse.startsWith("'") && toParse.endsWith("'")) || (toParse.startsWith('"') && toParse.endsWith('"'))) {
    toParse = toParse.slice(1, -1).trim();
  }
  if (!toParse.startsWith('{') || (!toParse.includes('"chunks"') && !toParse.includes('"video_description"'))) {
    return null;
  }
  try {
    const parsed = JSON.parse(toParse) as any;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.chunks) && parsed.chunks.length > 0) {
        const first = parsed.chunks[0];
        return {
          video_description: typeof first.video_description === 'string' ? first.video_description : String(first.video_description ?? ''),
          dialogue: first.dialogue,
          camera_movement: first.camera_movement,
          sound_effects: first.sound_effects,
          transition: first.transition,
          chunk_seconds: first.chunk_seconds,
          characters_in_shot: Array.isArray(first.characters_in_shot) ? first.characters_in_shot : undefined,
        };
      }
      if (typeof parsed.video_description === 'string') {
        return {
          video_description: parsed.video_description,
          dialogue: parsed.dialogue,
          camera_movement: parsed.camera_movement,
          sound_effects: parsed.sound_effects,
          transition: parsed.transition,
          chunk_seconds: parsed.chunk_seconds,
          characters_in_shot: Array.isArray(parsed.characters_in_shot) ? parsed.characters_in_shot : undefined,
        };
      }
    }
  } catch {
    // 非合法 JSON，忽略
  }
  return null;
}

/**
 * 从 video_description 中解析段落标记，提取到对应字段
 * 当 LLM 把「画面」「对话」「镜头说明」「音效/音乐」「转场」全写在一个字段时，自动拆分
 */
function extractSectionsFromVideoDescription(videoDescription: string): {
  video_description: string;
  dialogue?: string;
  camera_movement?: string;
  sound_effects?: string;
  transition?: string;
} | null {
  const raw = (videoDescription || '').trim();
  if (!raw) return null;
  const markers = ['画面：', '场景描述：', '对话：', '镜头说明：', '音效/音乐：', '转场：'] as const;
  const hasAny = markers.some((m) => raw.includes(m));
  if (!hasAny) return null;

  let video_description = raw;
  let dialogue: string | undefined;
  let camera_movement: string | undefined;
  let sound_effects: string | undefined;
  let transition: string | undefined;

  const transitionM = raw.match(/转场：\s*([\s\S]*)$/);
  if (transitionM) {
    transition = transitionM[1].trim();
    video_description = raw.replace(/转场：\s*[\s\S]*$/, '').trim();
  }

  const soundM = raw.match(/音效\/音乐：\s*([\s\S]*?)(?=转场：|$)/);
  if (soundM) {
    sound_effects = soundM[1].trim();
  }

  const cameraM = raw.match(/镜头说明：\s*([\s\S]*?)(?=音效\/音乐：|转场：|$)/);
  if (cameraM) {
    camera_movement = cameraM[1].trim();
  }

  const dialogueM = raw.match(/对话：\s*([\s\S]*?)(?=镜头说明：|音效\/音乐：|转场：|$)/);
  if (dialogueM) {
    dialogue = dialogueM[1].trim();
  }

  const pictureM = raw.match(/(?:画面|场景描述)：\s*([\s\S]*?)(?=对话：|镜头说明：|音效\/音乐：|转场：|$)/);
  if (pictureM) {
    video_description = pictureM[1].trim();
  } else {
    const beforeFirst = raw.split(/(?=对话：|镜头说明：|音效\/音乐：|转场：)/)[0]?.trim() ?? '';
    if (beforeFirst && !dialogue && !camera_movement && !sound_effects && !transition) {
      video_description = beforeFirst;
    }
  }

  return {
    video_description,
    ...(dialogue && { dialogue }),
    ...(camera_movement && { camera_movement }),
    ...(sound_effects && { sound_effects }),
    ...(transition && { transition }),
  };
}

/**
 * 分镜脚本：根据节奏参数（rhythm）生成镜头拆分与时长的规则说明
 */
function getStoryboardRhythmRules(
  rhythm: string | undefined,
  chunkSeconds: StoryboardChunkSeconds
): string | null {
  if (!rhythm) return null;
  const base = chunkSeconds;
  switch (rhythm) {
    case 'fast-cut':
      return `快剪（fast-cut）：每个 ${base} 秒的 chunk 内请使用大量短镜头和频繁转场：
- 建议每个 chunk 拆成 3–6 个镜头；
- 每个镜头的 chunk_seconds 约 2–4 秒，不要超过 4 秒；
- 镜头之间的转场要明显，节奏紧凑，避免长时间停留在同一构图。`;
    case 'fast':
      return `快节奏（fast）：每个 ${base} 秒的 chunk 内镜头保持快速切换：
- 建议每个 chunk 拆成 2–4 个镜头；
- 每个镜头的 chunk_seconds 约 2–4 秒，**单个镜头不要超过 4 秒**；
- 适合节奏明快的行进、动作或情绪推进场景。`;
    case 'narrative':
      return `叙事节奏（narrative）：每个 ${base} 秒的 chunk 内使用 4–8 秒混合镜头：
- 建议每个 chunk 拆成 2–3 个镜头；
- 每个镜头的 chunk_seconds 约 4–8 秒，可根据叙事需要略有长短变化；
- 适合讲述故事、情绪递进，兼顾画面连贯与信息量。`;
    case 'long-take':
      return `长镜头（long-take）：每个 ${base} 秒的 chunk 内以少量 6–10 秒镜头为主：
- 建议每个 chunk 使用 1–2 个镜头；
- 每个镜头的 chunk_seconds 约 6–10 秒，鼓励使用连续运镜、较少切换；
- 适合氛围营造、慢节奏观察或需要一镜到底感受的场景。`;
    default:
      return null;
  }
}

/** 根据节奏参数与 chunk 时长，给出后处理自动拆分时的目标镜头数（用于 LLM 未返回 shots 时） */
function getTargetShotCountFromRhythm(
  rhythm: string | undefined,
  chunkSeconds: number
): number {
  if (chunkSeconds < 10) return 1;
  switch (rhythm) {
    case 'fast-cut':
      return Math.min(6, Math.max(3, Math.floor(chunkSeconds / 3)));
    case 'fast':
      return Math.min(4, Math.max(2, Math.floor(chunkSeconds / 4)));
    case 'narrative':
      return Math.min(3, Math.max(2, Math.floor(chunkSeconds / 6)));
    case 'long-take':
      return Math.max(1, Math.min(2, Math.floor(chunkSeconds / 8)));
    default:
      return Math.min(4, Math.max(2, Math.floor(chunkSeconds / 5)));
  }
}

function secondsToMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getEqualShotTimeline(chunkSeconds: number, shotCount: number): string[] {
  if (shotCount <= 0) return [];
  if (shotCount === 1) return [`00:00-${secondsToMMSS(chunkSeconds)}`];
  const step = chunkSeconds / shotCount;
  const segs: string[] = [];
  for (let i = 0; i < shotCount; i++) {
    const start = i * step;
    const end = (i + 1) * step;
    segs.push(`${secondsToMMSS(start)}-${secondsToMMSS(end)}`);
  }
  return segs;
}

/** 按句号、问号、感叹号、分号、换行拆分描述文本为句子数组（用于后处理自动拆镜头） */
function splitVideoDescriptionIntoSentences(text: string): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  const parts = t.split(/([。！？；\n]+)/);
  const sentences: string[] = [];
  let buf = '';
  for (let i = 0; i < parts.length; i++) {
    if (/^[。！？；\n]+$/.test(parts[i])) {
      if (buf.trim()) {
        sentences.push((buf + parts[i]).trim());
        buf = '';
      }
    } else {
      buf += parts[i];
    }
  }
  if (buf.trim()) sentences.push(buf.trim());
  return sentences.filter(Boolean);
}

/**
 * 将「单镜头扁平 chunk」按节奏拆成多镜头（shots 数组）。
 * 仅当 chunk 无 shots、chunk_seconds >= 10 时调用；根据 rhythm 决定镜头数，按句子均分 video_description。
 */
function autoSplitSingleChunkToShots(
  chunk: StoryboardChunk,
  chunkSeconds: number,
  rhythm?: string
): StoryboardChunk {
  const targetCount = getTargetShotCountFromRhythm(rhythm, chunkSeconds);
  if (targetCount <= 1) return chunk;

  const rawDesc = (chunk.video_description ?? '').trim();
  if (!rawDesc) return chunk;

  const sentences = splitVideoDescriptionIntoSentences(rawDesc);
  if (sentences.length <= 1) return chunk;

  const shotCount = Math.min(targetCount, sentences.length);
  const timeline = getEqualShotTimeline(chunkSeconds, shotCount);
  const secPerShot = chunkSeconds / shotCount;
  const shotSec = Math.max(2, Math.round(secPerShot));

  const shots: StoryboardShot[] = [];
  const groupSize = Math.ceil(sentences.length / shotCount);
  for (let i = 0; i < shotCount; i++) {
    const startIdx = i * groupSize;
    const endIdx = Math.min(startIdx + groupSize, sentences.length);
    const partDesc = sentences.slice(startIdx, endIdx).join('');
    const seg = timeline[i] ?? `${secondsToMMSS(i * secPerShot)}-${secondsToMMSS((i + 1) * secPerShot)}`;
    shots.push({
      shot_index: i + 1,
      chunk_seconds: shotSec,
      video_description: partDesc,
      camera_movement: chunk.camera_movement,
      dialogue: chunk.dialogue,
      sound_effects: chunk.sound_effects,
      transition: chunk.transition,
      characters_in_shot: chunk.characters_in_shot,
      shot_timeline: [seg],
      prompt: '',
    });
  }

  return {
    index: chunk.index,
    chunk_seconds: chunkSeconds,
    shots,
    prompt: '',
  };
}

/**
 * 解析分镜脚本 JSON（chunks 数组或 { chunks: [...] }）
 * 支持从 markdown 代码块中提取；并对 video_description 做后处理：若内含「画面：」「对话：」「镜头说明：」「音效/音乐：」「转场：」则自动拆到对应字段
 * 当 chunk_seconds >= 10 且 LLM 未返回 shots 时，根据 rhythm 自动将单镜头拆成多镜头（后处理）
 */
function parseStoryboardChunksJson(
  text: string,
  desiredChunkSeconds?: StoryboardChunkSeconds,
  rhythm?: string
): { chunks: StoryboardChunk[] } {
  let cleanedText = text.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  const firstBrace = cleanedText.indexOf('{');
  const firstBracket = cleanedText.indexOf('[');
  const jsonStart = firstBrace < 0 ? firstBracket : firstBracket < 0 ? firstBrace : Math.min(firstBrace, firstBracket);
  const lastBrace = cleanedText.lastIndexOf('}');
  const lastBracket = cleanedText.lastIndexOf(']');
  const jsonEnd = (lastBrace > lastBracket ? lastBrace : lastBracket) + 1;
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    throw new Error('分镜脚本 JSON 解析失败：未找到有效的 JSON');
  }
  const jsonText = cleanedText.substring(jsonStart, jsonEnd);
  const parsed = JSON.parse(jsonText);
  let chunks: StoryboardChunk[] = Array.isArray(parsed) ? parsed : (parsed?.chunks ?? []);
  const validChunkSeconds = [4, 5, 8, 10, 15, 20, 25] as const;
  const enforcedChunkSeconds: StoryboardChunkSeconds = (desiredChunkSeconds ?? 15) as StoryboardChunkSeconds;

  /** 规范化单个镜头对象（用于 shots 数组内） */
  const normalizeShot = (s: any, shotIdx: number): StoryboardShot => {
    const sd = typeof s.video_description === 'string' ? s.video_description : String(s.video_description ?? '');
    const secRaw = s.chunk_seconds ?? 4;
    const secNum = typeof secRaw === 'number' ? secRaw : parseInt(String(secRaw), 10);
    const sec = validChunkSeconds.includes(secNum as any) ? (secNum as any) : 4;
    return {
      shot_index: typeof s.shot_index === 'number' ? s.shot_index : shotIdx + 1,
      chunk_seconds: sec,
      video_description: sd,
      camera_movement: s.camera_movement,
      dialogue: s.dialogue,
      sound_effects: s.sound_effects,
      transition: s.transition,
      characters_in_shot: s.characters_in_shot,
      relate_outline_uid: s.relate_outline_uid,
      shot_timeline: Array.isArray(s.shot_timeline) ? s.shot_timeline.filter((x: any) => typeof x === 'string') : undefined,
      prompt: typeof s.prompt === 'string' ? s.prompt : '',
    };
  };

  chunks = chunks.map((c: any, i: number) => {
    // 多镜头 chunk：含有 shots 数组，一个 chunk 对应多段分镜（如 15 秒 chunk 内含多个 4 秒镜头）
    if (Array.isArray(c.shots) && c.shots.length > 0) {
      const shots = c.shots.map((s: any, si: number) => normalizeShot(s, si));
      return {
        index: typeof c.index === 'number' ? c.index : i + 1,
        // 重要：chunk_seconds 必须等于用户选择的 chunk 时长；镜头级时长放到 shots[].chunk_seconds
        chunk_seconds: enforcedChunkSeconds,
        shots,
        prompt: typeof c.prompt === 'string' ? c.prompt : '',
      } as StoryboardChunk;
    }

    let video_description = typeof c.video_description === 'string' ? c.video_description : String(c.video_description ?? '');
    let camera_movement = c.camera_movement;
    let dialogue = c.dialogue;
    let sound_effects = c.sound_effects;
    let transition = c.transition;
    let characters_in_shot = c.characters_in_shot;

    // 特殊修复：LLM 把 {"chunks":[...]} 整段 JSON 写进 video_description / prompt
    // 这种情况下，将内嵌 chunks 转为当前 chunk 的 shots 数组，并强制 chunk_seconds=用户选择值
    // 注意：内嵌的 chunks 既可能是单镜头（扁平字段），也可能本身就是多镜头结构（每个 chunk 内有 shots 数组）
    let rawVD = (video_description || '').trim();
    // 与 unwrapJsonFromVideoDescription 保持一致：先去掉首尾引号
    let toParse = rawVD;
    if (
      (toParse.startsWith("'") && toParse.endsWith("'")) ||
      (toParse.startsWith('"') && toParse.endsWith('"'))
    ) {
      toParse = toParse.slice(1, -1).trim();
    }

    if (toParse.startsWith('{') && toParse.includes('"chunks"')) {
      try {
        const embedded = JSON.parse(toParse) as any;
        const embeddedChunks = Array.isArray(embedded?.chunks) ? embedded.chunks : [];
        if (embeddedChunks.length > 0) {
          const shotsFromEmbedded: StoryboardShot[] = [];
          for (const ec of embeddedChunks) {
            // 若内嵌 chunk 本身已有 shots 数组（多镜头结构），则展开其内部每个 shot
            if (Array.isArray(ec.shots) && ec.shots.length > 0) {
              ec.shots.forEach((s: any, si: number) => {
                shotsFromEmbedded.push(
                  normalizeShot(
                    {
                      ...s,
                      shot_index: typeof s.shot_index === 'number' ? s.shot_index : shotsFromEmbedded.length + 1,
                    },
                    shotsFromEmbedded.length
                  )
                );
              });
            } else {
              // 否则将该 chunk 视为单镜头，直接转为一个 shot
              shotsFromEmbedded.push(
                normalizeShot(
                  {
                    ...ec,
                    shot_index: typeof ec.shot_index === 'number' ? ec.shot_index : shotsFromEmbedded.length + 1,
                  },
                  shotsFromEmbedded.length
                )
              );
            }
          }
          return {
            index: typeof c.index === 'number' ? c.index : i + 1,
            chunk_seconds: enforcedChunkSeconds,
            shots: shotsFromEmbedded,
            prompt: typeof c.prompt === 'string' ? c.prompt : '',
          } as StoryboardChunk;
        }
      } catch {
        // ignore
      }
    }

    // 格式检查 1：若 video_description 实为内嵌 JSON 字符串，先解析再使用
    const unwrapped = unwrapJsonFromVideoDescription(video_description);
    if (unwrapped) {
      video_description = unwrapped.video_description;
      if (unwrapped.dialogue != null) dialogue = unwrapped.dialogue;
      if (unwrapped.camera_movement != null) camera_movement = unwrapped.camera_movement;
      if (unwrapped.sound_effects != null) sound_effects = unwrapped.sound_effects;
      if (unwrapped.transition != null) transition = unwrapped.transition;
      if (unwrapped.characters_in_shot != null) characters_in_shot = unwrapped.characters_in_shot;
    }

    // 格式检查 2：若仍含「画面：」「对话：」等段落标记，拆到对应字段
    const extracted = extractSectionsFromVideoDescription(video_description);
    if (extracted) {
      video_description = extracted.video_description;
      if (extracted.dialogue != null && (dialogue === undefined || dialogue === '')) dialogue = extracted.dialogue;
      if (extracted.camera_movement != null && (camera_movement === undefined || camera_movement === '')) camera_movement = extracted.camera_movement;
      if (extracted.sound_effects != null && (sound_effects === undefined || sound_effects === '')) sound_effects = extracted.sound_effects;
      if (extracted.transition != null && (transition === undefined || transition === '')) transition = extracted.transition;
    }

    return {
      index: typeof c.index === 'number' ? c.index : i + 1,
      // 重要：chunk_seconds 必须等于用户选择的 chunk 时长；不要信任 LLM 返回的 4 秒
      chunk_seconds: enforcedChunkSeconds,
      video_description,
      camera_movement,
      dialogue,
      sound_effects,
      transition,
      characters_in_shot,
      reference_image_url: c.reference_image_url,
      start_frame_image_url: c.start_frame_image_url,
      end_frame_image_url: c.end_frame_image_url,
      relate_outline_uid: c.relate_outline_uid,
      shot_timeline: Array.isArray(c.shot_timeline) ? c.shot_timeline.filter((s: any) => typeof s === 'string') : undefined,
      prompt: typeof c.prompt === 'string' ? c.prompt : '',
    };
  });

  // 全部输出完后做一次格式检查：确保 video_description 不为 JSON 字符串、长度合理（多镜头 chunk 已单独处理，跳过）
  chunks = chunks.map((chunk, i) => {
    if (chunk.shots?.length) return chunk;
    let { video_description } = chunk;
    const again = unwrapJsonFromVideoDescription(video_description);
    if (again) {
      video_description = again.video_description;
      return {
        ...chunk,
        video_description,
        ...(again.dialogue != null && { dialogue: again.dialogue }),
        ...(again.camera_movement != null && { camera_movement: again.camera_movement }),
        ...(again.sound_effects != null && { sound_effects: again.sound_effects }),
        ...(again.transition != null && { transition: again.transition }),
        ...(again.characters_in_shot != null && { characters_in_shot: again.characters_in_shot }),
      };
    }
    return chunk;
  });

  // 后处理：当 chunk_seconds >= 10 且 LLM 未返回 shots 时，按节奏（rhythm）自动将单镜头拆成多镜头
  chunks = chunks.map((chunk) => {
    if (chunk.shots?.length) return chunk;
    const sec = chunk.chunk_seconds ?? enforcedChunkSeconds;
    if (sec < 10) return chunk;
    return autoSplitSingleChunkToShots(chunk, enforcedChunkSeconds, rhythm);
  });

  return { chunks };
}

/**
 * 根据写作类型和格式参数判断是否启用 Markdown 格式
 * - outlines: 返回 JSON，不使用 Markdown
 * - lyrics + format === 'suno': 使用 Suno 格式，不使用 Markdown（纯文本）
 * - voice-scripts: 口播稿统一输出 txt，不使用 Markdown
 * - 其他类型: 默认使用 Markdown 格式
 */
function shouldEnableMarkdown(writingType?: string, format?: string): boolean {
  // outlines 类型返回 JSON，不需要 Markdown
  if (writingType === 'outlines') {
    return false;
  }
  // lyrics 类型且 format === 'suno' 时，使用纯文本格式（不带 Markdown）
  if (writingType === 'lyrics' && format === 'suno') {
    return false;
  }
  // voice-scripts 类型统一使用纯文本（不带 Markdown）
  if (writingType === 'voice-scripts') {
    return false;
  }
  // 广告/品牌商业文案：标签化纯文本，禁止 Markdown
  if (writingType === 'business') {
    return false;
  }
  // 其他类型默认使用 Markdown
  return true;
}

/** Task V2 unifiedTemplate 单次写作：仅追加格式约束，不拼接 DB/代码侧写作规则 */
function buildConfiguredWritingGeneratePrompt(
  params: WritingGenerateParams,
  previousContent?: string | null,
): string {
  let generatePrompt = (params.prompt || '').trim();
  const enableMarkdown = shouldEnableMarkdown(params.writing_type, params.format);
  if (!enableMarkdown) {
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
  if (previousContent) {
    generatePrompt = `请基于以下原文进行写作：

原文：
${previousContent}

---
${generatePrompt}`;
  }
  return generatePrompt;
}

function isAsciiHeaderValue(value: string): boolean {
  // S3/MinIO x-amz-meta-* header value must be ASCII; Node will throw ERR_INVALID_CHAR otherwise.
  return /^[\x09\x0A\x0D\x20-\x7E]*$/.test(value);
}

function sanitizeMinioMetadata(input?: Record<string, any>): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  const dropped: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    const str = String(v);
    if (isAsciiHeaderValue(str)) {
      out[k] = str;
    } else {
      dropped[k] = str;
    }
  }
  if (Object.keys(dropped).length > 0) {
    out['meta_json_b64'] = Buffer.from(JSON.stringify(dropped), 'utf8').toString('base64');
  }
  return out;
}

function hasTtsPauseTag(text: string): boolean {
  return /<#[0-9]{1,2}(?:\.[0-9]{1,2})?#>/.test(text);
}

function inferTtsPauseDurations(params: any): { short: number; mid: number; long: number } {
  const platform = String(params?.platform || '').toLowerCase();
  const target = String(params?.targetAudience || '').toLowerCase();
  const duration = String(params?.duration || '').toLowerCase();
  const rhythm = String(params?.voice_script_rhythm || '').toLowerCase();

  // baseline
  let short = 0.35;
  let mid = 0.8;
  let long = 1.4;

  if (platform === 'live') {
    short = 0.25;
    mid = 0.6;
    long = 1.1;
  } else if (platform === 'podcast') {
    short = 0.4;
    mid = 0.9;
    long = 1.6;
  }

  if (target === 'elderly') {
    short = Math.max(short, 0.45);
    mid = Math.max(mid, 1.0);
    long = Math.max(long, 1.7);
  } else if (target === 'youth') {
    short = Math.min(short, 0.3);
    mid = Math.min(mid, 0.75);
    long = Math.min(long, 1.2);
  }

  // very short scripts: keep pauses tighter
  if (duration === '30s') {
    short = Math.min(short, 0.3);
    mid = Math.min(mid, 0.7);
    long = Math.min(long, 1.1);
  }

  // 根据节奏参数调整停顿时长
  if (rhythm === 'slow') {
    // 慢节奏：停顿更长
    short = short * 1.5;
    mid = mid * 1.5;
    long = long * 1.5;
  } else if (rhythm === 'fast') {
    // 快节奏：停顿更短，严格限制在 0.1-0.3 秒之间
    short = Math.max(0.1, Math.min(0.2, short * 0.4));
    mid = Math.max(0.15, Math.min(0.25, mid * 0.3));
    long = Math.max(0.2, Math.min(0.3, long * 0.25));
  }
  // normal 节奏：保持原值

  return { short, mid, long };
}

function injectBasicTtsPauses(text: string, params: any): string {
  if (!text || hasTtsPauseTag(text)) return text;

  const { short, mid, long } = inferTtsPauseDurations(params);
  const fmt = (n: number) => String(Number(n.toFixed(2)));
  const rhythm = String(params?.voice_script_rhythm || '').toLowerCase();

  const isPunct = (ch: string) => ch === '，' || ch === '。' || ch === '！' || ch === '？' || ch === '；' || ch === '：';
  const isSentenceEnd = (ch: string) => ch === '。' || ch === '！' || ch === '？' || ch === '；';

  // 快节奏下，只在句子结尾插入停顿，跳过逗号等中间标点
  const shouldInsertPause = (ch: string) => {
    if (rhythm === 'fast') {
      // 快节奏：只在句子结尾插入停顿
      return isSentenceEnd(ch);
    }
    // 其他节奏：在所有标点后插入
    return isPunct(ch);
  };

  let out = '';
  let pauseCount = 0; // 统计已插入的停顿数量
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch;

    if (!shouldInsertPause(ch)) continue;
    // avoid inserting before newline/end
    const next = text[i + 1];
    if (!next || next === '\n') continue;
    // avoid double inserting if next already starts a tag
    if (next === '<' && text.slice(i + 1, i + 3) === '<#') continue;
    // avoid inserting right after an existing tag
    const tail = out.slice(Math.max(0, out.length - 8));
    if (tail.includes('#>')) continue;

    // 快节奏下，限制停顿数量（每 8-10 句才插入一个）
    if (rhythm === 'fast') {
      pauseCount++;
      // 只在每 8 个句子结尾插入一个停顿
      if (pauseCount % 8 !== 0) continue;
    }

    const dur = isSentenceEnd(ch) ? (ch === '；' ? mid : long) : short;
    out += `<#${fmt(dur)}#>`;
  }

  return out;
}

function stripLeadingTitleForTts(text: string): string {
  if (!text) return text;
  const trimmed = text.trimStart();
  const lines = trimmed.split('\n');
  if (lines.length < 2) return text;

  const first = lines[0].trim();
  const second = lines[1].trim();

  // Typical "title + blank line" or "title + underline" patterns
  const looksLikeColonTitle = first.length > 0 && first.length <= 40 && /[:：]/.test(first) && !/[。！？]/.test(first);
  const looksLikeBracketTitle = first.length > 0 && first.length <= 40 && /^《.+》$/.test(first);
  const underline = second.length > 0 && /^=+$/.test(second);
  const blankLine = second.length === 0;

  if ((looksLikeColonTitle || looksLikeBracketTitle) && (blankLine || underline)) {
    // drop first line + optional underline/blank
    const startIdx = underline ? 2 : 2;
    const rest = lines.slice(startIdx).join('\n').trimStart();
    return rest.length > 0 ? rest : text;
  }

  return text;
}

/**
 * 构建写作指导文本（根据类型动态提取参数）
 */
function buildWritingGuidance(
  params: any,
  writingType?: string,
  outlineType?: OutlineType
): string[] {
  const effectiveOutlineType = outlineType ?? ((params as any)?.outline_type as OutlineType | undefined);
  const lang = normalizeWritingLanguage((params as any)?.language);
  const businessParams = extractWritingBusinessParams(params, writingType as any, effectiveOutlineType as any);
  const guidance: string[] = [];

  Object.entries(businessParams).forEach(([key, value]) => {
    const paramLabel = getParamLabel(key, writingType as any, lang, effectiveOutlineType as any);
    if (Array.isArray(value)) {
      guidance.push(`${paramLabel}: ${value.join('、')}`);
    } else {
      guidance.push(`${paramLabel}: ${value}`);
    }
  });

  return guidance;
}

/**
 * 格式化每个章节的写作指导参数（单独列出，不附加在标题后）
 */
function formatChapterGuidance(outline: Outline, chapterPath: string = '', writingType?: string): string[] {
  const results: string[] = [];
  const currentPath = chapterPath ? `${chapterPath} > ${outline.content}` : outline.content;
  
  // 使用动态参数提取
  const guidance = buildWritingGuidance(outline, writingType);
  
  if (guidance.length > 0) {
    results.push(`【${currentPath}】`);
    results.push(...guidance.map(g => `  ${g}`));
    results.push('');
  }
  
  // 递归处理子节点
  if (outline.children && outline.children.length > 0) {
    outline.children.forEach(child => {
      results.push(...formatChapterGuidance(child, currentPath, writingType));
    });
  }
  
  return results;
}

/**
 * 根据细分类型获取额外的规则说明（优先 DB，未配置时回退此处）
 */
function getSubtypeRules(writingType?: string, outlineType?: OutlineType): string | null {
  if (!writingType || !outlineType) return null;
  return SUBTYPE_RULES_MAP[writingType]?.[outlineType] ?? null;
}

/**
 * 分镜输出格式：优先从 DB extra.storyboard_output_format_template_zh 取模板并替换占位符，否则用代码内生成
 */
async function resolveStoryboardOutputFormat(
  chunkSeconds: StoryboardChunkSeconds,
  maxChars: number,
  expectedChunkCount?: number
): Promise<string> {
  const config = await getPromptFullConfig('writing', 'storyboard-scripts', null);
  const template = config?.storyboard_output_format_template_zh;
  if (template && typeof template === 'string') {
    return fillStoryboardOutputFormatTemplate(template, chunkSeconds, maxChars, expectedChunkCount);
  }
  return getStoryboardChunkOutputFormat(chunkSeconds, maxChars, expectedChunkCount);
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
/**
 * 展开大纲为扁平列表，保留全局参数和节点参数（全局参数作为基础，节点参数在此基础上进行相对调整）
 */
function expandOutlinesToSections(
  outlines: Outline[],
  depth: number = 0,
  startIndex: number = 0,
  globalParams?: {
    motivation?: string;
    stance?: string;
    tone?: string;
    length?: string;
    key_elements?: string[];
  }
): ExpandedSection[] {
  const sections: ExpandedSection[] = [];
  let currentIndex = startIndex;

  for (const outline of outlines) {
    // 保留节点参数和全局参数，不合并（在生成时，全局参数作为基础，节点参数作为相对调整）
    const section: ExpandedSection = {
      uid: outline.uid,
      content: outline.content,
      motivation: outline.motivation,
      stance: outline.stance,
      tone: outline.tone,
      cast: outline.cast,
      length: outline.length,
      key_elements: outline.key_elements,
      depth,
      index: currentIndex,
      position: currentIndex,
      knowledgeBase: outline.knowledgeBase,
      globalParams: globalParams, // 保存全局参数，用于生成时作为基础
    };
    sections.push(section);
    currentIndex++;

    // 递归处理子节点，传递全局参数
    if (outline.children && outline.children.length > 0) {
      const childSections = expandOutlinesToSections(
        outline.children,
        depth + 1,
        currentIndex,
        globalParams
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
 * @param usageAccumulator 可选，用于长文写作时累积 LLM 用量（计费）
 */
async function compressText(
  text: string,
  maxLength: number = 500,
  provider?: ProviderType,
  usageAccumulator?: UsageAccumulator
): Promise<string> {
  // 如果文本已经在限制内，直接返回
  if (text.length <= maxLength) {
    return text;
  }

  // 计算需要保留的最后部分（200字）
  const keepLastChars = 200;
  const lastPart = text.slice(-keepLastChars);
  const firstPart = text.slice(0, text.length - keepLastChars);

  // 使用 BasicText 能力总结压缩前文部分
  const compressPrompt = `请将以下内容压缩总结到${maxLength - keepLastChars}字以内，保留关键信息和逻辑关系：

${firstPart}

要求：
- 保留核心观点和关键信息
- 保持逻辑连贯性
- 压缩后的内容应该能够与后续内容自然衔接
- 只返回压缩后的文本，不要添加任何说明或标记`;

  try {
    let compressedFirstPart: string;
    if (usageAccumulator) {
      const basicResult = await runBasicText('writing-basic-text', compressPrompt, {
        providerOverride: provider,
      });
      const meta = basicResult.usage.metadata as
        | {
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
              input_tokens?: number;
              output_tokens?: number;
            };
            model?: string;
            provider?: string;
          }
        | undefined;
      addUsage(usageAccumulator, meta);
      compressedFirstPart = basicResult.text;
    } else {
      const basicResult = await runBasicText('writing-basic-text', compressPrompt, {
        providerOverride: provider,
      });
      compressedFirstPart = basicResult.text;
    }
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
 * 从 runByModelKey 结果提取正文（兼容 maxplan 等仅写 metadata.text / mediaUrls 的 Provider）
 */
function extractGenerateText(
  result: unknown,
  fallback?: { provider?: string; model?: string },
): string {
  const r = result as { text?: string; metadata?: Record<string, unknown>; mediaUrls?: string[] };
  const direct = r.text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const mt = r.metadata?.text;
  if (typeof mt === 'string' && mt.trim()) return mt.trim();
  const urls = r.mediaUrls;
  if (Array.isArray(urls) && urls.length && typeof urls[0] === 'string' && !urls[0].startsWith('http')) {
    return urls[0].trim();
  }
  const provider = r.metadata?.provider ?? fallback?.provider ?? 'unknown';
  const model = r.metadata?.model ?? fallback?.model ?? 'unknown';
  throw new Error(`LLM 生成结果为空（provider=${provider}, model=${model}）`);
}

/**
 * 生成文本（调用 LLM）- 同步模式
 * 仅通过 models/registry + runByModelKey（单轨）
 */
async function generateText(
  modelName: string,
  prompt: string,
  provider?: ProviderType,
  llmParams?: Record<string, any>
): Promise<string> {
  const result = await runByModelKey(
    'writing',
    modelName,
    { prompt, outputFormat: 'json', ...llmParams },
    { providerOverride: provider }
  );
  return extractGenerateText(result, { provider, model: modelName });
}

/**
 * 用于多轮 LLM 调用的 usage 累加器（并行/流水形长文写作）
 */
export interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string;
  provider?: string;
}

function createUsageAccumulator(): UsageAccumulator {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(
  acc: UsageAccumulator,
  meta?: { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number }; model?: string; provider?: string }
): void {
  if (!meta) return;
  const u = meta.usage as Record<string, number> | undefined;
  if (u) {
    const pt = Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0;
    const ct = Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0;
    acc.inputTokens += pt;
    acc.outputTokens += ct;
    acc.totalTokens = acc.inputTokens + acc.outputTokens;
  }
  if (meta.model) acc.model = meta.model;
  if (meta.provider) acc.provider = meta.provider;
}

function toLlmMetadata(acc: UsageAccumulator): { usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; model: string; provider: string } | undefined {
  if (acc.inputTokens === 0 && acc.outputTokens === 0) return undefined;
  return {
    usage: {
      prompt_tokens: acc.inputTokens,
      completion_tokens: acc.outputTokens,
      total_tokens: acc.totalTokens || acc.inputTokens + acc.outputTokens,
    },
    model: acc.model || 'unknown',
    provider: acc.provider || 'unknown',
  };
}

/**
 * 生成文本并返回 usage / model / provider（用于 Provider 用量记录与余额扣减）
 */
function buildVisionParametersFromReferenceImage(
  sourceParams?: Record<string, any>,
): Record<string, any> | undefined {
  const ref = sourceParams?.referenceImage;
  if (!Array.isArray(ref) || ref.length === 0) return undefined;
  const images: string[] = [];
  for (const row of ref) {
    const c = row && typeof row === 'object' ? (row as { content?: string }).content : undefined;
    if (typeof c === 'string' && c.trim()) images.push(c.trim());
  }
  if (images.length === 0) return undefined;
  if (images.length === 1) return { image: images[0] };
  return { image_base64s: images };
}

async function generateTextWithMetadata(
  modelName: string,
  prompt: string,
  provider?: ProviderType,
  llmParams?: Record<string, any>,
  sourceParams?: Record<string, any>,
): Promise<{ text: string; metadata?: { usage?: unknown; model?: string; provider?: string } }> {
  const visionParams = buildVisionParametersFromReferenceImage(sourceParams);
  const result = await runByModelKey(
    'writing',
    modelName,
    {
      prompt,
      outputFormat: 'json',
      ...llmParams,
      ...(Array.isArray(sourceParams?.referenceImage) && sourceParams.referenceImage.length > 0
        ? { referenceImage: sourceParams.referenceImage }
        : {}),
      ...(visionParams ? { parameters: { ...(llmParams?.parameters ?? {}), ...visionParams } } : {}),
    },
    { providerOverride: provider }
  );
  const text = extractGenerateText(result, { provider, model: modelName });
  const meta = (result as { metadata?: Record<string, unknown> }).metadata;
  return {
    text,
    metadata: meta
      ? {
          usage: meta.usage,
          model: meta.model as string | undefined,
          provider: meta.provider as string | undefined,
        }
      : undefined,
  };
}

/**
 * 生成文本（调用 LLM）- 流式模式
 * 仅通过 models/registry + runByModelKey（单轨）
 */
async function generateTextStream(
  modelName: string,
  prompt: string,
  provider?: ProviderType,
  llmParams?: Record<string, any>
): Promise<AsyncIterable<unknown>> {
  const result = await runByModelKey(
    'writing',
    modelName,
    { prompt, outputFormat: 'stream', enableCollection: false, ...llmParams },
    { providerOverride: provider }
  );
  const r = result as { stream?: AsyncIterable<unknown>; streamString?: AsyncIterable<string> };
  if (r.stream) return r.stream;
  if (r.streamString) {
    return (async function* () {
      for await (const chunk of r.streamString!) {
        yield { chunk, status: 'streaming' as const, collection: '' };
      }
      yield { chunk: '', status: 'completed' as const, collection: '' };
    })();
  }
  throw new Error('LLM 不支持流式输出');
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
    /** 由 Task v2 / Admin 配置写入：用于大纲的显式模型路由（logicalModel） */
    logicalModel?: string;
    maxDepth?: number;
    expectedNodes?: number;
    total_textcount?: number;
    total_duration_seconds?: number;
    /** @deprecated 请使用 total_duration_seconds，兼容旧请求：分钟转秒 */
    total_duration_minutes?: number;
    applyto?: OutlineApplyTo;
    outline_type?: OutlineType;
    outline_structure_type?: OutlineStructureType;
    stance?: string;
    tone?: string;
    speech_rate?: string;
    voice_script_rhythm?: string;
    rhythm?: string;
    knowledgeBase?: Array<{
      knowledgeBaseId: string;
      query: string;
      limit?: number;
    }>;
    cast_character_count?: number;
    /** 输出语言：'zh' | 'en'，默认 'zh' */
    language?: import('@mxmai/mxmdata').AppLocale;
  },
  userId?: string,
  provider?: ProviderType
): AsyncGenerator<{ chunk: string; status: 'streaming' | 'completed'; collection: string }, void, unknown> {
  const lang = normalizeWritingLanguage(params.language);
  // 0. 参数验证（与 generateOutline 相同）
  if (params.applyto) {
    if (!OUTLINE_APPLY_TO_VALUES.includes(params.applyto)) {
      throw new Error(`不支持的 applyto 类型: ${params.applyto}。仅支持: ${OUTLINE_APPLY_TO_VALUES.join(', ')}`);
    }

    // total_duration_seconds 为选填：不填则可在写作分镜/口播时再补充
  }

  // 1. 按业务 key 解析 provider + 模型（V2动态路由）
  const routingKeyOverride = typeof params.logicalModel === 'string' && params.logicalModel.trim()
    ? params.logicalModel.trim()
    : undefined;
  let modelName: string;
  let effectiveProvider: ProviderType;
  if (routingKeyOverride) {
    // V2 path: 使用 Task V2 已解析的物理模型
    modelName = routingKeyOverride;
    effectiveProvider = provider ?? 'openrouter';
  } else {
    // V1 path: 从 writing_scope_config 解析 'outlines' 业务模型
    const r = await resolveWritingModel('outlines', 'default');
    modelName = r.modelName;
    effectiveProvider = r.provider;
  }

  // 3. 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 4. 构建大纲生成的 prompt
  const effectiveMaxDepth =
    params.applyto === 'storyboard-scripts'
      ? (params.maxDepth ?? 2)
      : (params.maxDepth || 3);

  const langInstruction = writingLangInstruction(lang);

  let outlinePrompt = `${langInstruction}${lang === 'zh' ? '请根据以下要求生成一个写作大纲：' : 'Generate a writing outline according to the following requirements:'}

${enhancedPrompt}

${lang === 'zh' ? '要求：' : 'Requirements:'}
- ${lang === 'zh' ? '大纲层级深度' : 'Outline depth'}: ${effectiveMaxDepth} ${lang === 'zh' ? '级' : 'levels'}
${params.expectedNodes ? `- ${lang === 'zh' ? '期望节点总数：约' : 'Expected nodes: about'} ${params.expectedNodes} ${lang === 'zh' ? '个' : ''}` : ''}`;

  // 根据 applyto 添加字数或时长要求
  if (params.applyto === 'articles' && params.total_textcount) {
    outlinePrompt += `
- 总字数要求：${params.total_textcount} 字
- 大纲将用于生成：文章类型内容
- 字数分配原则：
  * 根据文章类型的内容结构特点进行字数分配
  * 核心章节（正文主体）应分配更多字数（约占总字数的 60-70%）
  * 次要章节（引言、结尾）分配较少字数（约占总字数的 10-20%）
  * 一级标题节点通常比二级、三级节点分配更多字数
  * 确保总字数符合 ${params.total_textcount} 字的要求`;
  } else if (params.applyto === 'articles' && !params.total_textcount) {
    outlinePrompt += `
- 总字数要求：未指定（请你根据主题、结构、节点数与写作场景，自行确定整体篇幅与各节点篇幅，保持合理分配即可）`;
  } else if ((params.applyto === 'voice-scripts' || params.applyto === 'storyboard-scripts') && (params.total_duration_seconds != null || params.total_duration_minutes != null)) {
    const totalDurationSec = params.total_duration_seconds ?? (params.total_duration_minutes != null ? params.total_duration_minutes * 60 : undefined);
    if (totalDurationSec != null) {
      const typeName = params.applyto === 'voice-scripts' ? '口播稿' : '分镜脚本';
      outlinePrompt += `
- 总时长要求：${totalDurationSec} 秒
- 大纲将用于生成：${typeName}类型内容
- 时长分配原则：
  * 根据 ${typeName} 类型的内容结构特点进行时长分配
  * 核心部分应分配更多时长（约占总时长的 60-70%）
  * 次要部分分配较少时长（约占总时长的 10-20%）
  * 请根据时长合理分配各部分的篇幅，确保总时长符合 ${totalDurationSec} 秒的要求`;
    }
  }

  // 添加结构类型模板（如果指定了结构类型）
  if (params.outline_structure_type) {
    const structureTemplate = getStructurePromptTemplate(params.outline_structure_type, lang);
    if (structureTemplate) {
      outlinePrompt += `\n\n${structureTemplate}`;
    }
  }

  // 分镜脚本不需要整体立场/语调：即使传入也忽略，避免影响分镜生成
  if (params.applyto !== 'storyboard-scripts') {
    // 添加整体立场和语调要求（如果提供了）
    if (params.stance) {
      outlinePrompt += `
- 整体立场要求：${params.stance}（整个大纲应保持一致的立场）`;
    }
    if (params.tone) {
      outlinePrompt += `
- 整体语调要求：${params.tone}（整个大纲应保持一致的语调）`;
    }
  }

  const requireStanceTonePerNode =
    params.applyto !== 'storyboard-scripts' && (!!params.stance || !!params.tone);

  const requireVoiceSpeechRatePerNode =
    params.applyto === 'voice-scripts' && !!params.speech_rate;

  const requireStoryboardRhythmPerNode =
    params.applyto === 'storyboard-scripts' && !!params.rhythm;

  const totalDurationSecForNode =
    params.total_duration_seconds ?? (params.total_duration_minutes != null ? params.total_duration_minutes * 60 : undefined);

  outlinePrompt += `
- 每个节点需要包含：content（标题内容）、motivation（写作动机，可选）、length（长度要求，可选）、key_elements（关键要素，可选）
- cast（出场角色，可选）：string 数组，可填角色 id 或 name；可省略或空数组表示纯镜头/旁白/氛围段落（正常）
${requireStanceTonePerNode ? `- **强制要求**：由于已指定整体立场/语调，**每个节点都必须输出 stance 和 tone 字段**，并默认继承整体值：stance="${params.stance || ''}", tone="${params.tone || ''}"（如需局部差异才在该节点修改，但必须始终输出这两个字段）` : `- stance（立场，可选）、tone（语调，可选）`}
${requireVoiceSpeechRatePerNode && totalDurationSecForNode != null ? `- **强制要求（口播稿）**：已指定语速 speech_rate="${params.speech_rate}"（单位：字/分钟，CPM）。请按以下可计算规则约束每个节点：\n  1) 总字数估算：total_chars ≈ (total_duration_seconds/60) * speech_rate，总时长=${totalDurationSecForNode}秒\n  2) 每个节点必须输出 speech_rate 字段（默认继承全局）\n  3) 每个节点的 length 必须以“秒”为单位，并同时给出字数估算：例如 "30秒（约100字）"\n  4) 计算关系：node_chars ≈ (node_seconds/60) * speech_rate\n  5) 所有有 content 的节点时长之和 ≈ ${totalDurationSecForNode} 秒（允许 2-5% 浮动用于停顿/转场）` : requireVoiceSpeechRatePerNode ? `- **强制要求（口播稿）**：已指定语速 speech_rate="${params.speech_rate}"（单位：字/分钟，CPM）。请按可计算规则约束每个节点：每个节点必须输出 speech_rate 字段，length 以“秒”为单位并给出字数估算。` : ''}
${requireStoryboardRhythmPerNode && totalDurationSecForNode != null ? `- **强制要求（分镜脚本）**：已指定节奏 rhythm="${params.rhythm}"（单位：镜头/分钟，SPM）。请按以下可计算规则约束每个节点：\n  1) 平均镜头时长：avg_shot_seconds ≈ 60 / rhythm\n  2) 每个节点必须输出 rhythm 字段（默认继承全局）\n  3) 每个节点的 length 必须以“秒”为单位，例如 "12秒"\n  4) 快节奏=更短镜头/更密集，慢节奏=更长镜头/更留白；节点时长应与 avg_shot_seconds 合理匹配\n  5) 所有有 content 的节点时长之和 ≈ ${totalDurationSecForNode} 秒（允许 2-5% 浮动用于转场/留白）` : requireStoryboardRhythmPerNode ? `- **强制要求（分镜脚本）**：已指定节奏 rhythm="${params.rhythm}"（单位：镜头/分钟，SPM）。请按可计算规则约束每个节点：每个节点必须输出 rhythm 字段，length 以“秒”为单位。` : ''}
- **重要**：必须返回完整的、有效的 JSON 对象，不要截断，不要添加任何额外的文字说明
- 返回 JSON：直接返回 Outline 对象（不包含 characters 字段，角色信息已在上方提供）

请返回一个完整的、有效的 JSON 对象，格式如下：
{
  "uid": "${params.uid}",
  "content": "主标题",
  "children": [
    {
      "uid": "sub_1",
      "content": "子标题1",
      "children": []
    }
  ]
}

**关键要求**：
1. 必须返回完整的 JSON，不要截断
2. 确保所有大括号、中括号、引号都正确闭合
3. 不要在大纲内容中添加任何解释性文字
4. 直接返回 JSON 对象，不需要 markdown 代码块包装`;

  // 5. 调用 LLM 生成（流式）
  const stream = await generateTextStream(modelName, outlinePrompt, effectiveProvider);

  // 5. 返回流式结果
  for await (const chunk of stream) {
    yield chunk;
  }
}

export async function generateOutline(
  params: {
    uid: string;
    prompt: string;
    /** 由 Task v2 / Admin 配置写入：用于大纲的显式模型路由（logicalModel） */
    logicalModel?: string;
    maxDepth?: number;
    expectedNodes?: number;
    total_textcount?: number;
    total_duration_seconds?: number;
    /** @deprecated 请使用 total_duration_seconds，兼容旧请求：分钟转秒 */
    total_duration_minutes?: number;
    applyto?: OutlineApplyTo;
    outline_type?: OutlineType;
    outline_structure_type?: OutlineStructureType;
    stance?: string;
    tone?: string;
    speech_rate?: string;
    voice_script_rhythm?: string;
    rhythm?: string;
    knowledgeBase?: Array<{
      knowledgeBaseId: string;
      query: string;
      limit?: number;
    }>;
    cast_character_count?: number;
    language?: import('@mxmai/mxmdata').AppLocale;
  },
  userId?: string,
  provider?: ProviderType
): Promise<{ outline: Outline; characters?: CharacterProfile[] }> {
  const lang = normalizeWritingLanguage(params.language);
  // 0. 参数验证
  if (params.applyto) {
    if (!OUTLINE_APPLY_TO_VALUES.includes(params.applyto)) {
      throw new Error(`不支持的 applyto 类型: ${params.applyto}。仅支持: ${OUTLINE_APPLY_TO_VALUES.join(', ')}`);
    }

    // total_duration_seconds 为选填：不填则可在写作分镜/口播时再补充

  }

  // 1. 按业务 key 解析 provider + 模型（V2动态路由）
  const routingKeyOverride =
    typeof params.logicalModel === 'string' && params.logicalModel.trim()
      ? params.logicalModel.trim()
      : undefined;
  let modelName: string;
  let effectiveProvider: ProviderType;
  if (routingKeyOverride) {
    // V2 path: 使用 Task V2 已解析的物理模型
    modelName = routingKeyOverride;
    effectiveProvider = provider ?? 'openrouter';
  } else {
    // V1 path: 从 writing_scope_config 解析 'outlines' 业务模型
    const r = await resolveWritingModel('outlines', 'default');
    modelName = r.modelName;
    effectiveProvider = r.provider;
  }

  let promptToSend: string;
  // v2 仅用 TaskTemplate 拼好的 prompt，不兼容、不拼接任何老逻辑；只有老接口（未传 useConfiguredPrompt）才走下方拼接
  if (params.useConfiguredPrompt === true) {
    promptToSend = (params.prompt || '').trim();
  } else {
  // 老接口：检索知识库 + 拼接结构类型 / 节点格式 / 时长节奏等（v2 不进入此分支）
  // 3. 检索知识库内容（如果有）
  let enhancedPrompt = params.prompt;
  if (params.knowledgeBase && params.knowledgeBase.length > 0) {
    const knowledgeResults = await retrieveKnowledge(params.knowledgeBase, userId);
    const knowledgeContext = formatKnowledgeContext(knowledgeResults, params.knowledgeBase);
    enhancedPrompt = enhancePromptWithKnowledge(params.prompt, knowledgeContext);
  }

  // 4. 构建大纲生成的 prompt
  const effectiveMaxDepth =
    params.applyto === 'storyboard-scripts'
      ? (params.maxDepth ?? 2)
      : (params.maxDepth || 3);

  const langInstruction = writingLangInstruction(lang);

  let outlinePrompt = `${langInstruction}${lang === 'zh' ? '请根据以下要求生成一个写作大纲：' : 'Generate a writing outline according to the following requirements:'}

${enhancedPrompt}

${lang === 'zh' ? '要求：' : 'Requirements:'}
- ${lang === 'zh' ? '大纲层级深度' : 'Outline depth'}: ${effectiveMaxDepth} ${lang === 'zh' ? '级' : 'levels'}
${params.expectedNodes ? `- ${lang === 'zh' ? '期望节点总数：约' : 'Expected nodes: about'} ${params.expectedNodes} ${lang === 'zh' ? '个' : ''}` : ''}`;

  // 根据 applyto 添加字数或时长要求
  if (params.applyto === 'articles' && params.total_textcount) {
    outlinePrompt += `
- 总字数要求：${params.total_textcount} 字
- 大纲将用于生成：文章类型内容
- 字数分配原则：
  * 根据文章类型的内容结构特点进行字数分配
  * 核心章节（正文主体）应分配更多字数（约占总字数的 60-70%）
  * 次要章节（引言、结尾）分配较少字数（约占总字数的 10-20%）
  * 一级标题节点通常比二级、三级节点分配更多字数
  * 确保总字数符合 ${params.total_textcount} 字的要求`;
  } else if ((params.applyto === 'voice-scripts' || params.applyto === 'storyboard-scripts') && (params.total_duration_seconds != null || params.total_duration_minutes != null)) {
    const totalDurationSec = params.total_duration_seconds ?? (params.total_duration_minutes != null ? params.total_duration_minutes * 60 : undefined);
    if (totalDurationSec != null) {
      const typeName = params.applyto === 'voice-scripts' ? '口播稿' : '分镜脚本';
      outlinePrompt += `
- 总时长要求：${totalDurationSec} 秒
- 大纲将用于生成：${typeName}类型内容
- 时长分配原则：
  * 根据 ${typeName} 类型的内容结构特点进行时长分配
  * 核心部分应分配更多时长（约占总时长的 60-70%）
  * 次要部分分配较少时长（约占总时长的 10-20%）
  * 请根据时长合理分配各部分的篇幅，确保总时长符合 ${totalDurationSec} 秒的要求`;
    }
  }

  // 添加结构类型模板（如果指定了结构类型）
  if (params.outline_structure_type) {
    const structureTemplate = getStructurePromptTemplate(params.outline_structure_type, lang);
    if (structureTemplate) {
      outlinePrompt += `\n\n${structureTemplate}`;
    }
  }

  const requireStanceTonePerNode =
    params.applyto !== 'storyboard-scripts' && (!!params.stance || !!params.tone);

  const requireVoiceSpeechRatePerNode =
    params.applyto === 'voice-scripts' && !!params.speech_rate;

  const requireStoryboardRhythmPerNode =
    params.applyto === 'storyboard-scripts' && !!params.rhythm;

  const totalDurationSecForNode =
    params.total_duration_seconds ?? (params.total_duration_minutes != null ? params.total_duration_minutes * 60 : undefined);

  outlinePrompt += `
- 每个节点需要包含：content（标题内容）、motivation（写作动机，可选）、length（长度要求，可选）、key_elements（关键要素，可选）
- cast（出场角色，可选）：string 数组，可填角色 id 或 name；可省略或空数组表示纯镜头/旁白/氛围段落（正常）
${requireStanceTonePerNode ? `- **强制要求**：由于已指定整体立场/语调，**每个节点都必须输出 stance 和 tone 字段**，并默认继承整体值：stance="${params.stance || ''}", tone="${params.tone || ''}"（如需局部差异才在该节点修改，但必须始终输出这两个字段）` : `- stance（立场，可选）、tone（语调，可选）`}
${requireVoiceSpeechRatePerNode && totalDurationSecForNode != null ? `- **强制要求（口播稿）**：已指定语速 speech_rate="${params.speech_rate}"（单位：字/分钟，CPM）。请按以下可计算规则约束每个节点：\n  1) 总字数估算：total_chars ≈ (total_duration_seconds/60) * speech_rate，总时长=${totalDurationSecForNode}秒\n  2) 每个节点必须输出 speech_rate 字段（默认继承全局）\n  3) 每个节点的 length 必须以“秒”为单位，并同时给出字数估算：例如 "30秒（约100字）"\n  4) 计算关系：node_chars ≈ (node_seconds/60) * speech_rate\n  5) 所有有 content 的节点时长之和 ≈ ${totalDurationSecForNode} 秒（允许 2-5% 浮动用于停顿/转场）` : requireVoiceSpeechRatePerNode ? `- **强制要求（口播稿）**：已指定语速 speech_rate="${params.speech_rate}"（单位：字/分钟，CPM）。请按可计算规则约束每个节点：每个节点必须输出 speech_rate 字段，length 以“秒”为单位并给出字数估算。` : ''}
${requireStoryboardRhythmPerNode && totalDurationSecForNode != null ? `- **强制要求（分镜脚本）**：已指定节奏 rhythm="${params.rhythm}"（单位：镜头/分钟，SPM）。请按以下可计算规则约束每个节点：\n  1) 平均镜头时长：avg_shot_seconds ≈ 60 / rhythm\n  2) 每个节点必须输出 rhythm 字段（默认继承全局）\n  3) 每个节点的 length 必须以“秒”为单位，例如 "12秒"\n  4) 快节奏=更短镜头/更密集，慢节奏=更长镜头/更留白；节点时长应与 avg_shot_seconds 合理匹配\n  5) 所有有 content 的节点时长之和 ≈ ${totalDurationSecForNode} 秒（允许 2-5% 浮动用于转场/留白）` : requireStoryboardRhythmPerNode ? `- **强制要求（分镜脚本）**：已指定节奏 rhythm="${params.rhythm}"（单位：镜头/分钟，SPM）。请按可计算规则约束每个节点：每个节点必须输出 rhythm 字段，length 以“秒”为单位。` : ''}
- **重要**：必须返回完整的、有效的 JSON 对象，不要截断，不要添加任何额外的文字说明
- 返回 JSON：直接返回 Outline 对象（不包含 characters 字段，角色信息已在上方提供）

请返回一个完整的、有效的 JSON 对象，格式如下：
{
  "uid": "${params.uid}",
  "content": "主标题",
  "children": [
    {
      "uid": "sub_1",
      "content": "子标题1",
      "children": []
    }
  ]
}

**关键要求**：
1. 必须返回完整的 JSON，不要截断
2. 确保所有大括号、中括号、引号都正确闭合
3. 不要在大纲内容中添加任何解释性文字
4. 直接返回 JSON 对象，不需要 markdown 代码块包装`;

  promptToSend = outlinePrompt;
  }

  // 4. 调用 LLM 生成（带回 metadata 用于 usage 记录与 provider 余额扣减）
  const { text: resultText, metadata: llmMetadata } = await generateTextWithMetadata(
    modelName,
    promptToSend,
    effectiveProvider
  );

  // 5. 解析 JSON 结果
  try {
    // 尝试提取 JSON（可能包含 markdown 代码块或前置说明文字）
    let jsonText = resultText.trim();
    
    // 方法1：尝试匹配 markdown 代码块（```json 或 ```）
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      jsonText = codeBlockMatch[1].trim();
    } else {
      // 方法2：尝试找到第一个 { 和最后一个 }
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      } else if (firstBrace === -1 && (jsonText.startsWith('#') || jsonText.startsWith('*') || /^[#*\d、.-]/.test(jsonText))) {
        // 模型返回了 Markdown/说明文字而非 JSON，给出明确提示
        throw new Error(
          '模型返回了 Markdown 或说明文字而非 JSON。请在业务管理中将该任务的 outputFormatTemplate 置顶加入：' +
          '「你的回复有且仅能是一个 JSON 对象，第一个非空字符必须是 {，禁止输出 # 标题、章节说明等」。'
        );
      }
    }

    // 尝试解析 JSON
    let outline: Outline;
    try {
      const parsed: any = JSON.parse(jsonText);
      // 如果返回的是包含 outline 字段的对象，提取 outline
      if (parsed && typeof parsed === 'object' && parsed.outline) {
        outline = parsed.outline as Outline;
      } else {
        // 否则直接使用解析结果作为 outline
        outline = parsed as Outline;
      }
    } catch (parseError) {
      // 如果解析失败，尝试修复常见的 JSON 问题
      // 1. 移除尾部的未闭合引号或括号
      let cleanedJson = jsonText;
      
      // 尝试找到最后一个完整的 JSON 对象
      let braceCount = 0;
      let lastValidBrace = -1;
      for (let i = 0; i < cleanedJson.length; i++) {
        if (cleanedJson[i] === '{') braceCount++;
        if (cleanedJson[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastValidBrace = i;
          }
        }
      }
      
      if (lastValidBrace !== -1 && lastValidBrace < cleanedJson.length - 1) {
        // 如果找到完整的 JSON 对象，截取到该位置
        cleanedJson = cleanedJson.substring(0, lastValidBrace + 1);
      } else if (braceCount > 0) {
        // 如果还有未闭合的大括号，尝试补全
        cleanedJson = cleanedJson + '}'.repeat(braceCount);
      }
      
      // 再次尝试解析
      try {
        const parsed: any = JSON.parse(cleanedJson);
        // 如果返回的是包含 outline 字段的对象，提取 outline
        if (parsed && typeof parsed === 'object' && parsed.outline) {
          outline = parsed.outline as Outline;
        } else {
          // 否则直接使用解析结果作为 outline
          outline = parsed as Outline;
        }
      } catch (retryError) {
        // 如果还是失败，记录详细错误信息
        console.error('[WritingService] JSON 解析失败:', {
          originalLength: resultText.length,
          extractedLength: jsonText.length,
          cleanedLength: cleanedJson.length,
          error: parseError,
          retryError: retryError,
          preview: resultText.substring(0, 500),
        });
        throw new Error(`大纲生成失败：无法解析 JSON 结果。请检查 LLM 返回的内容是否完整。原始结果预览：${resultText.substring(0, 300)}...`);
      }
    }
    
    // 确保 uid 正确
    if (!outline.uid) {
      outline.uid = params.uid;
    }

    // 返回大纲、角色信息及 LLM metadata（用于 Provider 用量记录与余额扣减）
    return {
      outline,
      _llmMetadata: llmMetadata
        ? { usage: llmMetadata.usage, model: llmMetadata.model || modelName, provider: llmMetadata.provider || effectiveProvider }
        : { usage: undefined, model: modelName, provider: effectiveProvider },
    };
  } catch (error) {
    console.error('[WritingService] 解析大纲 JSON 失败:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`大纲生成失败：${errorMessage}。原始结果预览：${resultText.substring(0, 300)}...`);
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
  hasGlobalKnowledgeInPrompt: boolean = false,
  useKnowledge: boolean = true
): AsyncGenerator<WritingStreamChunk, void, unknown> {
  // V2: 使用 params.logicalModel（由 generateWriting 传入，V2 path 已解析）
  // V1 path: params.logicalModel 必须已通过 resolveWritingModel 解析
  const modelName = params.logicalModel;
  if (!modelName) {
    throw new Error('[WritingService] generateWritingParallel/Sequential: params.logicalModel 未设置，请检查 writing_scope_config 配置');
  }
  // 根据 writing_type 和 format 自动判断是否启用 Markdown
  const enableMarkdown = shouldEnableMarkdown(params.writing_type, params.format);
  // 构建 LLM 调用参数（temperature / maxTokens / topP）
  const llmParams: Record<string, any> = {};
  if (params.temperature != null) llmParams.temperature = params.temperature;
  if (params.maxTokens != null) llmParams.max_tokens = params.maxTokens;
  if (params.topP != null) llmParams.top_p = params.topP;

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
      // 构建段落 prompt（动态提取参数）
      const currentWritingType = params.writing_type || 'articles';
      
      // 构建写作指导：全局参数作为基础，节点参数作为相对调整
      const globalGuidance = section.globalParams 
        ? buildWritingGuidance(section.globalParams, currentWritingType, params.outline_type as any)
        : [];
      const sectionGuidance = buildWritingGuidance(section, currentWritingType, params.outline_type as any);

      // 检索知识库（优先使用段落配置，否则使用全局配置）
      let sectionKnowledgeContext = '';
      let hasKnowledge = false;
      const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
      const processStyle = params.process_style || 'silent';
      
      if (useKnowledge && knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
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

      // 获取写作类型配置（使用已声明的 currentWritingType）
      // 特殊格式分支：lyrics+suno / voice-scripts+tts
      let typeRules: string | undefined;
      let typeOutputFormat: string | undefined;
      
      if (currentWritingType === 'lyrics' && params.format === 'suno') {
        const { lyricsConfig } = await import('./wtconfigs/lyrics');
        const sunoFormat = lyricsConfig.getSunoFormatRules!();
        typeRules = sunoFormat.rules;
        typeOutputFormat = sunoFormat.outputformat;
      } else if (currentWritingType === 'voice-scripts' && params.format === 'tts') {
        const { voiceScriptsConfig } = await import('./wtconfigs/voice-scripts');
        const ttsFormat = voiceScriptsConfig.getTtsFormatRules?.();
        const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
        typeRules = ttsFormat?.rules || resolved.rules;
        typeOutputFormat = ttsFormat?.outputformat || resolved.outputFormat;
      } else {
        const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
        typeRules = resolved.rules;
        typeOutputFormat = resolved.outputFormat;
      }

      // 构建写作指导文本（全局参数作为基础，节点参数作为相对调整）
      let guidanceText = '';
      if (globalGuidance.length > 0 || sectionGuidance.length > 0) {
        guidanceText = '【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：\n';
        
        if (globalGuidance.length > 0) {
          guidanceText += `【整体基础参数】（整篇文章的基础风格，必须始终遵循）：\n${globalGuidance.map(g => `  ${g}`).join('\n')}\n`;
        }
        
        if (sectionGuidance.length > 0) {
          if (globalGuidance.length > 0) {
            guidanceText += `【本段落调整参数】（在整体基础参数上的相对调整，用于本段落的特殊需求）：\n${sectionGuidance.map(g => `  ${g}`).join('\n')}\n`;
            guidanceText += `\n⚠️ 重要：本段落的最终风格 = 整体基础参数 + 本段落调整参数。必须在整体风格基础上进行自然过渡，避免突然的风格转换（例如：不能从"完全批判"突然转到"完全支持"）。`;
          } else {
            guidanceText += `${sectionGuidance.join('\n')}\n`;
          }
        }
        
        guidanceText += `\n⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来`;
      }

      // 根据细分类型添加额外的规则说明
      const subtypeRules = params.outline_type 
        ? getSubtypeRules(params.writing_type, params.outline_type)
        : null;

      // 角色画像与出场角色（cast）
      const characters = await getCharactersFromParams(params, userId);
      const charactersText =
        characters && characters.length > 0
          ? `【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：\n${formatCharactersForPrompt(characters)}`
          : '';
      const castCharacters =
        characters && characters.length > 0 ? resolveCastCharacters(characters, section.cast) : [];
      const castText =
        section.cast && section.cast.length > 0
          ? castCharacters.length > 0
            ? `【本段出场角色（cast）】（仅这些角色出场/发言；其他角色不得出现）：\n- ${castCharacters.map((c) => `${c.name}(${c.id})`).join('\n- ')}`
            : `【本段出场角色（cast）】（按 name/id 引用未匹配到角色画像，请检查）：\n- ${section.cast.join('\n- ')}`
          : `【本段 cast】未指定（允许纯镜头/旁白/氛围段落，不强制角色出场）`;

      const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
${subtypeRules ? `【细分类型要求】：
${subtypeRules}

---` : ''}
${charactersText ? `${charactersText}\n\n---\n\n${castText}\n\n---` : ''}
【段落标题】：${section.content}
${guidanceText}
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
      const stream = await generateTextStream(modelName, sectionPrompt, provider, llmParams);
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
  hasGlobalKnowledgeInPrompt: boolean = false,
  useKnowledge: boolean = true
): AsyncGenerator<WritingStreamChunk, void, unknown> {
  // V2: 使用 params.logicalModel（由 generateWriting 传入，V2 path 已解析）
  // V1 path: params.logicalModel 必须已通过 resolveWritingModel 解析
  const modelName = params.logicalModel;
  if (!modelName) {
    throw new Error('[WritingService] generateWritingParallel/Sequential: params.logicalModel 未设置，请检查 writing_scope_config 配置');
  }
  // 根据 writing_type 和 format 自动判断是否启用 Markdown
  const enableMarkdown = shouldEnableMarkdown(params.writing_type, params.format);
  // 构建 LLM 调用参数（temperature / maxTokens / topP）
  const llmParams: Record<string, any> = {};
  if (params.temperature != null) llmParams.temperature = params.temperature;
  if (params.maxTokens != null) llmParams.max_tokens = params.maxTokens;
  if (params.topP != null) llmParams.top_p = params.topP;
  let previousMemory = ''; // 前文记忆

  for (const section of sections) {
    try {
      // 如果前文超过500字，压缩记忆
      if (previousMemory.length > 500) {
        previousMemory = await compressText(previousMemory, 500, provider);
      }

      // 构建段落 prompt：全局参数作为基础，节点参数作为相对调整
      const currentWritingType = params.writing_type || 'articles';
      const globalGuidance = section.globalParams 
        ? buildWritingGuidance(section.globalParams, currentWritingType, params.outline_type as any)
        : [];
      const sectionGuidance = buildWritingGuidance(section, currentWritingType, params.outline_type as any);
      
      // 构建写作指导文本
      let guidanceText = '';
      if (globalGuidance.length > 0 || sectionGuidance.length > 0) {
        guidanceText = '【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：\n';
        
        if (globalGuidance.length > 0) {
          guidanceText += `【整体基础参数】（整篇文章的基础风格，必须始终遵循）：\n${globalGuidance.map(g => `  ${g}`).join('\n')}\n`;
        }
        
        if (sectionGuidance.length > 0) {
          if (globalGuidance.length > 0) {
            guidanceText += `【本段落调整参数】（在整体基础参数上的相对调整，用于本段落的特殊需求）：\n${sectionGuidance.map(g => `  ${g}`).join('\n')}\n`;
            guidanceText += `\n⚠️ 重要：本段落的最终风格 = 整体基础参数 + 本段落调整参数。必须在整体风格基础上进行自然过渡，避免突然的风格转换（例如：不能从"完全批判"突然转到"完全支持"）。`;
          } else {
            guidanceText += `${sectionGuidance.join('\n')}\n`;
          }
        }
        
        guidanceText += `\n⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来`;
      }

      // 检索知识库（优先使用段落配置，否则使用全局配置）
      let sectionKnowledgeContext = '';
      let hasKnowledge = false;
      const hasSectionKnowledge = section.knowledgeBase && section.knowledgeBase.length > 0;
      const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
      const processStyle = params.process_style || 'silent';
      
      // 只有当段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中时，才检索和显示知识库
      if (useKnowledge && knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
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

      // 获取写作类型配置（使用已声明的 currentWritingType）
      // 特殊格式分支：lyrics+suno / voice-scripts+tts
      let typeRules: string | undefined;
      let typeOutputFormat: string | undefined;
      
      if (currentWritingType === 'lyrics' && params.format === 'suno') {
        const { lyricsConfig } = await import('./wtconfigs/lyrics');
        const sunoFormat = lyricsConfig.getSunoFormatRules!();
        typeRules = sunoFormat.rules;
        typeOutputFormat = sunoFormat.outputformat;
      } else if (currentWritingType === 'voice-scripts' && params.format === 'tts') {
        const { voiceScriptsConfig } = await import('./wtconfigs/voice-scripts');
        const ttsFormat = voiceScriptsConfig.getTtsFormatRules?.();
        const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
        typeRules = ttsFormat?.rules || resolved.rules;
        typeOutputFormat = ttsFormat?.outputformat || resolved.outputFormat;
      } else {
        const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
        typeRules = resolved.rules;
        typeOutputFormat = resolved.outputFormat;
      }

      // 根据细分类型添加额外的规则说明
      const subtypeRules = params.outline_type 
        ? getSubtypeRules(params.writing_type, params.outline_type)
        : null;

      // 角色画像与出场角色（cast）
      const characters = await getCharactersFromParams(params, userId);
      const charactersText =
        characters && characters.length > 0
          ? `【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：\n${formatCharactersForPrompt(characters)}`
          : '';
      const castCharacters =
        characters && characters.length > 0 ? resolveCastCharacters(characters, section.cast) : [];
      const castText =
        section.cast && section.cast.length > 0
          ? castCharacters.length > 0
            ? `【本段出场角色（cast）】（仅这些角色出场/发言；其他角色不得出现）：\n- ${castCharacters.map((c) => `${c.name}(${c.id})`).join('\n- ')}`
            : `【本段出场角色（cast）】（按 name/id 引用未匹配到角色画像，请检查）：\n- ${section.cast.join('\n- ')}`
          : `【本段 cast】未指定（允许纯镜头/旁白/氛围段落，不强制角色出场）`;

      const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
${subtypeRules ? `【细分类型要求】：
${subtypeRules}

---` : ''}
${charactersText ? `${charactersText}\n\n---\n\n${castText}\n\n---` : ''}
【段落标题】：${section.content}
${sectionGuidance.length > 0 ? `【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${sectionGuidance.join('\n')}

⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！
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
      const stream = await generateTextStream(modelName, sectionPrompt, provider, llmParams);
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
  // 构建 LLM 调用参数（temperature / maxTokens / topP）
  const llmParams: Record<string, any> = {};
  if (params.temperature != null) llmParams.temperature = params.temperature;
  if (params.maxTokens != null) llmParams.max_tokens = params.maxTokens;
  if (params.topP != null) llmParams.top_p = params.topP;

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
  const promptConfig = await getPromptFullConfig(
    'writing',
    params.writing_type || 'articles',
    params.outline_type ?? null,
    'zh'
  );
  const useKnowledge = promptConfig?.use_knowledge !== false; // 未配置时默认 true，保持现有行为

  if (useKnowledge && params.knowledgeBase && params.knowledgeBase.length > 0) {
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
    // 展开大纲为扁平列表，合并全局参数（全局参数作为默认值，节点参数优先）
    const globalParams = {
      motivation: params.motivation,
      stance: params.stance,
      tone: params.tone,
      length: params.length,
      key_elements: params.key_elements,
    };
    const sections = expandOutlinesToSections(params.outlines, 0, 0, globalParams);

    const isStoryboardChunkMode = params.writing_type === 'storyboard-scripts';
    const storyboardChunkSeconds: StoryboardChunkSeconds = (params.storyboard_chunk_seconds ?? 15) as StoryboardChunkSeconds;
    const storyboardChunkMaxChars = isStoryboardChunkMode ? (CHUNK_MAX_CHARS[storyboardChunkSeconds] ?? 1600) : 0;
    
    // 确定生成模式
    let generationMode = params.generation_mode || 'parallel';
    if (generationMode === 'auto') {
      // auto 模式：大纲节点 < 5 个用 sequential，>= 5 个用 parallel
      generationMode = sections.length < 5 ? 'sequential' : 'parallel';
    }

    // 判断 enhancedPrompt 是否已经包含全局知识库内容
    // 如果有全局知识库且没有段落级配置，enhancedPrompt 会包含知识库内容
    const hasGlobalKnowledgeInPrompt = useKnowledge && !!(params.knowledgeBase && params.knowledgeBase.length > 0 && 
      !params.outlines?.some(outline => outline.knowledgeBase && outline.knowledgeBase.length > 0));

    // 根据模式选择生成函数
    if (generationMode === 'parallel') {
      // 并行模式
      yield* generateWritingParallel(sections, params, userId, provider, enhancedPrompt, hasGlobalKnowledgeInPrompt, useKnowledge);
    } else {
      // 流水形模式
      yield* generateWritingSequential(sections, params, userId, provider, enhancedPrompt, hasGlobalKnowledgeInPrompt, useKnowledge);
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
  const currentWritingType = params.writing_type || 'articles';
  // V2动态路由：使用 params.logicalModel 或从 writing_scope_config 解析
  let modelName: string;
  let effectiveProvider: ProviderType;
  if (params.logicalModel) {
    // V2 path: 使用 Task V2 已解析的物理模型
    modelName = params.logicalModel;
    effectiveProvider = provider ?? 'openrouter';
  } else {
    // V1 path: 从 writing_scope_config 解析业务模型
    const r = await resolveWritingModel(currentWritingType, 'default');
    modelName = r.modelName;
    effectiveProvider = r.provider;
  }

  // 5. 构建生成 prompt（无大纲时的单次生成）
  // 获取写作类型配置（并处理特殊 format 分支）
  const resolvedBase = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
  let typeRules = resolvedBase.rules;
  let typeOutputFormat = resolvedBase.outputFormat;

  let generatePrompt = enhancedPrompt;

  // 如果是 lyrics 类型且 format === 'suno'，使用 Suno 格式规则
  if (params.writing_type === 'lyrics' && params.format === 'suno') {
    const { lyricsConfig } = await import('./wtconfigs/lyrics');
    const sunoFormat = lyricsConfig.getSunoFormatRules!();
    generatePrompt = `${sunoFormat.rules}

---

${generatePrompt}`;
  } else if (params.writing_type === 'voice-scripts' && params.format === 'tts') {
    // voice-scripts + tts：强制使用 TTS 规则与输出格式（要求 <#x#> 停顿标签）
    const { voiceScriptsConfig } = await import('./wtconfigs/voice-scripts');
    const ttsFormat = voiceScriptsConfig.getTtsFormatRules?.();
    if (ttsFormat?.rules) typeRules = ttsFormat.rules;
    if (ttsFormat?.outputformat) typeOutputFormat = ttsFormat.outputformat;
    if (typeRules) {
      generatePrompt = `${typeRules}

---

${generatePrompt}`;
    }
  } else {
    // 整合写作类型配置的 rules
    if (typeRules) {
      generatePrompt = `${typeRules}

---

${generatePrompt}`;
    }
  }
  
  // 根据细分类型添加额外的规则说明
  if (params.outline_type) {
    const subtypeRules = getSubtypeRules(params.writing_type, params.outline_type);
    if (subtypeRules) {
      generatePrompt = `${generatePrompt}

---

【细分类型要求】：
${subtypeRules}`;
    }
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
    // 添加全局写作参数（动态提取）
    const currentWritingType = params.writing_type || 'articles';
    const writingGuidance = buildWritingGuidance(params, currentWritingType);
    
    if (writingGuidance.length > 0) {
      // 获取参数列表用于提示文本
      const paramList = getWritingParamsForTypeWithSubtype(currentWritingType as any, params.outline_type as any);
      const writeLang = normalizeWritingLanguage(params.language);
      const paramLabels = paramList.map(p => getParamLabel(p, currentWritingType as any, writeLang, params.outline_type as any)).join(writingListJoin(writeLang));
      
      generatePrompt = `${generatePrompt}

【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${writingGuidance.join('\n')}

⚠️ 关键要求：这些参数（${paramLabels}）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写参数名称和值
- ✅ 正确做法：根据这些参数来组织语言和内容，让内容自然体现这些参数的要求，但不要明确说出来`;
    }
  }
  
  // 根据 writing_type 和 format 自动判断是否启用 Markdown
  const enableMarkdown = shouldEnableMarkdown(params.writing_type, params.format);
  if (!enableMarkdown) {
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

  // 整合写作类型配置的 outputformat（如果不是 Suno 格式）
  if (params.writing_type !== 'lyrics' || params.format !== 'suno') {
    if (typeOutputFormat) {
      generatePrompt = `${generatePrompt}

---

${typeOutputFormat}`;
    }
  } else {
    // Suno 格式：添加 Suno 格式的输出要求
    const { lyricsConfig } = await import('./wtconfigs/lyrics');
    const sunoFormat = lyricsConfig.getSunoFormatRules!();
    generatePrompt = `${generatePrompt}

---

${sunoFormat.outputformat}`;
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
  const stream = await generateTextStream(modelName, generatePrompt, effectiveProvider, llmParams);

  // 6. 返回流式结果（转换为新的数据结构）
  // 如果是 Suno JSON 格式，需要收集完整文本后解析
  let collectedText = '';
  let isSunoJson = params.writing_type === 'lyrics' && params.format === 'suno';
  
  for await (const chunk of stream) {
    const chunkText = chunk.chunk || '';
    collectedText += chunkText;
    
    // 如果是 Suno JSON 且流已完成，尝试解析并格式化
    if (isSunoJson && chunk.status === 'completed') {
      const sunoJsonData = parseSunoLyricsJson(collectedText);
      if (sunoJsonData) {
        // 返回格式化后的 JSON
        const formattedJson = JSON.stringify(sunoJsonData, null, 2);
        // 计算需要补充的文本
        const remainingText = formattedJson.substring(collectedText.length);
        if (remainingText) {
          yield {
            chunk: remainingText,
            status: 'completed',
            collection: formattedJson,
          };
        } else {
          yield {
            chunk: '',
            status: 'completed',
            collection: formattedJson,
          };
        }
        return;
      } else {
        // 解析失败，使用原始文本
        console.warn('[Writing Service] Suno 歌词 JSON 解析失败，使用原始文本');
      }
    }
    
    yield {
      chunk: chunkText,
      status: chunk.status || 'streaming',
      collection: collectedText,
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
  // 构建 LLM 调用参数（temperature / maxTokens / topP）
  const llmParams: Record<string, any> = {};
  if (params.temperature != null) llmParams.temperature = params.temperature;
  if (params.maxTokens != null) llmParams.max_tokens = params.maxTokens;
  if (params.topP != null) llmParams.top_p = params.topP;

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
  const promptConfig = await getPromptFullConfig(
    'writing',
    params.writing_type || 'articles',
    params.outline_type ?? null,
    'zh'
  );
  const useKnowledge = promptConfig?.use_knowledge !== false; // 未配置时默认 true，保持现有行为

  if (useKnowledge && params.knowledgeBase && params.knowledgeBase.length > 0) {
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
    // 展开大纲为扁平列表，合并全局参数（全局参数作为默认值，节点参数优先）
    const globalParams = {
      motivation: params.motivation,
      stance: params.stance,
      tone: params.tone,
      length: params.length,
      key_elements: params.key_elements,
    };
    const sections = expandOutlinesToSections(params.outlines, 0, 0, globalParams);

    const isStoryboardChunkMode = params.writing_type === 'storyboard-scripts';
    const storyboardChunkSeconds: StoryboardChunkSeconds = (params.storyboard_chunk_seconds ?? 15) as StoryboardChunkSeconds;
    const storyboardChunkMaxChars = isStoryboardChunkMode ? (CHUNK_MAX_CHARS[storyboardChunkSeconds] ?? 1600) : 0;
    // 有大纲时分镜：若传了期望总时长（秒），则按总时长与段落数分配每段约多少 chunk，用于控制总时长
    const rawTotalSec = params.storyboard_total_duration_seconds;
    const targetTotalSec = (rawTotalSec != null && Number(rawTotalSec) >= storyboardChunkSeconds)
      ? Math.max(storyboardChunkSeconds, Math.floor(Number(rawTotalSec)))
      : 0;
    const expectedChunksTotal = targetTotalSec > 0 ? Math.max(1, Math.ceil(targetTotalSec / storyboardChunkSeconds)) : 0;
    const expectedChunksPerSection = (isStoryboardChunkMode && expectedChunksTotal > 0 && sections.length > 0)
      ? Math.max(1, Math.ceil(expectedChunksTotal / sections.length))
      : undefined;

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
    // 用于多轮 LLM 调用的 usage 累加（Provider 扣费 + 用户 MXM-TOKEN 扣费）
    const usageAccumulator = createUsageAccumulator();
    
    // 进度分配：30% 开始，80% 完成所有段落生成
    // 并行模式：30% 开始，35% 总结完成，35-80% 段落生成（每个段落占 (80-35)/段落数）
    // 流水形模式：30% 开始，30-80% 段落生成（每个段落占 (80-30)/段落数）
    const progressStart = 30;
    const progressEnd = 80;
    const progressPerSection = (progressEnd - progressStart) / sections.length;
    
    if (generationMode === 'parallel') {
      // 并行模式：生成公用总结 + 并行生成各段落
      // V2: 使用 params.logicalModel（V2 path 已解析，V1 path 已在外部解析）
      const modelName = params.logicalModel;
      if (!modelName) {
        throw new Error('[WritingService] 段落生成失败: params.logicalModel 未设置，请检查 writing_scope_config 配置');
      }
      
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
        const { text, metadata } = await generateTextWithMetadata(modelName, summaryPrompt, provider, llmParams);
        addUsage(usageAccumulator, metadata);
        sharedSummary = text;
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
          // 构建段落指导参数（动态提取）：全局参数作为基础，节点参数作为相对调整
          const currentWritingType = params.writing_type || 'articles';
          const globalGuidance = section.globalParams 
            ? buildWritingGuidance(section.globalParams, currentWritingType, params.outline_type as any)
            : [];
          const sectionGuidance = buildWritingGuidance(section, currentWritingType, params.outline_type as any);
          
          // 构建写作指导文本
          let guidanceText = '';
          if (globalGuidance.length > 0 || sectionGuidance.length > 0) {
            guidanceText = '【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：\n';
            
            if (globalGuidance.length > 0) {
              guidanceText += `【整体基础参数】（整篇文章的基础风格，必须始终遵循）：\n${globalGuidance.map(g => `  ${g}`).join('\n')}\n`;
            }
            
            if (sectionGuidance.length > 0) {
              if (globalGuidance.length > 0) {
                guidanceText += `【本段落调整参数】（在整体基础参数上的相对调整，用于本段落的特殊需求）：\n${sectionGuidance.map(g => `  ${g}`).join('\n')}\n`;
                guidanceText += `\n⚠️ 重要：本段落的最终风格 = 整体基础参数 + 本段落调整参数。必须在整体风格基础上进行自然过渡，避免突然的风格转换（例如：不能从"完全批判"突然转到"完全支持"）。`;
              } else {
                guidanceText += `${sectionGuidance.join('\n')}\n`;
              }
            }
            
            guidanceText += `\n⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来`;
          }

          // 检索知识库
          let sectionKnowledgeContext = '';
          let hasKnowledge = false;
          const hasSectionKnowledge = section.knowledgeBase && section.knowledgeBase.length > 0;
          const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
          const processStyle = params.process_style || 'silent';
          
          // 判断 enhancedPrompt 是否已经包含全局知识库内容
          const hasGlobalKnowledgeInPrompt = useKnowledge && !!(params.knowledgeBase && params.knowledgeBase.length > 0 && 
            !params.outlines?.some(outline => outline.knowledgeBase && outline.knowledgeBase.length > 0));
          
          // 只有当段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中时，才检索和显示知识库
          if (useKnowledge && knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
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

          // 获取写作类型配置（使用已声明的 currentWritingType）
          // 特殊格式分支：lyrics+suno / voice-scripts+tts
          let typeRules: string | undefined;
          let typeOutputFormat: string | undefined;
          
          if (currentWritingType === 'lyrics' && params.format === 'suno') {
            const { lyricsConfig } = await import('./wtconfigs/lyrics');
            const sunoFormat = lyricsConfig.getSunoFormatRules!();
            typeRules = sunoFormat.rules;
            typeOutputFormat = sunoFormat.outputformat;
          } else if (currentWritingType === 'voice-scripts' && params.format === 'tts') {
            const { voiceScriptsConfig } = await import('./wtconfigs/voice-scripts');
            const ttsFormat = voiceScriptsConfig.getTtsFormatRules?.();
            const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
            typeRules = ttsFormat?.rules || resolved.rules;
            typeOutputFormat = ttsFormat?.outputformat || resolved.outputFormat;
          } else if (currentWritingType === 'storyboard-scripts' && isStoryboardChunkMode) {
            const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
            typeRules = resolved.rules;
            typeOutputFormat = await resolveStoryboardOutputFormat(storyboardChunkSeconds, storyboardChunkMaxChars, expectedChunksPerSection);
          } else {
            const resolved = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
            typeRules = resolved.rules;
            typeOutputFormat = resolved.outputFormat;
          }

          // 根据细分类型添加额外的规则说明
          const subtypeRules = params.outline_type 
            ? getSubtypeRules(params.writing_type, params.outline_type)
            : null;

          // 角色画像与出场角色（cast）
          const characters = await getCharactersFromParams(params, userId);
          const charactersText =
            characters && characters.length > 0
              ? `【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：\n${formatCharactersForPrompt(characters)}`
              : '';
          const castCharacters =
            characters && characters.length > 0 ? resolveCastCharacters(characters, section.cast) : [];
          const castText =
            section.cast && section.cast.length > 0
              ? castCharacters.length > 0
                ? `【本段出场角色（cast）】（仅这些角色出场/发言；其他角色不得出现）：\n- ${castCharacters.map((c) => `${c.name}(${c.id})`).join('\n- ')}`
                : `【本段出场角色（cast）】（按 name/id 引用未匹配到角色画像，请检查）：\n- ${section.cast.join('\n- ')}`
              : `【本段 cast】未指定（允许纯镜头/旁白/氛围段落，不强制角色出场）`;

          const sectionPrompt = `请根据以下要求生成文章段落内容：

${typeRules ? `${typeRules}

---` : ''}
${subtypeRules ? `【细分类型要求】：
${subtypeRules}

---` : ''}
${charactersText ? `${charactersText}\n\n---\n\n${castText}\n\n---` : ''}
【段落标题】：${section.content}
${guidanceText}
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
4. 输出格式：${isStoryboardChunkMode ? '**仅输出一个合法的 JSON 对象**，包含 "chunks" 数组；每个 chunk 必须按字段填写 video_description、dialogue、camera_movement、sound_effects、transition（见上方【输出要求】）。不要输出 <section> 或 Markdown 或解释文字。' : '使用 <section> </section> 包裹整个段落内容'}
5. ${!isStoryboardChunkMode && shouldEnableMarkdown(params.writing_type, params.format) 
  ? `**Markdown 格式要求**（必须严格遵守）：
   - 段落标题必须使用 Markdown 标题语法：一级标题用 #，二级标题用 ##，三级标题用 ###
   - 根据大纲层级使用对应的标题级别（主章节用 #，子章节用 ##，子子章节用 ###）
   - 列表必须使用 Markdown 列表语法：无序列表用 - 或 *，有序列表用 1. 2. 3.
   - 可以使用引用（>）、代码块（\`\`\`）、表格（|）等 Markdown 语法
   - 段落之间使用空行分隔
   - 在 <section> 标签内的内容必须使用完整的 Markdown 格式` 
  : !isStoryboardChunkMode ? `**纯文本格式要求**：
   - 不使用任何 Markdown 语法
   - 只使用空格和换行符进行格式化
   - 标题使用空行分隔，不使用 # 等符号
   - 列表使用数字或符号，但不要使用 Markdown 列表语法` : ''}
6. 如果该段落没有配置（无 motivation、stance、tone、length、key_elements），则只生成标题，无实际内容

请开始生成${isStoryboardChunkMode ? '分镜 JSON（仅输出 JSON，不要输出任何参数说明）' : '段落正文（不要输出任何参数说明）'}：`;

          const { text: sectionText, metadata: sectionMeta } = await generateTextWithMetadata(modelName, sectionPrompt, provider, llmParams);
          addUsage(usageAccumulator, sectionMeta);
          const sectionMatch = !isStoryboardChunkMode ? sectionText.match(/<section[^>]*>([\s\S]*?)<\/section>/) : null;
          let content = isStoryboardChunkMode ? sectionText.trim() : (sectionMatch ? sectionMatch[1].trim() : sectionText.trim());

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
      // V2: 使用 params.logicalModel（V2 path 已解析，V1 path 已在外部解析）
      const modelName = params.logicalModel;
      if (!modelName) {
        throw new Error('[WritingService] 段落生成失败: params.logicalModel 未设置，请检查 writing_scope_config 配置');
      }
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
            previousMemory = await compressText(previousMemory, 500, provider, usageAccumulator);
          }

          // 构建段落指导参数（动态提取）：全局参数作为基础，节点参数作为相对调整
          const currentWritingType = params.writing_type || 'articles';
          const globalGuidance = section.globalParams 
            ? buildWritingGuidance(section.globalParams, currentWritingType, params.outline_type as any)
            : [];
          const sectionGuidance = buildWritingGuidance(section, currentWritingType, params.outline_type as any);
          
          // 构建写作指导文本
          let guidanceText = '';
          if (globalGuidance.length > 0 || sectionGuidance.length > 0) {
            guidanceText = '【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：\n';
            
            if (globalGuidance.length > 0) {
              guidanceText += `【整体基础参数】（整篇文章的基础风格，必须始终遵循）：\n${globalGuidance.map(g => `  ${g}`).join('\n')}\n`;
            }
            
            if (sectionGuidance.length > 0) {
              if (globalGuidance.length > 0) {
                guidanceText += `【本段落调整参数】（在整体基础参数上的相对调整，用于本段落的特殊需求）：\n${sectionGuidance.map(g => `  ${g}`).join('\n')}\n`;
                guidanceText += `\n⚠️ 重要：本段落的最终风格 = 整体基础参数 + 本段落调整参数。必须在整体风格基础上进行自然过渡，避免突然的风格转换（例如：不能从"完全批判"突然转到"完全支持"）。`;
              } else {
                guidanceText += `${sectionGuidance.join('\n')}\n`;
              }
            }
            
            guidanceText += `\n⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写"动机：xxx"、"语调：xxx"这样的文字
- ✅ 正确做法：根据这些参数来组织语言和内容，让读者感受到相应的动机、立场和语调，但不要明确说出来`;
          }

          // 检索知识库
          let sectionKnowledgeContext = '';
          let hasKnowledge = false;
          const hasSectionKnowledge = section.knowledgeBase && section.knowledgeBase.length > 0;
          const knowledgeBaseConfig = section.knowledgeBase || params.knowledgeBase;
          const processStyle = params.process_style || 'silent';
          
          // 判断 enhancedPrompt 是否已经包含全局知识库内容
          const hasGlobalKnowledgeInPrompt = useKnowledge && !!(params.knowledgeBase && params.knowledgeBase.length > 0 && 
            !params.outlines?.some(outline => outline.knowledgeBase && outline.knowledgeBase.length > 0));
          
          // 只有当段落有段落级配置，或者全局知识库没有整合到 enhancedPrompt 中时，才检索和显示知识库
          if (useKnowledge && knowledgeBaseConfig && knowledgeBaseConfig.length > 0) {
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

          // 获取写作类型配置（使用已声明的 currentWritingType）
          const resolvedSection = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
          const typeRules = resolvedSection.rules;
          const typeOutputFormat = (currentWritingType === 'storyboard-scripts' && isStoryboardChunkMode)
            ? await resolveStoryboardOutputFormat(storyboardChunkSeconds, storyboardChunkMaxChars)
            : resolvedSection.outputFormat;

          // 根据细分类型和节奏添加额外的规则说明
          const subtypeRules = params.outline_type 
            ? getSubtypeRules(params.writing_type, params.outline_type)
            : null;
          const rhythmRules =
            currentWritingType === 'storyboard-scripts' && isStoryboardChunkMode
              ? getStoryboardRhythmRules(params.rhythm, storyboardChunkSeconds)
              : null;

          // 角色画像与出场角色（cast）
          const characters = await getCharactersFromParams(params, userId);
          const charactersText =
            characters && characters.length > 0
              ? `【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：\n${formatCharactersForPrompt(characters)}`
              : '';
          const castCharacters =
            characters && characters.length > 0 ? resolveCastCharacters(characters, section.cast) : [];
          const castText =
            section.cast && section.cast.length > 0
              ? castCharacters.length > 0
                ? `【本段出场角色（cast）】（仅这些角色出场/发言；其他角色不得出现）：\n- ${castCharacters.map((c) => `${c.name}(${c.id})`).join('\n- ')}`
                : `【本段出场角色（cast）】（按 name/id 引用未匹配到角色画像，请检查）：\n- ${section.cast.join('\n- ')}`
              : `【本段 cast】未指定（允许纯镜头/旁白/氛围段落，不强制角色出场）`;

          const sectionPrompt = `请根据以下要求生成${isStoryboardChunkMode ? '本段分镜 JSON' : '文章段落内容'}：

${typeRules ? `${typeRules}

---` : ''}
${subtypeRules ? `【细分类型要求】：
${subtypeRules}

---` : ''}
${rhythmRules ? `【节奏要求】：
${rhythmRules}

---` : ''}
${charactersText ? `${charactersText}\n\n---\n\n${castText}\n\n---` : ''}
【段落标题】：${section.content}
${sectionGuidance.length > 0 ? `【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${sectionGuidance.join('\n')}

⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！
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
4. 输出格式：${isStoryboardChunkMode ? '**仅输出一个合法的 JSON 对象**，包含 "chunks" 数组；每个 chunk 必须按字段填写 video_description、dialogue、camera_movement、sound_effects、transition（见上方【输出要求】）。不要输出 <section> 或 Markdown 或解释文字。' : '使用 <section> </section> 包裹整个段落内容'}
5. ${!isStoryboardChunkMode && shouldEnableMarkdown(params.writing_type, params.format) 
  ? `**Markdown 格式要求**（必须严格遵守）：
   - 段落标题必须使用 Markdown 标题语法：一级标题用 #，二级标题用 ##，三级标题用 ###
   - 根据大纲层级使用对应的标题级别（主章节用 #，子章节用 ##，子子章节用 ###）
   - 列表必须使用 Markdown 列表语法：无序列表用 - 或 *，有序列表用 1. 2. 3.
   - 可以使用引用（>）、代码块（\`\`\`）、表格（|）等 Markdown 语法
   - 段落之间使用空行分隔
   - 在 <section> 标签内的内容必须使用完整的 Markdown 格式` 
  : !isStoryboardChunkMode ? `**纯文本格式要求**：
   - 不使用任何 Markdown 语法
   - 只使用空格和换行符进行格式化
   - 标题使用空行分隔，不使用 # 等符号
   - 列表使用数字或符号，但不要使用 Markdown 列表语法` : ''}
6. 如果该段落没有配置（无 motivation、stance、tone、length、key_elements），则只生成标题，无实际内容
7. 与前文保持逻辑连贯，自然过渡

请开始生成${isStoryboardChunkMode ? '分镜 JSON（仅输出 JSON，不要输出任何参数说明）' : '段落正文（不要输出任何参数说明）'}：`;

          const { text: sectionText, metadata: sectionMeta } = await generateTextWithMetadata(modelName, sectionPrompt, provider, llmParams);
          addUsage(usageAccumulator, sectionMeta);
          const sectionMatch = !isStoryboardChunkMode ? sectionText.match(/<section[^>]*>([\s\S]*?)<\/section>/) : null;
          let content = isStoryboardChunkMode ? sectionText.trim() : (sectionMatch ? sectionMatch[1].trim() : sectionText.trim());

          // 解释模式：如果没有知识库内容，在结果前添加说明前缀（分镜模式不添加）
          if (!isStoryboardChunkMode && processStyle === 'explain' && !hasKnowledge) {
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

    // 分镜脚本 JSON chunk 模式（有大纲时：每段可能为 JSON chunks，合并后返回）
    if (isStoryboardChunkMode) {
      const allChunks: StoryboardChunk[] = [];
      for (const sc of sectionContents) {
        try {
          const parsed = parseStoryboardChunksJson(sc.content, storyboardChunkSeconds, params.rhythm);
          if (parsed.chunks?.length) {
            allChunks.push(...parsed.chunks);
          }
        } catch {
          // 某段不是 JSON，忽略或当作单段描述生成一个 chunk
          if (sc.content?.trim()) {
            allChunks.push({
              index: allChunks.length + 1,
              chunk_seconds: storyboardChunkSeconds,
              video_description: sc.content.trim(),
              prompt: '',
            });
          }
        }
      }
      if (allChunks.length > 0) {
        // 若用户指定了期望总时长，则严格截断到预期 chunk 总数，避免返回远超期望时长的结果
        const finalChunks =
          expectedChunksTotal > 0 && allChunks.length > expectedChunksTotal
            ? allChunks.slice(0, expectedChunksTotal)
            : allChunks;
        finalChunks.forEach((c, i) => { c.index = i + 1; });
        fillChunkPrompts(finalChunks);
        const totalDurationSeconds = finalChunks.length * storyboardChunkSeconds;
        const payload = {
          chunks: finalChunks,
          metadata: {
            ...params.metadata,
            total_duration_seconds: totalDurationSeconds,
            chunk_seconds: storyboardChunkSeconds,
          },
        };
        const formattedContent = JSON.stringify(payload, null, 2);
        const format: StorageFormat = 'json';
        const wordCount = formattedContent.length;
        const fileSize = Buffer.byteLength(formattedContent, 'utf-8');
        let storageInfo: WritingResult['storageInfo'] = undefined;
        if (params.storeToMinio !== false) {
          if (onProgress) await onProgress(90, '正在保存到 MinIO...');
          const storageRepo = RepositoryFactory.createStorageRepository();
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          const key = `${userId || 'anonymous'}/writing/${timestamp}-${randomStr}.json`;
          const bucket = getGeneratedBucket();
          await storageRepo.uploadFile(bucket, key, Buffer.from(formattedContent, 'utf-8'), {
            contentType: `${getMimeType(format)}; charset=utf-8`,
            metadata: { 'user-id': userId || 'anonymous', format, 'word-count': wordCount.toString() },
          });
          const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 60 * 60);
          storageInfo = { key, bucket, url };
          if (onProgress) await onProgress(95, '文件已保存到 MinIO');
        }
        const llmMeta = toLlmMetadata(usageAccumulator);
        return {
          text: formattedContent,
          formattedContent,
          format,
          storageInfo,
          metadata: { wordCount, fileSize, ...params.metadata },
          ...(llmMeta ? { _llmMetadata: llmMeta } : {}),
        };
      }
    }

    const generatedText = sectionContents.map(sc => sc.content).join('\n\n');

    if (onProgress) {
      await onProgress(85, '正在格式化文档...');
    }

    // 写作落盘统一 Markdown（PDF 由预览/下载时从 MD 转换；不再按 csv/txt 等分支）
    const format: StorageFormat = 'markdown';
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
      const bucket = getGeneratedBucket();

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

    const llmMeta = toLlmMetadata(usageAccumulator);
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
      ...(llmMeta ? { _llmMetadata: llmMeta } : {}),
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

  // 4.2. 分镜脚本 JSON chunk 模式（无大纲时单次生成整片 chunks）
  if (
    (!params.outlines || params.outlines.length === 0) &&
    params.writing_type === 'storyboard-scripts'
  ) {
    const chunkSeconds: StoryboardChunkSeconds = (params.storyboard_chunk_seconds ?? 15) as StoryboardChunkSeconds;
    const maxChars = CHUNK_MAX_CHARS[chunkSeconds] ?? 1600;
    const rawTotalSec = params.storyboard_total_duration_seconds;
    const targetTotalSeconds = rawTotalSec != null && Number(rawTotalSec) >= chunkSeconds
      ? Math.max(chunkSeconds, Math.floor(Number(rawTotalSec)))
      : Math.max(chunkSeconds * 2, 30);
    const expectedChunkCount = Math.max(1, Math.ceil(targetTotalSeconds / chunkSeconds));
    // V2: 使用 params.logicalModel（V2 path 已解析，V1 path 已在外部解析）
    const modelName = params.logicalModel;
    if (!modelName) {
      throw new Error('[WritingService] 分镜脚本生成失败: params.logicalModel 未设置，请检查 writing_scope_config 配置');
    }
    const outputFormatJson = await resolveStoryboardOutputFormat(chunkSeconds, maxChars, expectedChunkCount);
    // 分镜脚本：直接以 DB 中的细分类型规则为准（writing/storyboard-scripts/{outline_type}），
    // 无细分类型时才使用 type 级（subtype = null）配置作为回退
    const { rules: resolvedRules } = await getWritingRulesAndFormatResolved(
      'storyboard-scripts',
      params.outline_type ?? null,
      'zh'
    );
    const rhythmRules = getStoryboardRhythmRules(params.rhythm, chunkSeconds);
    let storyboardPrompt = `${resolvedRules || ''}

---

【输出要求】
${outputFormatJson}`;
    if (rhythmRules) {
      storyboardPrompt += `

【节奏要求】：
${rhythmRules}`;
    }
    storyboardPrompt += `

---

用户需求：
${enhancedPrompt}`;

    if (onProgress) {
      await onProgress(50, '正在生成分镜 JSON...');
    }
    const noOutlineUsageAccumulator = createUsageAccumulator();
    const { text: rawText, metadata: storyboardMeta } = await generateTextWithMetadata(modelName, storyboardPrompt, provider, llmParams);
    addUsage(noOutlineUsageAccumulator, storyboardMeta);
    const parsed = parseStoryboardChunksJson(rawText, chunkSeconds, params.rhythm);
    if (!parsed.chunks?.length) {
      throw new Error('分镜脚本生成失败：无法解析 JSON 或 chunks 为空。请检查 LLM 返回内容。');
    }
    let chunks: StoryboardChunk[] = parsed.chunks;
    // 仅当用户明确传入期望总时长时，截断到预期 chunk 数，避免返回远超期望时长的结果
    if (params.storyboard_total_duration_seconds != null && Number(params.storyboard_total_duration_seconds) > 0 && chunks.length > expectedChunkCount) {
      chunks = chunks.slice(0, expectedChunkCount);
      chunks.forEach((c, idx) => { c.index = idx + 1; });
    }
    fillChunkPrompts(chunks);
    const totalDurationSeconds = chunks.length * chunkSeconds;
    const payload = {
      chunks,
      metadata: {
        ...params.metadata,
        total_duration_seconds: totalDurationSeconds,
        chunk_seconds: chunkSeconds,
      },
    };
    const formattedContent = JSON.stringify(payload, null, 2);
    const format: StorageFormat = 'json';
    const wordCount = formattedContent.length;
    const fileSize = Buffer.byteLength(formattedContent, 'utf-8');

    let storageInfo: WritingResult['storageInfo'] | undefined;
    if (params.storeToMinio !== false) {
      if (onProgress) {
        await onProgress(90, '正在保存到 MinIO...');
      }
      const storageRepo = RepositoryFactory.createStorageRepository();
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const key = `${userId || 'anonymous'}/writing/${timestamp}-${randomStr}.json`;
      const bucket = getGeneratedBucket();
      await storageRepo.uploadFile(
        bucket,
        key,
        Buffer.from(formattedContent, 'utf-8'),
        {
          contentType: `${getMimeType(format)}; charset=utf-8`,
          metadata: {
            'user-id': userId || 'anonymous',
            format,
            'word-count': wordCount.toString(),
          },
        }
      );
      const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 60 * 60);
      storageInfo = { key, bucket, url };
      if (onProgress) {
        await onProgress(95, '文件已保存到 MinIO');
      }
    }

    const storyboardLlmMeta = toLlmMetadata(noOutlineUsageAccumulator);
    return {
      text: formattedContent,
      formattedContent,
      format,
      storageInfo,
      metadata: {
        wordCount,
        fileSize,
        ...params.metadata,
      },
      ...(storyboardLlmMeta ? { _llmMetadata: storyboardLlmMeta } : {}),
    };
  }

  const taskType: TaskType = 'full';
  const currentWritingType = params.writing_type || 'articles';
  // V2动态路由：使用 params.logicalModel 或从 writing_scope_config 解析
  let modelName: string;
  let effectiveProvider: ProviderType;
  if (params.logicalModel) {
    // V2 path: 使用 Task V2 已解析的物理模型
    modelName = params.logicalModel;
    effectiveProvider = provider ?? 'openrouter';
  } else {
    // V1 path: 从 writing_scope_config 解析业务模型
    const r = await resolveWritingModel(currentWritingType, 'default');
    modelName = r.modelName;
    effectiveProvider = r.provider;
  }

  // 5. 构建生成 prompt
  let generatePrompt: string;
  if (
    params.useConfiguredPrompt === true &&
    (!params.outlines || params.outlines.length === 0)
  ) {
    generatePrompt = buildConfiguredWritingGeneratePrompt(params, previousContent);
  } else {
  const resolvedFinal = await getWritingRulesAndFormatResolved(currentWritingType, params.outline_type ?? null, 'zh');
  let typeRules = resolvedFinal.rules;
  let typeOutputFormat = resolvedFinal.outputFormat;

  generatePrompt = enhancedPrompt;

  // 如果是 lyrics 类型且 format === 'suno'，使用 Suno 格式规则
  if (params.writing_type === 'lyrics' && params.format === 'suno') {
    const { lyricsConfig } = await import('./wtconfigs/lyrics');
    const sunoFormat = lyricsConfig.getSunoFormatRules!();
    generatePrompt = `${sunoFormat.rules}

---

${generatePrompt}`;
  } else if (params.writing_type === 'voice-scripts' && params.format === 'tts') {
    // voice-scripts + tts：强制使用 TTS 规则与输出格式（要求 <#x#> 停顿标签）
    const { voiceScriptsConfig } = await import('./wtconfigs/voice-scripts');
    const ttsFormat = voiceScriptsConfig.getTtsFormatRules?.();
    if (ttsFormat?.rules) typeRules = ttsFormat.rules;
    if (ttsFormat?.outputformat) typeOutputFormat = ttsFormat.outputformat;
    if (typeRules) {
      generatePrompt = `${typeRules}

---

${generatePrompt}`;
    }
  } else {
    // 整合写作类型配置的 rules
    if (typeRules) {
      generatePrompt = `${typeRules}

---

${generatePrompt}`;
    }
  }
  
  // 根据细分类型添加额外的规则说明
  if (params.outline_type) {
    const subtypeRules = getSubtypeRules(params.writing_type, params.outline_type);
    if (subtypeRules) {
      generatePrompt = `${generatePrompt}

---

【细分类型要求】：
${subtypeRules}`;
    }
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
    // 添加全局写作参数（动态提取）
    const writingGuidance = buildWritingGuidance(params, currentWritingType);
    
    if (writingGuidance.length > 0) {
      // 获取参数列表用于提示文本
      const paramList = getWritingParamsForTypeWithSubtype(currentWritingType as any, params.outline_type as any);
      const writeLang = normalizeWritingLanguage(params.language);
      const paramLabels = paramList.map(p => getParamLabel(p, currentWritingType as any, writeLang, params.outline_type as any)).join(writingListJoin(writeLang));
      
      generatePrompt = `${generatePrompt}

【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${writingGuidance.join('\n')}

⚠️ 关键要求：这些参数（${paramLabels}）是用来指导你如何写作的，不是要输出的内容！
- ❌ 错误示例：不要在正文中写参数名称和值
- ✅ 正确做法：根据这些参数来组织语言和内容，让内容自然体现这些参数的要求，但不要明确说出来`;
    }
  }
  
  // 根据 writing_type 和 format 自动判断是否启用 Markdown
  const enableMarkdown = shouldEnableMarkdown(params.writing_type, params.format);
  if (!enableMarkdown) {
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

  // 整合写作类型配置的 outputformat（如果不是 Suno 格式）
  if (params.writing_type !== 'lyrics' || params.format !== 'suno') {
    if (typeOutputFormat) {
      generatePrompt = `${generatePrompt}

---

${typeOutputFormat}`;
    }
  } else {
    // Suno 格式：添加 Suno 格式的输出要求
    const { lyricsConfig } = await import('./wtconfigs/lyrics');
    const sunoFormat = lyricsConfig.getSunoFormatRules!();
    generatePrompt = `${generatePrompt}

---

${sunoFormat.outputformat}`;
  }

  // 如果有之前的内容，加入上下文
  if (previousContent) {
    generatePrompt = `请基于以下原文进行写作：

原文：
${previousContent}

---
${generatePrompt}`;
  }
  }

  // 5. 调用 LLM 生成
  const fullModeUsageAccumulator = createUsageAccumulator();
  const { text: generatedTextRaw, metadata: fullModeMeta } = await generateTextWithMetadata(
    modelName,
    generatePrompt,
    effectiveProvider,
    llmParams,
    params as Record<string, any>,
  );
  addUsage(fullModeUsageAccumulator, fullModeMeta);
  let generatedText = generatedTextRaw;
  
  // 如果是 Suno 格式的歌词，解析 JSON
  let sunoJsonData: { title?: string; prompt: string; tags?: string; negative_tags?: string } | null = null;
  if (params.writing_type === 'lyrics' && params.format === 'suno') {
    sunoJsonData = parseSunoLyricsJson(generatedText);
    if (sunoJsonData) {
      // 使用解析后的 JSON 字符串作为生成文本
      generatedText = JSON.stringify(sunoJsonData, null, 2);
    } else {
      // 如果解析失败，记录警告但继续使用原始文本
      console.warn('[Writing Service] Suno 歌词 JSON 解析失败，使用原始文本');
    }
  }
  
  // 兜底：如果是 TTS 口播且模型没输出任何 <#x#>，自动插入基础停顿，保证可直接用于 TTS
  if (params.writing_type === 'voice-scripts' && params.format === 'tts') {
    generatedText = stripLeadingTitleForTts(generatedText);
    generatedText = injectBasicTtsPauses(generatedText, params);
  }

  // 6. 格式化文档：写作统一 Markdown；仅 Suno 歌词 JSON 例外
  const format: StorageFormat = (params.writing_type === 'lyrics' && params.format === 'suno')
    ? 'json'
    : 'markdown';
  const formattedContent = await formatDocument(
    generatedText,
    format,
    params.metadata?.title || sunoJsonData?.title,
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
    const bucket = getGeneratedBucket();
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
        ...sanitizeMinioMetadata(params.metadata),
      },
    });

    const url = await storageRepo.getPresignedUrl(bucket, key, 7 * 24 * 3600); // 7天有效期

    storageInfo = {
      key,
      bucket,
      url,
    };
  }

  const fullLlmMeta = toLlmMetadata(fullModeUsageAccumulator);
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
    ...(fullLlmMeta ? { _llmMetadata: fullLlmMeta } : {}),
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
  // 检查是否为 Suno JSON 格式（从 metadata 中获取 writing_type 和 format）
  const writingType = params.metadata?.writing_type;
  const formatParam = params.metadata?.format;
  const isSunoJson = writingType === 'lyrics' && formatParam === 'suno';
  
  // 如果是 Suno JSON 格式，使用 json 格式存储；否则使用 storage_form 或默认 markdown
  const format: StorageFormat = isSunoJson ? 'json' : 'markdown';
  
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
    const bucket = getGeneratedBucket();
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

