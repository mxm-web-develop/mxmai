/**
 * 文件解析服务
 * 支持解析 PDF、TXT、MD 等格式的文件，提取文本内容
 */

export interface ParsedDocument {
  title: string;
  content: string;
  chunks: Array<{
    text: string;
    page?: number;
    index: number;
  }>;
  metadata: {
    fileName: string;
    fileType: string;
    fileSize: number;
    pageCount?: number;
    extractedAt: string;
  };
}

export interface ParseOptions {
  chunkSize?: number; // 每个 chunk 的最大字符数（默认 2000）
  chunkOverlap?: number; // chunk 之间的重叠字符数（默认 200）
  maxChunkSize?: number; // 单个 chunk 的最大字符数（默认 5000）
}

export class FileParser {
  private defaultChunkSize: number;
  private defaultChunkOverlap: number;
  private defaultMaxChunkSize: number;

  constructor(options?: ParseOptions) {
    this.defaultChunkSize = options?.chunkSize || 2000;
    this.defaultChunkOverlap = options?.chunkOverlap || 200;
    this.defaultMaxChunkSize = options?.maxChunkSize || 5000;
  }

  /**
   * 解析文件（根据文件类型自动选择解析器）
   */
  async parseFile(
    buffer: Buffer,
    fileName: string,
    options?: ParseOptions
  ): Promise<ParsedDocument> {
    const fileType = this.getFileType(fileName);
    const content = await this.extractText(buffer, fileType);

    const chunkSize = options?.chunkSize || this.defaultChunkSize;
    const chunkOverlap = options?.chunkOverlap || this.defaultChunkOverlap;
    const maxChunkSize = options?.maxChunkSize || this.defaultMaxChunkSize;

    const chunks = this.splitIntoChunks(content, chunkSize, chunkOverlap, maxChunkSize);

    // 从文件名提取标题（去掉扩展名）
    const title = fileName.replace(/\.[^/.]+$/, '');

    return {
      title,
      content,
      chunks,
      metadata: {
        fileName,
        fileType,
        fileSize: buffer.length,
        extractedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 获取文件类型
   */
  private getFileType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    return ext;
  }

  /**
   * 提取文本内容（根据文件类型）
   */
  private async extractText(buffer: Buffer, fileType: string): Promise<string> {
    switch (fileType) {
      case 'txt':
      case 'text':
        return this.parseText(buffer);
      case 'md':
      case 'markdown':
        return this.parseMarkdown(buffer);
      case 'pdf':
        return await this.parsePDF(buffer);
      default:
        // 默认按文本处理
        return this.parseText(buffer);
    }
  }

  /**
   * 解析纯文本文件
   */
  private parseText(buffer: Buffer): string {
    return buffer.toString('utf-8');
  }

  /**
   * 解析 Markdown 文件
   */
  private parseMarkdown(buffer: Buffer): string {
    // Markdown 可以直接作为文本处理
    return buffer.toString('utf-8');
  }

  /**
   * 解析 PDF 文件
   * 注意：这里使用简单的文本提取，生产环境建议使用 pdf-parse 等库
   */
  private async parsePDF(buffer: Buffer): Promise<string> {
    // TODO: 集成 pdf-parse 库进行 PDF 解析
    // 目前返回提示信息
    throw new Error(
      'PDF 解析功能需要安装 pdf-parse 库。请运行: npm install pdf-parse'
    );
  }

  /**
   * 将文本分割成 chunks
   */
  private splitIntoChunks(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    maxChunkSize: number
  ): Array<{ text: string; page?: number; index: number }> {
    const chunks: Array<{ text: string; page?: number; index: number }> = [];
    const paragraphs = text.split(/\n\s*\n/); // 按段落分割

    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // 如果当前段落加上现有 chunk 超过最大大小，先保存当前 chunk
      if (currentChunk && currentChunk.length + paragraph.length > maxChunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
        });
        currentChunk = '';
      }

      // 如果单个段落就超过最大大小，需要进一步分割
      if (paragraph.length > maxChunkSize) {
        // 先保存当前 chunk（如果有）
        if (currentChunk) {
          chunks.push({
            text: currentChunk.trim(),
            index: chunkIndex++,
          });
          currentChunk = '';
        }

        // 分割大段落
        const subChunks = this.splitLongText(paragraph, maxChunkSize);
        for (const subChunk of subChunks) {
          chunks.push({
            text: subChunk.trim(),
            index: chunkIndex++,
          });
        }
        continue;
      }

      // 添加段落到当前 chunk
      if (currentChunk) {
        currentChunk += '\n\n' + paragraph;
      } else {
        currentChunk = paragraph;
      }

      // 如果当前 chunk 达到目标大小，保存并创建新 chunk（带重叠）
      if (currentChunk.length >= chunkSize) {
        chunks.push({
          text: currentChunk.trim(),
          index: chunkIndex++,
        });

        // 创建重叠的 chunk（从当前 chunk 的末尾开始）
        if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
          currentChunk = currentChunk.slice(-chunkOverlap);
        } else {
          currentChunk = '';
        }
      }
    }

    // 保存最后一个 chunk
    if (currentChunk.trim()) {
      chunks.push({
        text: currentChunk.trim(),
        index: chunkIndex++,
      });
    }

    return chunks;
  }

  /**
   * 分割超长文本
   */
  private splitLongText(text: string, maxSize: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      let end = start + maxSize;

      // 尝试在句子边界分割
      if (end < text.length) {
        const lastPeriod = text.lastIndexOf('.', end);
        const lastNewline = text.lastIndexOf('\n', end);

        if (lastPeriod > start && lastPeriod > lastNewline) {
          end = lastPeriod + 1;
        } else if (lastNewline > start) {
          end = lastNewline + 1;
        }
      }

      chunks.push(text.slice(start, end));
      start = end;
    }

    return chunks;
  }
}

