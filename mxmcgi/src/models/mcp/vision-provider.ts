/**
 * MCP Vision Provider
 * 
 * 通过 mcporter 调用 MiniMax MCP 的 understand_image 工具实现图像分析
 * 
 * MiniMax Token Plan 的视觉能力通过独立 MCP 服务暴露，不在标准 Chat Completion API 里
 * 文档: https://platform.minimax.io/docs/guides/token-plan-mcp-guide
 */

import type { ModelProvider, ProviderType, GenerateParams, GenerateResult } from '../providers';
import { isModelEnabled } from '../provider-model-catalog';
import { VISION_MODEL_KEY, SUPPORTED_IMAGE_FORMATS, type McpCallResult } from './types';
import { understandImage } from './mcporter-client';

export class McpVisionProvider implements ModelProvider {
  readonly provider: ProviderType = 'mcp';
  readonly name = 'McpVision';

  constructor(
    private readonly injectApiKey?: string,
    private readonly injectMcpServer?: string
  ) {}

  supportsModel(modelName: string): boolean {
    // MCP Provider 直接支持 minimax-vision，不依赖 DB catalog
    // 因为视觉模型通过 MCP 工具调用，不走标准的 provider_models 表
    return modelName === 'minimax-vision';
  }

  /**
   * 图像分析生成
   * 
   * @param modelName 模型名称（应为 'minimax-vision'）
   * @param params 生成参数
   *   - prompt: 图像分析的问题
   *   - parameters.imageUrl: 图片URL或本地路径
   *   - parameters.image_base64: 可选的 base64 编码图片
   */
  async generate(modelName: string, params: GenerateParams): Promise<GenerateResult> {
    if (!this.supportsModel(modelName)) {
      throw new Error(`McpVisionProvider 不支持模型: ${modelName}`);
    }

    const start = Date.now();
    let success = true;
    let errorCode: string | undefined;

    try {
      // 提取参数
      const rawParams = (params.parameters ?? {}) as Record<string, unknown>;
      
      // 支持多种图片来源：imageUrl, image_url, image_base64, imageSource
      const imageUrl = (rawParams.imageUrl as string) 
        || (rawParams.image_url as string)
        || (rawParams.imageSource as string)
        || '';
      
      const imageBase64 = rawParams.image_base64 as string | undefined;
      
      // prompt 优先从 params.prompt 提取，否则从 parameters.prompt 提取
      const prompt = params.prompt 
        || (rawParams.prompt as string)
        || '描述这张图片的内容';

      if (!imageUrl && !imageBase64) {
        throw new Error('McpVisionProvider 需要提供图片 URL（imageUrl）或 base64 数据（image_base64）');
      }

      // 调用 MCP understand_image
      const result = await this.callUnderstandImage(prompt, imageUrl, imageBase64);

      // 解析结果
      const textContent = this.extractTextContent(result);
      const metadata = {
        provider: this.provider,
        model: modelName,
        upstreamModel: 'MiniMax.understand_image',
        toolResult: result,
        raw: result.raw,
      };

      return {
        mediaUrls: textContent ? [textContent] : [],
        metadata,
      };
    } catch (e) {
      success = false;
      errorCode = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      // 记录统计
      this.recordStats({
        provider: this.provider,
        logicalModel: modelName,
        success,
        latencyMs: Date.now() - start,
        errorCode,
      });
    }
  }

  /**
   * 调用 understand_image 工具
   */
  private async callUnderstandImage(
    prompt: string,
    imageUrl: string,
    imageBase64?: string
  ): Promise<McpCallResult> {
    // 如果有 base64 图片，需要转换为临时文件或 data URL
    let imageSource = imageUrl;

    if (imageBase64 && !imageUrl) {
      // 对于 base64 数据，转换为 data URL
      const mimeType = this.detectMimeType(imageBase64);
      imageSource = `data:${mimeType};base64,${imageBase64}`;
    }

    // 验证图片格式
    this.validateImageFormat(imageSource);

    return understandImage(prompt, imageSource);
  }

  /**
   * 从 MCP 结果中提取文本内容
   */
  private extractTextContent(result: McpCallResult): string {
    const content = result.content;
    
    if (!content) return '';

    // content 可能是数组
    if (Array.isArray(content)) {
      return content
        .filter((item) => item.type === 'text')
        .map((item) => (item as any).text || '')
        .join('\n');
    }

    // 也可能是单个对象
    if (typeof content === 'object' && content !== null) {
      const c = content as any;
      if (c.type === 'text') return c.text || '';
      if (typeof c === 'string') return c;
    }

    return String(content);
  }

  /**
   * 从 base64 数据检测 MIME 类型
   */
  private detectMimeType(base64Data: string): string {
    // 检查 PNG 特征
    if (base64Data.startsWith('iVBOR')) return 'image/png';
    // 检查 JPEG 特征
    if (base64Data.startsWith('/9j/')) return 'image/jpeg';
    // 检查 WebP 特征
    if (base64Data.startsWith('UklGR')) return 'image/webp';
    // 默认
    return 'image/png';
  }

  /**
   * 验证图片格式
   */
  private validateImageFormat(imageSource: string): void {
    // 检查是否是不支持的格式
    const lowerSource = imageSource.toLowerCase();
    
    // 检查 URL 中的扩展名
    const urlMatch = lowerSource.match(/\.([^?]+)(\?|$)/);
    if (urlMatch) {
      const ext = urlMatch[1].toLowerCase();
      // 去掉参数部分
      const extClean = ext.split('&')[0];
      if (!SUPPORTED_IMAGE_FORMATS.includes(extClean as any)) {
        console.warn(`[McpVisionProvider] 图片格式 ${extClean} 可能不被支持，建议使用 JPEG/PNG/WebP`);
      }
    }
  }

  /**
   * 记录统计信息
   */
  private recordStats(stats: {
    provider: string;
    logicalModel: string;
    success: boolean;
    latencyMs: number;
    errorCode?: string;
  }): void {
    // 动态导入避免循环依赖
    import('../providers').then(({ recordStats }) => {
      recordStats({
        provider: stats.provider as ProviderType,
        logicalModel: stats.logicalModel,
        model_key: stats.logicalModel,
        success: stats.success,
        latencyMs: stats.latencyMs,
        errorCode: stats.errorCode,
      });
    }).catch(() => {
      // 忽略统计错误
    });
  }

  /**
   * 获取使用统计（代理到通用接口）
   */
  async getUsageSummary(window: string) {
    const { getProviderStats } = await import('../providers');
    const list = await getProviderStats({ provider: this.provider as ProviderType, window });
    const agg = list.find((a) => a.provider === this.provider) || {
      provider: this.provider as ProviderType,
      requestCount: 0,
      successCount: 0,
      errorRate: 0,
      avgLatencyMs: 0,
      window,
    };
    return agg;
  }

  /**
   * 获取计费信息（Token Plan 不按量计费）
   */
  async getBillingInfo(): Promise<{ provider: ProviderType; supported: boolean; billingMode: 'subscription'; billingNote: string }> {
    return {
      provider: this.provider,
      supported: false,
      billingMode: 'subscription',
      billingNote: 'MCP 调用走 Token Plan 配额，不在 API 按量计费范围内',
    };
  }
}
