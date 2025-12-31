/**
 * 图片输入统一处理工具
 * 用于统一处理不同 Provider 对图片输入格式的要求
 * 
 * Replicate nano-banana-pro: 支持 URL 和 Base64
 * DeerAPI (Gemini): 只支持 Base64，不支持 URL
 */

/**
 * 检测字符串是否为 URL
 */
export function isUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 检测字符串是否为 Base64 数据
 */
export function isBase64(str: string): boolean {
  // Base64 字符串通常只包含 A-Z, a-z, 0-9, +, /, = 字符
  // 或者以 data: 开头（data URI）
  if (str.startsWith('data:')) {
    return true;
  }
  
  // 纯 Base64 字符串（没有 data URI 前缀）
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(str) && str.length > 100; // 至少要有一定长度
}

/**
 * 从 URL 下载图片并转换为 Base64
 */
export async function urlToBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image from URL: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    // 从 Content-Type 获取 MIME 类型，或从 URL 推断
    const contentType = response.headers.get('content-type') || getMimeTypeFromUrl(imageUrl) || 'image/jpeg';
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    throw new Error(`Failed to convert URL to Base64: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 从 URL 推断 MIME 类型
 */
function getMimeTypeFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
      return 'image/jpeg';
    } else if (pathname.endsWith('.png')) {
      return 'image/png';
    } else if (pathname.endsWith('.gif')) {
      return 'image/gif';
    } else if (pathname.endsWith('.webp')) {
      return 'image/webp';
    } else if (pathname.endsWith('.svg')) {
      return 'image/svg+xml';
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * 统一处理图片输入：将 URL 或 Base64 转换为统一的 Base64 格式
 * 
 * @param input 图片输入（URL 或 Base64）
 * @returns Base64 格式的图片数据（data URI）
 */
export async function normalizeImageInput(input: string): Promise<string> {
  // 如果已经是 Base64 格式（data URI 或纯 Base64），直接返回
  if (isBase64(input)) {
    // 如果是纯 Base64（没有 data URI 前缀），添加默认前缀
    if (!input.startsWith('data:')) {
      return `data:image/jpeg;base64,${input}`;
    }
    return input;
  }
  
  // 如果是 URL，下载并转换为 Base64
  if (isUrl(input)) {
    return await urlToBase64(input);
  }
  
  // 如果无法识别，假设是 Base64 并添加前缀
  console.warn(`[image-input] 无法识别输入格式，假设为 Base64: ${input.substring(0, 50)}...`);
  return input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
}

/**
 * 批量处理图片输入数组
 */
export async function normalizeImageInputs(inputs: string[]): Promise<string[]> {
  return Promise.all(inputs.map(input => normalizeImageInput(input)));
}

/**
 * 根据 Provider 类型决定是否需要转换图片输入
 * 
 * @param provider Provider 类型
 * @param imageInput 图片输入（URL 或 Base64）
 * @returns 处理后的图片输入
 */
export async function processImageInputForProvider(
  provider: 'replicate' | 'deer' | 'ppio',
  imageInput: string | string[]
): Promise<string | string[]> {
  const inputs = Array.isArray(imageInput) ? imageInput : [imageInput];
  
  // Replicate 支持 URL，不需要转换
  if (provider === 'replicate') {
    return imageInput; // 直接返回原始输入（URL 或 Base64）
  }
  
  // DeerAPI 和 PPIO 需要 Base64，需要转换 URL
  const normalized = await normalizeImageInputs(inputs);
  return Array.isArray(imageInput) ? normalized : normalized[0];
}

