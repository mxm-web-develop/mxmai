/**
 * Agent Chat 类型定义
 */

// ==================== 业务节点定义 ====================

export type BusinessNodeType = 'graph' | 'video' | 'audio' | 'writing';

export type GraphSubType = 'photograph' | 'design' | 'painting';
export type GraphPhotographSubType = 'portrait' | 'landscape' | 'cinematic' | 'commercial' | 'documentary';
export type GraphDesignSubType = '3d' | 'manual' | 'poster' | 'icon' | 'coverImage' | 'ui-design';
export type GraphPaintingSubType = 'illustration' | 'comic' | 'conceptArt' | 'cartoon';
export type VideoSubType = 'generate';
export type AudioSubType = 'tts' | 'music';
export type WritingSubType = 'outline' | 'generate' | 'rewriting' | 'polishing' | 'lyrics' | 'storyboard-scripts';

// ==================== 意图识别结果 ====================

export interface IntentMatch {
  /** 置信度：高/中/低 */
  confidence: 'high' | 'medium' | 'low';
  /** 业务节点类型 */
  nodeType: BusinessNodeType;
  /** 子类型 */
  subType?: string;
  /** 具体模板 */
  template?: string;
  /** 识别理由 */
  reason: string;
  /** 建议的确认话术 */
  confirmMessage: string;
}

// ==================== 参数收集状态 ====================

export interface ParameterSchema {
  /** 字段名（内部） */
  name: string;
  /** 用户可见的字段标签 */
  label: string;
  /** 字段类型 */
  type: 'select' | 'number' | 'text' | 'slider' | 'toggle' | 'imageRef';
  /** 是否必填 */
  required: boolean;
  /** 选项（select 类型） */
  options?: { value: string; label: string }[];
  /** 默认值 */
  defaultValue?: string | number | boolean;
  /** 范围（slider 类型） */
  range?: { min: number; max: number };
  /** 占位提示 */
  placeholder?: string;
}

export interface TaskParameter {
  nodeType: BusinessNodeType;
  subType?: string;
  template?: string;
  params: Record<string, unknown>;
  schema: ParameterSchema[];
}

// ==================== 会话状态 ====================

export type ConversationPhase =
  | 'idle'               // 空闲，等待用户输入
  | 'intent_detecting'   // 正在识别意图
  | 'awaiting_confirm'   // 等待用户确认业务节点
  | 'collecting_params'  // 收集参数中
  | 'awaiting_execution' // 等待用户确认执行
  | 'executing'          // 执行中
  | 'completed';         // 完成

export interface ConversationContext {
  sessionId: string;
  userId: string;
  phase: ConversationPhase;
  /** 当前匹配的节点 */
  matchedNode?: IntentMatch;
  /** 已收集的参数 */
  collectedParams: Record<string, unknown>;
  /** 当前缺失的必填参数 */
  missingParams: ParameterSchema[];
  /** 历史消息 */
  messages: AgentMessage[];
  /** 关联的任务 ID */
  taskId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// ==================== 任务状态 ====================

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface TaskInfo {
  taskId: string;
  status: TaskStatus;
  progress?: number;       // 0-100
  progressText?: string;   // 进度描述文案
  result?: TaskResult;
  error?: string;
}

export interface TaskResult {
  type: 'image' | 'video' | 'audio' | 'writing';
  /** 单个或多个媒体 URL */
  urls: string[];
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

// ==================== Agent Chat API 请求/响应 ====================

export interface SendMessageRequest {
  sessionId?: string;
  userId: string;
  message: string;
  attachedImages?: string[];  // 用户附带的图片 URL
  attachedAudio?: string;     // 用户附带的音频 URL
}

export interface SendMessageResponse {
  sessionId: string;
  /** 流式响应的 event 类型 */
  event: 'text' | 'intent_detected' | 'confirm_form' | 'task_created' | 'task_progress' | 'task_completed' | 'error';
  /** 文本内容（text 事件） */
  content?: string;
  /** 意图识别结果（intent_detected 事件） */
  intent?: IntentMatch;
  /** 确认表单（confirm_form 事件） */
  confirmForm?: {
    title: string;
    summary: string;
    schema: ParameterSchema[];
  };
  /** 任务信息（task_* 事件） */
  task?: TaskInfo;
}

// ==================== 业务节点模板 ====================

export interface BusinessNodeTemplate {
  id: string;
  name: string;
  nodeType: BusinessNodeType;
  subType?: string;
  description: string;
  /** 适用场景关键词 */
  keywords: string[];
  /** 该节点需要的参数 schema */
  parameterSchema: ParameterSchema[];
  /** API 端点 */
  apiEndpoint: string;
  /** API 方法 */
  apiMethod: 'POST' | 'GET';
}

export const BUSINESS_NODE_TEMPLATES: BusinessNodeTemplate[] = [
  // ========== 图像 - 摄影 ==========
  {
    id: 'graph-photograph-portrait',
    name: '人像摄影',
    nodeType: 'graph',
    subType: 'photograph',
    description: '生成人像摄影图片，支持多种风格',
    keywords: ['人像', '写真', '模特', '棚拍', '人', '照', '写真', 'portrait', 'photo'],
    parameterSchema: [
      { name: 'count', label: '图片数量', type: 'select', required: true, options: [
        { value: '2', label: '2张' }, { value: '4', label: '4张' }, { value: '6', label: '6张' }, { value: '8', label: '8张' },
      ], defaultValue: '4' },
      { name: 'ratio', label: '图片比例', type: 'select', required: true, options: [
        { value: '3:4', label: '3:4（竖版）' }, { value: '4:3', label: '4:3（横版）' }, { value: '1:1', label: '1:1（方形）' }, { value: '16:9', label: '16:9（宽屏）' },
      ], defaultValue: '3:4' },
      { name: 'style', label: '风格', type: 'select', required: true, options: [
        { value: '韩系清新', label: '韩系清新' }, { value: '欧美高级', label: '欧美高级' }, { value: '日系元气', label: '日系元气' }, { value: '中式古风', label: '中式古风' }, { value: '时尚街拍', label: '时尚街拍' },
      ], defaultValue: '韩系清新' },
      { name: 'referenceImage', label: '参考图', type: 'imageRef', required: false },
    ],
    apiEndpoint: '/api/v1/cgi/graph/photograph',
    apiMethod: 'POST',
  },
  {
    id: 'graph-photograph-ecommerce',
    name: '电商摄影',
    nodeType: 'graph',
    subType: 'photograph',
    description: '淘宝/天猫/京东等电商平台商品主图',
    keywords: ['电商', '淘宝', '天猫', '京东', '商品', '主图', '电商摄影', 'ecommerce', 'product photo'],
    parameterSchema: [
      { name: 'count', label: '图片数量', type: 'select', required: true, options: [
        { value: '2', label: '2张' }, { value: '4', label: '4张' }, { value: '6', label: '6张' }, { value: '8', label: '8张' },
      ], defaultValue: '4' },
      { name: 'ratio', label: '图片比例', type: 'select', required: true, options: [
        { value: '3:4', label: '3:4（竖版）' }, { value: '1:1', label: '1:1（方形）' }, { value: '16:9', label: '16:9（宽屏）' },
      ], defaultValue: '3:4' },
      { name: 'style', label: '风格', type: 'select', required: true, options: [
        { value: '简约白底', label: '简约白底' }, { value: '生活场景', label: '生活场景' }, { value: '高级感', label: '高级感' }, { value: '促销感', label: '促销感' },
      ], defaultValue: '简约白底' },
      { name: 'category', label: '商品类目', type: 'text', required: false, placeholder: '如：女装、数码、美妆' },
    ],
    apiEndpoint: '/api/v1/cgi/graph/photograph',
    apiMethod: 'POST',
  },
  // ========== 图像 - 设计 ==========
  {
    id: 'graph-design-poster',
    name: '海报设计',
    nodeType: 'graph',
    subType: 'design',
    description: '营销海报、宣传图设计',
    keywords: ['海报', '宣传', '设计', 'banner', 'poster', '广告'],
    parameterSchema: [
      { name: 'ratio', label: '尺寸比例', type: 'select', required: true, options: [
        { value: '2:3', label: '2:3（海报）' }, { value: '3:4', label: '3:4' }, { value: '16:9', label: '16:9' }, { value: '1:1', label: '1:1' },
      ], defaultValue: '2:3' },
      { name: 'style', label: '风格', type: 'select', required: true, options: [
        { value: '简约现代', label: '简约现代' }, { value: '国潮', label: '国潮' }, { value: '科技感', label: '科技感' }, { value: '可爱风', label: '可爱风' }, { value: '电影感', label: '电影感' },
      ], defaultValue: '简约现代' },
      { name: 'text', label: '文案内容', type: 'text', required: false, placeholder: '海报主文案（可选）' },
    ],
    apiEndpoint: '/api/v1/cgi/graph/design',
    apiMethod: 'POST',
  },
  // ========== 写作 ==========
  {
    id: 'writing-script',
    name: '口播稿/脚本',
    nodeType: 'writing',
    subType: 'generate',
    description: '短视频口播稿或分镜脚本',
    keywords: ['口播', '脚本', '分镜', '短视频', '文案', '稿', 'speech', 'script', 'video script'],
    parameterSchema: [
      { name: 'duration', label: '时长', type: 'select', required: true, options: [
        { value: '15', label: '15秒' }, { value: '30', label: '30秒' }, { value: '60', label: '60秒' }, { value: '90', label: '90秒' }, { value: '120', label: '2分钟' },
      ], defaultValue: '30' },
      { name: 'tone', label: '语气风格', type: 'select', required: true, options: [
        { value: '专业严谨', label: '专业严谨' }, { value: '轻松活泼', label: '轻松活泼' }, { value: '温暖亲切', label: '温暖亲切' }, { value: '幽默风趣', label: '幽默风趣' }, { value: '激情有力', label: '激情有力' },
      ], defaultValue: '轻松活泼' },
      { name: 'platform', label: '目标平台', type: 'select', required: false, options: [
        { value: '小红书', label: '小红书' }, { value: '抖音', label: '抖音' }, { value: '快手', label: '快手' }, { value: 'B站', label: 'B站' }, { value: '微信视频号', label: '微信视频号' },
      ], defaultValue: '小红书' },
      { name: 'product', label: '产品/主题', type: 'text', required: false, placeholder: '要推广的产品或视频主题' },
    ],
    apiEndpoint: '/api/v1/writing/generate',
    apiMethod: 'POST',
  },
  {
    id: 'writing-lyrics',
    name: '歌词创作',
    nodeType: 'writing',
    subType: 'lyrics',
    description: '原创歌词或歌曲文案',
    keywords: ['歌词', '作词', '词', 'lyrics', 'song'],
    parameterSchema: [
      { name: 'theme', label: '主题', type: 'text', required: true, placeholder: '歌词主题，如：青春、爱情、梦想' },
      { name: 'style', label: '风格', type: 'select', required: true, options: [
        { value: '流行', label: '流行' }, { value: '民谣', label: '民谣' }, { value: '摇滚', label: '摇滚' }, { value: '说唱', label: '说唱' }, { value: '古风', label: '古风' },
      ], defaultValue: '流行' },
      { name: 'mood', label: '情绪', type: 'select', required: false, options: [
        { value: '欢快', label: '欢快' }, { value: '伤感', label: '伤感' }, { value: '热血', label: '热血' }, { value: '治愈', label: '治愈' }, { value: '思念', label: '思念' },
      ], defaultValue: '治愈' },
    ],
    apiEndpoint: '/api/v1/writing/generate',
    apiMethod: 'POST',
  },
  // ========== 视频 ==========
  {
    id: 'video-generate',
    name: '视频生成',
    nodeType: 'video',
    subType: 'generate',
    description: 'AI 生成短视频',
    keywords: ['视频', '短片', 'movie', 'video'],
    parameterSchema: [
      { name: 'duration', label: '时长', type: 'select', required: true, options: [
        { value: '5', label: '5秒' }, { value: '10', label: '10秒' }, { value: '15', label: '15秒' }, { value: '30', label: '30秒' },
      ], defaultValue: '10' },
      { name: 'style', label: '风格', type: 'select', required: true, options: [
        { value: '写实', label: '写实' }, { value: '动漫', label: '动漫' }, { value: '3D渲染', label: '3D渲染' }, { value: '电影感', label: '电影感' },
      ], defaultValue: '写实' },
      { name: 'prompt', label: '画面描述', type: 'text', required: true, placeholder: '描述视频画面内容' },
    ],
    apiEndpoint: '/api/v1/cgi/video/generate',
    apiMethod: 'POST',
  },
  // ========== 音频 ==========
  {
    id: 'audio-tts',
    name: '语音合成',
    nodeType: 'audio',
    subType: 'tts',
    description: '文字转语音配音',
    keywords: ['配音', 'TTS', '语音', '朗读', 'speech', 'voice', 'tts'],
    parameterSchema: [
      { name: 'text', label: '配音文案', type: 'text', required: true, placeholder: '要配音的文字内容' },
      { name: 'voice', label: '音色', type: 'select', required: true, options: [
        { value: '女声-温柔', label: '女声-温柔' }, { value: '女声-活泼', label: '女声-活泼' }, { value: '男声-磁性', label: '男声-磁性' }, { value: '男声-沉稳', label: '男声-沉稳' },
      ], defaultValue: '女声-温柔' },
      { name: 'speed', label: '语速', type: 'slider', required: false, range: { min: 0.5, max: 2.0 }, defaultValue: 1.0 },
    ],
    apiEndpoint: '/api/v1/cgi/audio/tts',
    apiMethod: 'POST',
  },
];
