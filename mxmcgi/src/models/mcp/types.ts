/**
 * MCP 相关类型定义
 * MCP (Model Context Protocol) Client for MiniMax Vision
 */

export interface McpToolResult {
  content: TextContent | ImageContent | AudioContent[];
  isError?: boolean;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string; // base64
  mimeType: string;
}

export interface AudioContent {
  type: 'audio';
  data: string; // base64
  mimeType: string;
}

export interface McpCallResult {
  content: TextContent[] | ImageContent[] | AudioContent[];
  provider?: string;
  tool?: string;
  raw?: unknown;
}

export const MCP_SERVER_DEFAULT = 'MiniMax';
export const VISION_MODEL_KEY = 'minimax-vision';

export const SUPPORTED_IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp'] as const;
export type SupportedImageFormat = typeof SUPPORTED_IMAGE_FORMATS[number];
