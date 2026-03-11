import { request } from './client';

export interface Outline {
  uid: string;
  content: string;
  motivation?: string;
  stance?: string;
  tone?: string;
  cast?: string[];
  length?: string;
  key_elements?: string[];
  children?: Outline[];
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
  }[];
}

export type OutlineType =
  | 'tech-article'
  | 'story-novel'
  | 'academic-paper'
  | 'sales-voice'
  | 'emotional-story-voice'
  | 'knowledge-sharing-voice'
  | 'short-video-storyboard'
  | 'movie-storyboard'
  | 'animation-storyboard'
  | 'music-video-storyboard'
  | 'commercial-storyboard'
  | 'documentary-storyboard'
  | 'motion-graphics-storyboard'
  | 'educational-storyboard'
  | 'game-cg-storyboard';

export type OutlineStructureType =
  | 'three-act'
  | 'aida'
  | 'pas'
  | 'bab'
  | 'hero-journey'
  | 'imrad'
  | 'hook-value-cta'
  | 'act-scene-storyboard';

export interface OutlineParams {
  uid: string;
  prompt: string;
  maxDepth?: number;
  expectedNodes?: number;
  total_textcount?: number;
  total_duration_seconds?: number;
  applyto?: OutlineApplyTo;
  outline_type?: OutlineType;
  outline_structure_type?: OutlineStructureType;
  stance?: string;
  tone?: string;
  speech_rate?: string;
  voice_script_rhythm?: string;
  rhythm?: string;
  outputFormat?: 'stream' | 'json';
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
  }[];
  cast_character_count?: number;
  cast_character_ids?: string[];
  language?: 'zh' | 'en';
}

export type WritingType = 'outlines' | 'lyrics' | 'articles' | 'media-post' | 'storyboard-scripts' | 'reviews' | 'resumes' | 'voice-scripts';

export type OutlineApplyTo = Extract<WritingType, 'articles' | 'voice-scripts' | 'storyboard-scripts'>;

export type StoryboardChunkSeconds = 4 | 5 | 8 | 10 | 15 | 20 | 25;

export interface WritingGenerateParams {
  prompt: string;
  writing_type?: WritingType;
  outline_type?: OutlineType;
  outlines?: Outline[];
  storyboard_chunk_seconds?: StoryboardChunkSeconds;
  previous_content?: string;
  previous_task?: string;
  storage_form?: string;
  storeToMinio?: boolean;
  outputFormat?: 'stream' | 'json';
  enable_markdown?: boolean;
  generation_mode?: 'parallel' | 'sequential' | 'auto';
  metadata?: Record<string, any>;
  language?: 'zh' | 'en';
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
    relate_outline?: string;
  }[];
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];
  targetAudience?: string;
  depth?: string;
  genre?: string;
  pov?: string;
  writing_style?: string;
  pacing?: string;
  setting?: string;
  main_characters?: string;
  conflict?: string;
  ending_type?: string;
  themes?: string;
  discipline?: string;
  paper_type?: string;
  paper_structure?: string;
  research_question?: string;
  methodology?: string;
  data_sources?: string;
  citation_style?: string;
  keywords?: string;
  contribution?: string;
  format?: 'default' | 'suno' | 'tts';
  voice_script_rhythm?: string;
}

export interface WritingTaskResponse {
  taskId: string;
  status: string;
  createdAt: string;
}

export interface FormOptionsConfig {
  [key: string]: any;
}

/**
 * 生成大纲
 */
export async function generateOutline(
  params: OutlineParams
): Promise<{ data?: { taskId: string; outline?: Outline }; error?: string; status: number }> {
  return request<{ taskId: string; outline?: Outline }>('/api/v1/writing/outline', {
    method: 'POST',
    body: params,
  });
}

/**
 * 生成写作内容
 */
export async function generateWriting(
  params: WritingGenerateParams
): Promise<{ data?: WritingTaskResponse; error?: string; status: number }> {
  return request<WritingTaskResponse>('/api/v1/writing/generate', {
    method: 'POST',
    body: {
      ...params,
      storeToMinio: params.storeToMinio !== false,
    },
  });
}

/**
 * 获取写作表单选项
 */
export async function getWritingFormOptions(
  writingType?: WritingType,
  language: 'zh' | 'en' = 'zh',
  outlineType?: OutlineType
): Promise<{ data?: FormOptionsConfig | null; error?: string; status: number }> {
  const params: Record<string, any> = {};
  if (writingType) {
    params.writing_type = writingType;
  }
  params.lang = language;
  params.language = language;
  if (outlineType) {
    params.outline_type = outlineType;
  }
  
  return request<FormOptionsConfig | null>('/api/v1/writing/getformOptions', { params });
}