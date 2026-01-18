
/**
 * 写作类型枚举
 * 用于区分不同类型的写作任务，统一使用 type: 'writing'，通过 metadata.type 区分
 */
export type WritingType =
  | 'outlines'
  | 'suno-lyrics'
  | 'lyrics'
  | 'articles'
  | 'media-post'
  | 'storyboard-scripts'
  | 'reviews'
  | 'resumes'
  | 'voice-scripts';

/**
 * 大纲节点结构
 */
export interface Outline {
  uid: string;
  content: string;
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];
  children?: Outline[];
  /** 该段落关联的知识库配置（可选） */
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
  }[];
}

//POST /api/v1/writing/outline
export interface OutlineParams {
 uid: string;
 prompt: string;
 /** 写作类型，用于区分不同类型的写作任务，默认 'outlines' */
 writing_type?: WritingType;
 /** 期望生成的大纲层级深度，默认 3（1: 只一级标题，2: 主标题+子标题，3及以上: 支持更深嵌套） */
 maxDepth?: number;

 /** 期望生成的大纲节点总数（大致控制篇幅），可选 */
 expectedNodes?: number;
 /** 文字总量，将平均分布到每个节点，可选 */
 total_textcount?: number;
 /** 大纲要用于生成什么内容，可选（除 outlines 和 suno-lyrics 外的所有写作类型） */
 applyto?: Exclude<WritingType, 'outlines' | 'suno-lyrics'>;
 /** 流式输出：'stream' | 'json'，默认 'json' */
 outputFormat?: 'stream' | 'json';
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
  }[];
  /** 知识库处理模式，默认 'silent' */
  process_style?: 'silent' | 'strict' | 'explain';
}

//POST /api/v1/writing/generate
export interface WritingGenerateParams {
  prompt: string;
  /** 写作类型，用于区分不同类型的写作任务，默认 'articles' */
  writing_type?: WritingType;
  outlines?:Outline[],
  previous_content?: string;
  previous_task?: string;
  //默认.md
  storage_form?: string;
  //默认true
  storeToMinio?: boolean;
  /** 输出格式，可选参数
   * - 'stream': 流式输出模式，实时返回生成内容（SSE）
   * - 'json': 异步任务模式，返回 taskId，需要轮询查询结果（默认）
   * 注意：如果不传此参数，默认使用异步任务模式
   * 如果 storeToMinio === false，会自动使用流式模式
   */
  outputFormat?: 'stream' | 'json';
  /** @deprecated 已废弃：enable_markdown 参数不再使用，系统会根据 writing_type 自动判断
   * - outlines 类型：返回 JSON 格式
   * - 其他类型：默认使用 Markdown 格式
   */
  enable_markdown?: boolean;
  /** 生成模式，默认 'parallel'
   * - 'parallel': 并行模式，先生成公用总结，然后并行生成各段落
   * - 'sequential': 流水形模式，按顺序递归生成，每段基于前文记忆
   * - 'auto': 自动选择，大纲节点 < 5 个用 sequential，>= 5 个用 parallel
   */
  generation_mode?: 'parallel' | 'sequential' | 'auto';
  metadata?: Record<string, any>;
  /** 全局知识库配置（如果大纲节点没有配置，则使用全局配置） */
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
    relate_outline?: string;
  }[];
  /** 知识库处理模式，默认 'silent'
   * - 'silent': 静默模式，知识库无召回时静默处理，继续生成
   * - 'strict': 严格模式，知识库无召回时不调用大模型，返回错误"没有相关的知识内容"
   * - 'explain': 解释模式，知识库无召回时仍调用大模型，但输出必须以"我们没有相关的专业知识，但是根据我的了解"开头
   */
  process_style?: 'silent' | 'strict' | 'explain';
  /** 全局写作参数（用于无大纲的全文写作，如果提供了大纲则这些参数会被忽略） */
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];
  /** 歌词格式（仅对 lyrics 类型有效）
   * - 'default': 默认格式，输出 Markdown 格式的歌词
   * - 'suno': Suno AI 格式，输出纯文本歌词（不带 Markdown 符号），遵循 Suno AI 的提示词规则
   */
  format?: 'default' | 'suno';
}

//POST /api/v1/writing/rewriting
export interface RewritingParams {
    prompt: string;
    /** 写作类型，用于区分不同类型的写作任务，默认 'articles' */
    writing_type?: WritingType;
    previous_content?: string;
    previous_task?: string;
    // 流式输出：'stream' | 'json'，默认 'json'
    outputFormat?: 'stream' | 'json';
    knowledgeBase?: {
        knowledgeBaseId: string;
        query: string;
        limit?: number;
        relate_outline?: string;
    }[]
} 

//POST /api/v1/writing/polishing
export interface PolishingParams {
    prompt: string;
    /** 写作类型，用于区分不同类型的写作任务，默认 'articles' */
    writing_type?: WritingType;
    previous_content?: string;
    previous_task?: string;
    motivation?: string;
    stance?: string;
    tone?: string;
    length?: string;
    key_elements?: string[];
    // 流式输出：'stream' | 'json'，默认 'json'
    outputFormat?: 'stream' | 'json';
    knowledgeBase?: {
        knowledgeBaseId: string;
        query: string;
        limit?: number;
        relate_outline?: string;
    }[];
    /** 知识库处理模式，默认 'silent' */
    process_style?: 'silent' | 'strict' | 'explain';
}

//POST /api/v1/writing/sync-to-task
export interface SyncToTaskParams {
  /** 拼接后的完整文本内容（从 stream 接收并拼接） */
  text: string;
  /** 文件格式：'markdown' | 'txt' | 'pdf'，默认 'markdown' */
  storage_form?: string;
  /** 文档元数据（如 title、author、tags 等） */
  metadata?: Record<string, any>;
  /** 是否存储到 MinIO（默认 true） */
  storeToMinio?: boolean;
} 