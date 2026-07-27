
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
  | 'voice-scripts'
  | 'business';

/** 大纲要用于生成的内容类型，与 WritingType 支持大纲的子集对齐 */
export type OutlineApplyTo = Extract<
  WritingType,
  'articles' | 'voice-scripts' | 'storyboard-scripts'
>;

/** 大纲 applyto 允许的值，用于校验 */
export const OUTLINE_APPLY_TO_VALUES: OutlineApplyTo[] = [
  'articles',
  'voice-scripts',
  'storyboard-scripts',
];

/**
 * 大纲细分类型
 */
export type OutlineType =
  // 文章细分类型
  | 'tech-article'        // 科技文章
  | 'story-novel'         // 故事小说
  | 'academic-paper'      // 学术论文
  // 口播稿细分类型
  | 'sales-voice'         // 带货口播
  | 'emotional-story-voice'  // 情感故事口播
  | 'knowledge-sharing-voice' // 知识分享口播
  // 分镜脚本细分类型
  | 'short-video-storyboard'  // 短视频分镜
  | 'movie-storyboard'        // 电影分镜
  | 'animation-storyboard'   // 动画分镜
  | 'music-video-storyboard'  // 音乐视频分镜
  | 'commercial-storyboard'   // 广告分镜
  | 'documentary-storyboard'   // 纪录片分镜
  | 'motion-graphics-storyboard' // 概念动效分镜
  | 'educational-storyboard'   // 教育片分镜
  | 'game-cg-storyboard';   // 游戏CG分镜

/** 分镜脚本 chunk 时长（秒），对应常见视频生成模型单段时长 */
export type StoryboardChunkSeconds = 4 | 5 | 8 | 10 | 15 | 20 | 25;

/**
 * 镜头时间线：chunk 内单个镜头的起止时间，格式 "MM:SS-MM:SS"（如 "00:00-00:06"）
 * 用于多镜头 chunk 标出每个镜头的时间线
 */
export type ShotTimelineSegment = string;

/**
 * 分镜脚本单个镜头（用于多镜头 chunk 的 shots 数组内）
 * 当 chunk 内只有一个镜头时使用扁平结构（字段直接写在 chunk 上）；多个镜头时使用 shots 数组。
 */
export interface StoryboardShot {
  shot_index: number;
  chunk_seconds: number;
  video_description: string;
  camera_movement?: string;
  dialogue?: string;
  sound_effects?: string;
  transition?: string;
  characters_in_shot?: string[];
  relate_outline_uid?: string;
  shot_timeline?: ShotTimelineSegment[];
  /** 本镜头拼接好的、可直接用于视频生成模型的一段 prompt 字符串 */
  prompt: string;
}

/**
 * 分镜脚本单个 chunk（对应一段固定时长，如 15 秒）。
 * - 单镜头：直接包含 video_description、dialogue、camera_movement 等（扁平结构）。
 * - 多镜头：使用 shots 数组，每个元素为 StoryboardShot；此时 chunk 级可不填 video_description 等。
 */
export interface StoryboardChunk {
  index: number;
  /** 本 chunk 总时长（秒）；多镜头时可为各 shot 时长之和或与配置一致 */
  chunk_seconds: number;
  /** 单镜头时必填；多镜头时可选（内容以 shots 为准） */
  video_description?: string;
  camera_movement?: string;
  dialogue?: string;
  sound_effects?: string;
  transition?: string;
  characters_in_shot?: string[];
  reference_image_url?: string;
  start_frame_image_url?: string;
  end_frame_image_url?: string;
  relate_outline_uid?: string;
  /**
   * 多镜头时每个镜头的时间线（仅单镜头扁平结构使用），与 video_description 内镜头顺序一一对应
   * 格式 ["00:00-00:06", "00:06-00:10", "00:10-00:15"]，未提供时按镜头数均分 chunk_seconds
   */
  shot_timeline?: ShotTimelineSegment[];
  /**
   * 多镜头时使用：本 chunk 内包含的多个分镜，每个分镜有独立 video_description、dialogue、shot_timeline 等。
   * 有 shots 时以 shots 为准；无 shots 或为空时为本 chunk 单镜头（扁平结构）。
   */
  shots?: StoryboardShot[];
  /** 本 chunk 拼接好的、可直接用于视频生成模型的一段 prompt 字符串（单镜头时为整段；多镜头时可由各 shot.prompt 拼接） */
  prompt?: string;
}

/**
 * 大纲结构类型
 */
export type OutlineStructureType =
  | 'three-act'              // 三段式（默认，所有类型可用）
  | 'aida'                   // AIDA 结构
  | 'pas'                    // PAS 结构
  | 'bab'                    // BAB 结构
  | 'hero-journey'           // 英雄之旅
  | 'imrad'                  // IMRaD 结构
  | 'hook-value-cta'         // 钩子-干货-CTA
  | 'act-scene-storyboard';  // 幕式分镜

/**
 * 角色画像（用于口播/分镜/故事小说等需要人物设定的场景）
 * - 存放位置：任务 result.metadata.characters
 * - cast 允许引用 id 或 name（string）
 */
export interface CharacterProfile {
  /** 稳定且唯一的角色标识（建议短字符串） */
  id: string;
  /** 展示名称（建议唯一，便于模型理解） */
  name: string;
  nickname?: string;
  age?: string;
  appearance?: string;
  voice_description?: string;
  clothing_style?: string;
  personality?: string;
  others?: string;
  category?: string[];
  tags?: string[];
  /** 角色关系（relations）
   * 格式：{ [characterId]: { [otherCharacterId]: relation } }
   * 例如：{ "char1": { "char2": "情侣" }, "char2": { "char1": "情侣" } }
   */
  relations?: {
    [characterId: string]: {
      [otherCharacterId: string]: string;  // 关系描述，如 "情侣"、"父子"、"朋友"等
    };
  };
  /** 角色形象参考图 URL（用于视频生成等，来自角色库 appearance/clothing_style reference_images 首张） */
  reference_image_url?: string;
}

/**
 * 大纲节点结构
 */
export interface Outline {
  uid: string;
  content: string;
  motivation?: string;
  stance?: string;
  tone?: string;
  /** 口播稿：语速（可选）。用于影响每个节点的篇幅/时长分配 */
  speech_rate?: string;
  /** 分镜脚本：节奏（可选）。用于影响每个节点的时长/镜头密度分配 */
  rhythm?: string;
  /**
   * 出场角色（可选）
   * - 用于分镜脚本/多人口播/故事小说等场景
   * - 允许为空或不填：表示该段落是镜头/旁白/氛围，不绑定任何角色（正常）
   * - 元素为 string：可填 CharacterProfile.id 或 CharacterProfile.name
   */
  cast?: string[];
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
 /** 文字总量，将平均分布到每个节点，可选（仅用于 articles 类型） */
 total_textcount?: number;
 /** 总时长（秒），可选（仅用于 voice-scripts 和 storyboard-scripts 类型）；统一用秒，大纲可不填，使用大纲写作时可在写作配置补充 */
 total_duration_seconds?: number;
 /** 大纲要用于生成什么内容，可选（与 WritingType 支持大纲的子集对齐） */
 applyto?: OutlineApplyTo;
 /** 细分类型，根据 applyto 选择：
  * - articles: 'tech-article' | 'story-novel' | 'academic-paper'
  * - voice-scripts: 'sales-voice' | 'emotional-story-voice' | 'knowledge-sharing-voice'
  * - storyboard-scripts: 短视频/电影/动画/音乐视频/广告/纪录片/概念动效/教育片/游戏CG 等
  */
 outline_type?: OutlineType;
 /** 大纲结构类型，可选：
  * - 'three-act': 三段式（默认，所有类型可用）
  * - 'aida': AIDA 结构
  * - 'pas': PAS 结构
  * - 'bab': BAB 结构
  * - 'hero-journey': 英雄之旅
  * - 'imrad': IMRaD 结构
  * - 'hook-value-cta': 钩子-干货-CTA
  * - 'act-scene-storyboard': 幕式分镜
  */
 outline_structure_type?: OutlineStructureType;
 /** 整体立场，可选（用于控制大纲的整体立场） */
 stance?: string;
 /** 整体语调，可选（用于控制大纲的整体语调） */
 tone?: string;
 /** 口播稿：语速，可选（用于在总时长下控制内容密度/字数） */
 speech_rate?: string;
 /** 口播稿：节奏，可选（用于控制停顿符长度、频率和文字总量） */
 voice_script_rhythm?: string;
 /** 分镜脚本：节奏，可选（用于在总时长下控制镜头/段落节奏分配） */
 rhythm?: string;
 /** 流式输出：'stream' | 'json'，默认 'json' */
 outputFormat?: 'stream' | 'json';
  knowledgeBase?: {
    knowledgeBaseId: string;
    query: string;
    limit?: number;
  }[];
  /** 知识库处理模式，默认 'silent' */
  process_style?: 'silent' | 'strict' | 'explain';
  /** 参演角色人数（可选，仅用于非学术论文类型） */
  cast_character_count?: number;
  /** 输出语言：zh | zh-TW | en | ja，默认 zh；影响大纲/写作生成内容的语言 */
  language?: import('@mxmai/mxmdata').AppLocale | 'zh' | 'en';
  /**
   * 由 Task v2 / Admin 配置写入：用于大纲的模型路由（logicalModel）。
   * 建议形如 `outline-<taskKey>`。
   * 未提供时使用历史逻辑（writing-outlines）。
   */
  logicalModel?: string;
  /** 由 Task v2 写入：为 true 时 generateOutline 仅用 params.prompt 调 LLM，不拼接硬编码 prompt（不暴露到 formSchema） */
  useConfiguredPrompt?: boolean;
}

//POST /api/v1/writing/generate
export interface WritingGenerateParams {
  prompt: string;
  /** 写作类型，用于区分不同类型的写作任务，默认 'articles' */
  writing_type?: WritingType;
  /** 细分类型，根据 writing_type 选择（仅对 articles、voice-scripts、storyboard-scripts 有效） */
  outline_type?: OutlineType;
  outlines?: Outline[];
  previous_content?: string;
  previous_task?: string;
  /** 分镜脚本：每个 chunk 的时长（秒），仅 writing_type='storyboard-scripts' 时生效，默认 15 */
  storyboard_chunk_seconds?: StoryboardChunkSeconds;
  /** 分镜脚本：期望总时长（秒），仅 writing_type='storyboard-scripts' 且无大纲时生效；需 ≥ 一个 chunk 时长，影响生成的 chunk 数量，默认按 chunk_seconds 的 2 倍 */
  storyboard_total_duration_seconds?: number;
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
  /** LLM 调用参数（temperature / maxTokens / topP），通常从 extra.generateParams 传入 */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  metadata?: Record<string, any>;
  /** 输出语言：zh | zh-TW | en | ja，默认 zh；影响生成内容的语言 */
  language?: import('@mxmai/mxmdata').AppLocale | 'zh' | 'en';
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
  /** 全局写作参数（整体配置）
   * - 无大纲时：作为全文写作的参数
   * - 有大纲时：作为默认值，大纲节点的参数可以覆盖这些全局参数
   *   例如：整体文章是犀利的，但某个节点可以设置为温和的
   */
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];
  /**
   * articles: 科技文章（tech-article）可选参数
   */
  targetAudience?: string;
  depth?: string;
  /**
   * articles: 故事小说（story-novel）可选参数
   */
  genre?: string;
  pov?: string;
  writing_style?: string;
  pacing?: string;
  setting?: string;
  main_characters?: string;
  conflict?: string;
  ending_type?: string;
  themes?: string;
  /**
   * articles: 学术论文（academic-paper）可选参数
   */
  discipline?: string;
  paper_type?: string;
  paper_structure?: string;
  research_question?: string;
  methodology?: string;
  data_sources?: string;
  citation_style?: string;
  keywords?: string;
  contribution?: string;
  /** 歌词格式（仅对 lyrics 类型有效）
   * - 'default': 默认格式，输出 Markdown 格式的歌词
   * - 'suno': Suno AI 格式，输出纯文本歌词（不带 Markdown 符号），遵循 Suno AI 的提示词规则
   * - 'tts': TTS 口播格式（仅对 voice-scripts 类型有效），输出纯文本，并使用 <#x#> 标签控制精确停顿
   */
  format?: 'default' | 'suno' | 'tts';
  /** 口播稿：节奏，可选（用于控制停顿符长度、频率和文字总量）
   * - 'slow': 慢节奏（停顿长、频率低、文字少）
   * - 'normal': 正常节奏（平衡）
   * - 'fast': 快节奏（停顿短、频率高、文字多）
   */
  voice_script_rhythm?: string;
  /**
   * 由 Task v2 / Admin 配置写入：用于写作的模型路由（物理模型 key）。
   * 未提供时使用历史逻辑（selectModelWithRouting 兜底）。
   */
  logicalModel?: string;
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