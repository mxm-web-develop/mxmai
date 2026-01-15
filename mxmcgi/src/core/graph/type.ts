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
  [key: string]: any; // Support future extension
}

// Design接口 - 兼容所有设计小类型
// type值使用英文，可通过DESIGN_TYPE_MAP获取中文翻译
export interface DesignParams {
  type: '3d' | 'manual' | 'poster' | 'icon';
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
  
  // Common parameters
  knowledgeBase?: KnowledgeBaseConfig[];
  referenceImage?: string | string[] | ReferenceImage[]; // Reference image(s) - 支持旧格式和新格式
  quality?: 'high' | 'fast';
  aspect_ratio?: string;
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
  [key: string]: any; // Support future extension
}
