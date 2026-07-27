/**
 * MiniMax MCP Tools 类型定义
 *
 * 这些工具通过 Claude Code 的 MCP 集成提供
 */

/**
 * 图像理解工具 - 使用 MiniMax Vision API 分析图片
 */
export async function mcp__MiniMax__understand_image(options: {
  prompt: string;
  image_source: string; // base64 或文件路径
}): Promise<string> {
  // 这个函数在运行时由 Claude Code MCP 注入
  // 这里只是类型定义
  throw new Error('mcp__MiniMax__understand_image must be called within Claude Code');
}

/**
 * Web 搜索工具 - 使用 MiniMax Search API
 */
export async function mcp__MiniMax__web_search(options: {
  query: string;
}): Promise<{
  organic: Array<{
    title: string;
    link: string;
    snippet: string;
    date?: string;
  }>;
  related_searches?: Array<{ query: string }>;
  base_resp: {
    status_code: number;
    status_msg: string;
  };
}> {
  throw new Error('mcp__MiniMax__web_search must be called within Claude Code');
}
