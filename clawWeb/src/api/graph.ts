import { request } from './client';

export interface GraphTaskResponse {
  taskId: string;
  status: string;
  createdAt: string;
}

export type GraphType = 'photograph' | 'design' | 'painting';

export interface ReferenceImage {
  content: string;
  type: string;
}

export interface FormOptionsResponse {
  graphType: string;
  type?: string;
  language: 'zh' | 'en';
  options: Record<string, Array<{ value: string; label: string }>>;
}

/**
 * 获取表单选项
 */
export async function getFormOptions(
  graphType: GraphType,
  type?: string,
  lang: 'zh' | 'en' = 'zh'
): Promise<{ data?: FormOptionsResponse; error?: string; status: number }> {
  const params: Record<string, any> = {
    [graphType]: '',
    lang,
  };
  if (type) {
    params.type = type;
  }
  return request<FormOptionsResponse>('/api/v1/cgi/graph/getformOptions', { params });
}

/**
 * 创建摄影任务
 */
export async function createPhotographTask(
  params: {
    type: 'portrait' | 'landscape' | 'cinematic' | 'commercial' | 'documentary';
    prompt: string;
    style?: string;
    tone?: string;
    environment?: string;
    makeup?: string;
    pose?: string;
    lighting?: string;
    timeOfDay?: string;
    weather?: string;
    season?: string;
    composition?: string;
    filmStyle?: string;
    mood?: string;
    cameraAngle?: string;
    productType?: string;
    background?: string;
    props?: string;
    eventType?: string;
    documentaryStyle?: string;
    referenceImage?: ReferenceImage[];
    quality?: 'high' | 'fast';
    aspect_ratio?: string;
    [key: string]: any;
  }
): Promise<{ data?: GraphTaskResponse; error?: string; status: number }> {
  return request<GraphTaskResponse>('/api/v1/cgi/graph/photograph', {
    method: 'POST',
    body: {
      ...params,
      storeToMinio: true,
    },
  });
}

/**
 * 创建设计任务
 */
export async function createDesignTask(
  params: {
    type: '3d' | 'manual' | 'poster' | 'icon' | 'coverImage' | 'ui-design';
    prompt: string;
    modelStyle?: string;
    material?: string;
    lighting?: string;
    perspective?: string;
    layout?: string;
    colorScheme?: string;
    typography?: string;
    artStyle?: string;
    theme?: string;
    iconStyle?: string;
    size?: string;
    subjectImage?: ReferenceImage[];
    backgroundImage?: ReferenceImage[];
    title?: string;
    subtitle?: string;
    textStyle?: string;
    textColor?: string;
    textPosition?: string;
    layoutStyle?: string;
    visualEffects?: string;
    coverTheme?: string;
    uiResolution?: string;
    uiStyleKeywords?: string;
    uiPrimaryColor?: string;
    uiSecondaryColor1?: string;
    uiSecondaryColor2?: string;
    referenceImage?: ReferenceImage[];
    quality?: 'high' | 'fast';
    aspect_ratio?: string;
    [key: string]: any;
  }
): Promise<{ data?: GraphTaskResponse; error?: string; status: number }> {
  return request<GraphTaskResponse>('/api/v1/cgi/graph/design', {
    method: 'POST',
    body: {
      ...params,
      storeToMinio: true,
    },
  });
}

/**
 * 创建绘画任务
 */
export async function createPaintingTask(
  params: {
    type: 'illustration' | 'comic' | 'conceptArt' | 'cartoon';
    prompt: string;
    illustrationStyle?: string;
    colorPalette?: string;
    comicStyle?: string;
    panelLayout?: string;
    conceptArtStyle?: string;
    detailLevel?: string;
    cartoonStyle?: string;
    characterDesign?: string;
    referenceImage?: ReferenceImage[];
    quality?: 'high' | 'fast';
    aspect_ratio?: string;
    [key: string]: any;
  }
): Promise<{ data?: GraphTaskResponse; error?: string; status: number }> {
  return request<GraphTaskResponse>('/api/v1/cgi/graph/painting', {
    method: 'POST',
    body: {
      ...params,
      storeToMinio: true,
    },
  });
}