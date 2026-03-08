/**
 * 文档格式化器
 * 将生成的文本转换为不同格式（Markdown、TXT、PDF）
 */

// PDF 功能需要安装 pdfkit: npm install pdfkit @types/pdfkit
// import PDFDocument from 'pdfkit';

export type StorageFormat = 'markdown' | 'txt' | 'pdf' | 'md' | 'json';

/**
 * 格式化文档为 Markdown
 */
export function formatToMarkdown(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): string {
  let markdown = '';

  // 添加标题
  if (title) {
    markdown += `# ${title}\n\n`;
  }

  // 不添加技术性元数据（writing_type、enable_markdown、prompt 等）
  // 只保留用户相关的元数据（如 author、tags 等），但暂时不显示任何元数据
  // 如果需要显示元数据，可以在这里过滤掉技术性字段：
  // const userMetadata = metadata ? Object.fromEntries(
  //   Object.entries(metadata).filter(([key]) => 
  //     !['writing_type', 'enable_markdown', 'prompt', 'source', 'format', 'wordCount', 'fileSize'].includes(key)
  //   )
  // ) : undefined;

  // 添加正文
  markdown += text;

  return markdown;
}

/**
 * 格式化文档为 TXT
 */
export function formatToTxt(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): string {
  let txt = '';

  // 添加标题
  if (title) {
    txt += `${title}\n`;
    txt += '='.repeat(title.length) + '\n\n';
  }

  // 不添加技术性元数据（writing_type、enable_markdown、prompt 等）
  // 只保留用户相关的元数据，但暂时不显示任何元数据

  // 添加正文
  txt += text;

  return txt;
}

/**
 * 格式化文档为 JSON
 */
export function formatToJson(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): string {
  // 如果文本已经是 JSON 格式，直接返回
  try {
    JSON.parse(text);
    return text;
  } catch {
    // 如果不是有效的 JSON，尝试构建 JSON 对象
    const jsonObj: Record<string, any> = {};
    if (title) {
      jsonObj.title = title;
    }
    jsonObj.content = text;
    if (metadata) {
      Object.assign(jsonObj, metadata);
    }
    return JSON.stringify(jsonObj, null, 2);
  }
}

/**
 * 格式化文档为 PDF
 * 注意：需要安装 pdfkit: npm install pdfkit @types/pdfkit
 */
export async function formatToPdf(
  text: string,
  title?: string,
  metadata?: Record<string, any>
): Promise<Buffer> {
  // TODO: 实现 PDF 生成（需要安装 pdfkit）
  // 暂时返回 Markdown 格式的 Buffer
  const markdown = formatToMarkdown(text, title, metadata);
  return Buffer.from(markdown, 'utf-8');
  
  /* PDF 实现示例（需要安装 pdfkit）：
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50,
        },
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', (error: Error) => {
        reject(error);
      });

      if (title) {
        doc.fontSize(20).font('Helvetica-Bold').text(title, { align: 'center' });
        doc.moveDown(2);
      }

      if (metadata && Object.keys(metadata).length > 0) {
        doc.fontSize(10).font('Helvetica').text('---', { align: 'center' });
        doc.moveDown(0.5);
        for (const [key, value] of Object.entries(metadata)) {
          if (value !== undefined && value !== null) {
            doc.text(`${key}: ${value}`, { align: 'left' });
          }
        }
        doc.text('---', { align: 'center' });
        doc.moveDown(1);
      }

      doc.fontSize(12).font('Helvetica').text(text, {
        align: 'left',
        lineGap: 5,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
  */
}

/**
 * 根据格式类型格式化文档
 */
export async function formatDocument(
  text: string,
  format: StorageFormat,
  title?: string,
  metadata?: Record<string, any>
): Promise<string | Buffer> {
  switch (format) {
    case 'markdown':
    case 'md':
      return formatToMarkdown(text, title, metadata);
    case 'txt':
      return formatToTxt(text, title, metadata);
    case 'json':
      return formatToJson(text, title, metadata);
    case 'pdf':
      return await formatToPdf(text, title, metadata);
    default:
      // 默认使用 Markdown
      return formatToMarkdown(text, title, metadata);
  }
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(format: StorageFormat): string {
  switch (format) {
    case 'markdown':
    case 'md':
      return 'md';
    case 'txt':
      return 'txt';
    case 'json':
      return 'json';
    case 'pdf':
      return 'pdf';
    default:
      return 'md';
  }
}

/**
 * 获取 MIME 类型
 */
export function getMimeType(format: StorageFormat): string {
  switch (format) {
    case 'markdown':
    case 'md':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'json':
      return 'application/json';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'text/markdown';
  }
}

