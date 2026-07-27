/**
 * Graph业务接口类型定义
 * 定义photograph、design、painting三个大类型的接口
 */

import type { KnowledgeBaseConfig } from '../writing/knowledge-enhancer';
import type { ReferenceImage } from './reference-image';

// 类型映射（英文 -> 中文）
export const PHOTOGRAPH_TYPE_MAP = {
  portrait: '人像',
  landscape: '风景',
  cinematic: '电影画面',
  commercial: '产品商业拍摄',
  documentary: '纪事',
} as const;

export const DESIGN_TYPE_MAP = {
  '3d': '3D',
  manual: '使用手册',
  poster: '画报',
  icon: '图标',
  coverImage: '封面图片',
  'ui-design': 'UI 设计',
} as const;

export const PAINTING_TYPE_MAP = {
  illustration: '插图',
  comic: '漫画',
  conceptArt: '原画',
  cartoon: '卡通',
} as const;

// Photograph接口 - 兼容所有摄影小类型
// type值使用英文，可通过PHOTOGRAPH_TYPE_MAP获取中文翻译
export interface PhotographParams {
  type: 'portrait' | 'landscape' | 'cinematic' | 'commercial' | 'documentary';
  prompt: string;
  
  // Portrait (人像) related parameters (optional)
  style?: string;        // Style: modern, vintage, fashion, etc.
  tone?: string;         // Tone: warm, cool, high-contrast, etc.
  environment?: string;   // Environment: indoor, outdoor, studio, etc.
  makeup?: string;        // Makeup: natural, heavy, light, etc.
  pose?: string;         // Pose
  lighting?: string;      // Lighting: natural, soft, hard, etc.
  
  // Landscape (风景) related parameters (optional)
  timeOfDay?: string;     // Time: dawn, noon, dusk, night
  weather?: string;       // Weather: sunny, cloudy, rainy, etc.
  season?: string;        // Season
  composition?: string;   // Composition
  
  // Cinematic (电影画面) related parameters (optional)
  filmStyle?: string;     // Film style
  mood?: string;          // Mood/atmosphere
  cameraAngle?: string;   // Camera angle
  
  // Commercial (产品商业拍摄) related parameters (optional)
  productType?: string;   // Product type
  background?: string;     // Background
  props?: string;         // Props
  
  // Documentary (纪事) related parameters (optional)
  eventType?: string;     // Event type
  documentaryStyle?: string; // Documentary style
  
  // Common parameters
  knowledgeBase?: KnowledgeBaseConfig[];
  referenceImage?: string | string[] | ReferenceImage[]; // Reference image(s) - 支持旧格式和新格式
  quality?: 'high' | 'fast';
  aspect_ratio?: string;
  // 宫格：output_grid / grid9 等由表单与任务定义驱动；逐格文案由 DB prompt（text/format）负责，服务端不再根据 grid9Mode 生成 prompt
  grid9?: boolean;
  grid9Mode?: 'variation' | 'sequence' | 'combination';
  grid9Purpose?: 'options' | 'storyboard' | 'variants' | 'character';
  grid9Split?: boolean;
  [key: string]: any; // Support future extension
}

// Design接口 - 兼容所有设计小类型
// type值使用英文，可通过DESIGN_TYPE_MAP获取中文翻译
export interface DesignParams {
  type: '3d' | 'manual' | 'poster' | 'icon' | 'coverImage' | 'ui-design';
  prompt: string;
  
  // 3D related parameters (optional)
  modelStyle?: string;    // Model style
  material?: string;      // Material
  lighting?: string;      // Lighting
  perspective?: string;   // Perspective
  
  // Manual (使用手册) related parameters (optional)
  layout?: string;        // Layout
  colorScheme?: string;   // Color scheme
  typography?: string;    // Typography
  
  // Poster (画报) related parameters (optional)
  artStyle?: string;      // Art style
  theme?: string;         // Theme
  
  // Icon (图标) related parameters (optional)
  iconStyle?: string;     // Icon style
  size?: string;          // Size
  
  // CoverImage (封面图片) related parameters (optional)
  subjectImage?: string | string[] | ReferenceImage[]; // 主体图片（人物/角色等）
  backgroundImage?: string | string[] | ReferenceImage[]; // 背景图片
  title?: string;         // 封面主题文字（主标题）
  subtitle?: string;      // 副标题
  textStyle?: string;     // 文字风格（粗体、阴影、描边等）
  textColor?: string;     // 文字颜色
  textPosition?: string;  // 文字位置（左上、居中、右下等）
  layoutStyle?: string;   // 布局风格（左右分栏、上下分栏等）
  visualEffects?: string; // 视觉效果（模糊、渐变等）
  coverTheme?: string;    // 封面主题风格（新闻、娱乐、教育等）

  // UI Design (网页 / 移动端 / 游戏 UI) 相关参数（仅在 type === 'ui-design' 时使用）
  uiResolution?: string;      // 分辨率/画布类型（mobile-app, web, game, element）
  uiStyleKeywords?: string;   // 风格关键词（多选，逗号分隔，如 glassmorphism,neumorphism）
  uiColorTokens?: string;     // 色板/主辅色（格式：主色: #FF0000, 副色1: #00FF00, 副色2: #0000FF，可选）
  
  // Common parameters
  knowledgeBase?: KnowledgeBaseConfig[];
  referenceImage?: string | string[] | ReferenceImage[]; // Reference image(s) - 支持旧格式和新格式
  quality?: 'high' | 'fast';
  aspect_ratio?: string;
  // 宫格：output_grid / grid9 等由表单与任务定义驱动；逐格文案由 DB prompt（text/format）负责，服务端不再根据 grid9Mode 生成 prompt
  grid9?: boolean;
  grid9Mode?: 'variation' | 'sequence' | 'combination';
  grid9Purpose?: 'options' | 'storyboard' | 'variants' | 'character';
  grid9Split?: boolean;
  [key: string]: any; // Support future extension
}

// Painting接口 - 兼容所有绘画小类型
// type值使用英文，可通过PAINTING_TYPE_MAP获取中文翻译
export interface PaintingParams {
  type: 'illustration' | 'comic' | 'conceptArt' | 'cartoon';
  prompt: string;
  
  // Illustration (插图) related parameters (optional)
  illustrationStyle?: string; // Illustration style
  colorPalette?: string;      // Color palette
  
  // Comic (漫画) related parameters (optional)
  comicStyle?: string;        // Comic style
  panelLayout?: string;        // Panel layout
  
  // Concept Art (原画) related parameters (optional)
  conceptArtStyle?: string;   // Concept art style
  detailLevel?: string;       // Detail level
  
  // Cartoon (卡通) related parameters (optional)
  cartoonStyle?: string;      // Cartoon style
  characterDesign?: string;   // Character design
  
  // Common parameters
  knowledgeBase?: KnowledgeBaseConfig[];
  referenceImage?: string | string[] | ReferenceImage[]; // Reference image(s) - 支持旧格式和新格式
  quality?: 'high' | 'fast';
  aspect_ratio?: string;
  // 宫格：output_grid / grid9 等由表单与任务定义驱动；逐格文案由 DB prompt（text/format）负责，服务端不再根据 grid9Mode 生成 prompt
  grid9?: boolean;
  grid9Mode?: 'variation' | 'sequence' | 'combination';
  grid9Purpose?: 'options' | 'storyboard' | 'variants' | 'character';
  grid9Split?: boolean;
  [key: string]: any; // Support future extension
}

/** Graph 任务入参：由 DB 任务定义 + 表单 schema 驱动，不在此用 TS 枚举锁死业务线 */
export type GraphRuntimeParams = Record<string, unknown>;
