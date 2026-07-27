export type DocumentPdfRenderer = 'markdown' | 'styled' | 'html';

export interface DocumentRenderAsset {
  id: string;
  url?: string;
  role?: 'profile' | 'cover' | 'background' | 'logo' | 'other';
}

export interface DocumentRenderBlock {
  type:
    | 'cover'
    | 'toc'
    | 'section'
    | 'markdown'
    | 'image'
    | 'highlights'
    | 'twoColumn'
    | 'spacer';
  title?: string;
  subtitle?: string;
  style?: string;
  contentBinding?: string;
  assetId?: string;
  depth?: number;
  height?: number;
  left?: DocumentRenderBlock[];
  right?: DocumentRenderBlock[];
  items?: string[];
  [key: string]: unknown;
}

export interface DocumentRenderSpecV1 {
  version: '1';
  page: {
    size: 'A4' | 'Letter';
    margin?: [number, number, number, number];
    backgroundImage?: string;
  };
  theme: {
    paletteId: string;
    designStyle: string;
    fonts?: { title?: string; body?: string; caption?: string };
    colors?: {
      primary?: string;
      secondary?: string;
      text?: string;
      muted?: string;
      background?: string;
    };
  };
  assets?: DocumentRenderAsset[];
  blocks: DocumentRenderBlock[];
  layoutHtml?: string;
}

export interface DocumentRenderContext {
  markdown: string;
  structured?: unknown;
  renderer: DocumentPdfRenderer;
  designStyle: string;
  assets: DocumentRenderAsset[];
}

export interface DocumentRenderMeta {
  renderer: DocumentPdfRenderer;
  designStyle: string;
  backend: 'pdfkit-markdown' | 'pdfkit-spec' | 'html-print';
  usedFallback?: boolean;
  layoutTaskKey?: string;
}
