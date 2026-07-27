/**
 * mcporter CLI 调用封装
 * 
 * 通过 mcporter daemon 调用 MCP 工具（STDIO 模式）
 * mcporter daemon 必须已经在运行，否则会失败
 * 
 * 使用方式：
 *   const result = await mcporterCall('MiniMax', 'understand_image', { prompt: '...', image_source: '...' });
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { TextContent, McpCallResult } from './types';

const execFile = promisify(require('child_process').execFile);

const DAEMON_SOCKET = '/Users/mxm_pro/.mcporter/daemon/daemon-09f1ebb3eae5.sock';

/**
 * 调用 MCP 工具
 * @param serverName MCP 服务器名称（如 'MiniMax'）
 * @param toolName 工具名称（如 'understand_image'）
 * @param args 工具参数
 * @returns 工具调用结果
 */
export async function mcporterCall(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpCallResult> {
  const toolCall = `${serverName}.${toolName}`;
  
  // 构建参数字符串
  const argsJson = JSON.stringify(args);
  
  // 使用 mcporter call 命令，指定 daemon socket
  // --output json 确保返回 JSON 格式便于解析
  // mcporter 通过 npx 调用
  // daemon socket 通过环境变量传递（v0.1.5+）
  const mcporterBin = 'npx';
  const commandArgs = [
    'mcporter',
    'call',
    toolCall,
    '--args', argsJson,
    '--output', 'json'
  ];

  console.log(`[mcporter-call] calling: ${toolCall}`);
  console.log(`[mcporter-call] args: ${argsJson}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(mcporterBin, commandArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000, // 60s 超时
      env: { ...process.env, MCPORTER_DAEMON_SOCKET: DAEMON_SOCKET },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      console.error(`[mcporter-call] spawn error: ${err.message}`);
      reject(new Error(`mcporter 调用失败: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[mcporter-call] exit code: ${code}, stderr: ${stderr}`);
        reject(new Error(`mcporter 调用失败，退出码: ${code}, stderr: ${stderr}`));
        return;
      }

      try {
        // 解析 JSON 输出（可能有多个 JSON 对象，取最后一个）
        const lines = stdout.trim().split('\n').filter(Boolean);
        const lastLine = lines[lines.length - 1];
        const parsed = JSON.parse(lastLine);
        
        // 统一返回格式
        const result: McpCallResult = {
          content: parsed.content || [{ type: 'text', text: stdout }], // fallback to raw stdout
          provider: serverName,
          tool: toolName,
          raw: parsed,
        };
        
        console.log(`[mcporter-call] success: ${toolCall}`);
        resolve(result);
      } catch (parseErr) {
        // JSON 解析失败，返回原始输出
        console.warn(`[mcporter-call] JSON parse failed, using raw output: ${stdout.substring(0, 200)}`);
        resolve({
          content: [{ type: 'text', text: stdout }] as TextContent[],
          provider: serverName,
          tool: toolName,
          raw: { raw: stdout, stderr },
        });
      }
    });

    // 设置超时
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`mcporter 调用超时（60s）: ${toolCall}`));
    }, 60000);
  });
}

/**
 * 调用 MiniMax MCP 的 understand_image 工具
 * @param prompt 图像分析问题
 * @param imageSource 图片URL或本地路径
 */
export async function understandImage(
  prompt: string,
  imageSource: string
): Promise<McpCallResult> {
  // 处理本地文件路径（如果以 @ 开头，需要去掉）
  const cleanImageSource = imageSource.startsWith('@') 
    ? imageSource.substring(1) 
    : imageSource;
    
  return mcporterCall('MiniMax', 'understand_image', {
    prompt,
    image_source: cleanImageSource,
  });
}

/**
 * 调用 MiniMax MCP 的 web_search 工具
 * @param query 搜索查询
 */
export async function webSearch(query: string): Promise<McpCallResult> {
  return mcporterCall('MiniMax', 'web_search', { query });
}

/**
 * 检查 mcporter daemon 是否运行
 */
export async function checkDaemon(): Promise<boolean> {
  try {
    const { stdout } = await execFile('npx', ['mcporter', 'daemon', 'status', '--json'], {
      timeout: 10000,
    });
    const parsed = JSON.parse(stdout);
    return parsed.status === 'running';
  } catch {
    return false;
  }
}
