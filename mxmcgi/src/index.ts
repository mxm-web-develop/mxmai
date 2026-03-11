import express from 'express';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// 禁用 dotenv 的提示信息
process.env.DOTENV_CONFIG_DEBUG = 'false';

// ⚠️ 重要：必须在导入任何使用环境变量的模块之前加载 .env
// 明确指定 .env 文件路径（优先使用 mxmcgi 目录下的 .env，如果不存在则使用项目根目录的 .env）
// 注意：__dirname 在 tsx watch 模式下指向 src 目录，在编译后指向 dist 目录
const currentFileDir = __dirname; // src 或 dist 目录
const mxmcgiDir = path.resolve(currentFileDir, '..'); // mxmcgi 目录（从 src 或 dist 向上）
const projectRoot = path.resolve(currentFileDir, '../..'); // 项目根目录

// 尝试多个可能的 .env 文件路径
// 重要：先加载项目根目录 .env（包含 SUPABASE_URL 等关键配置），再加载 mxmcgi/.env
// 策略：先加载项目根目录 .env，再加载 mxmcgi/.env，使用 override: false 确保关键配置不被覆盖
const envPaths = [
  path.resolve(projectRoot, '.env'),         // 项目根目录/.env（优先加载，包含 SUPABASE_URL 等关键配置）
  path.resolve(process.cwd(), '.env'),      // 当前工作目录/.env
  path.resolve(mxmcgiDir, '.env'),          // mxmcgi/.env（后加载，不覆盖已存在的变量）
  path.resolve(process.cwd(), 'mxmcgi', '.env'), // 当前工作目录/mxmcgi/.env
];

// 尝试加载 .env 文件（按优先级顺序）
// 策略：先加载项目根目录 .env（包含 SUPABASE_URL 等关键配置），再加载 mxmcgi/.env
// 使用 override: false 确保先加载的关键配置不会被后加载的文件覆盖
let envLoaded = false;
const loadedEnvPaths: string[] = [];

for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const result = dotenv.config({ path: envPath, override: false });
  if (!result.error) {
    envLoaded = true;
    loadedEnvPaths.push(envPath);
    console.log(`[mxmcgi] ✅ 已加载 .env 文件: ${envPath}`);
  }
}

// 如果还没有加载任何 .env，尝试默认方式
if (!envLoaded) {
  const result = dotenv.config({ override: false });
  if (!result.error) {
    envLoaded = true;
    console.log(`[mxmcgi] ✅ 使用默认 .env 加载方式（从当前工作目录: ${process.cwd()}）`);
  } else {
    console.warn(`[mxmcgi] ⚠️  未能加载 .env 文件，尝试的路径: ${envPaths.join(', ')}`);
  }
}

// 验证 DEFAULT_PROVIDER 是否已加载
if (process.env.DEFAULT_PROVIDER) {
  console.log(`[mxmcgi] ✅ 已读取 DEFAULT_PROVIDER: ${process.env.DEFAULT_PROVIDER}`);
} else {
  console.warn(`[mxmcgi] ⚠️  DEFAULT_PROVIDER 未设置，将使用默认值: replicate`);
}

// 初始化 RepositoryFactory（必须在导入路由之前）
import { RepositoryFactory } from '@mxmai/mxmdata';
RepositoryFactory.init();

// 加载模型注册（video、audio、graph、writing 按 provider 拆分）
import './models/deerapi/video';
import './models/deerapi/audio';
import './models/deerapi/writing';
import './models/replicate/writing';
import './models/deerapi/graph';
import './models/volc/graph';
import './models/replicate/graph';
import './models/ppio/audio';
import './models/minimax/audio';
import './models/openai';

// 导入路由（在 dotenv.config() 之后，确保环境变量已加载）
import healthRouter from './routes/health';
import graphRouter from './routes/graph';
import audioRouter from './routes/audio';
import videoRouter from './routes/video';
import uploadRouter from './routes/upload';
import cgiTasksRouter from './routes/cgi-tasks';
import systemRouter from './routes/system';
import mediaRouter from './routes/media';
import knowledgeRouter from './routes/knowledge';
import writingRouter from './routes/writing';
import characterRouter from './routes/character';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4003;

// 支持 application/json 和 text/plain（Postman 等工具可能发送 text/plain）
app.use((req, res, next) => {
  // 如果 Content-Type 是 text/plain 但内容是 JSON，转换为 application/json
  if (req.headers['content-type'] === 'text/plain' && req.method === 'POST') {
    req.headers['content-type'] = 'application/json';
  }
  next();
});

app.use(express.json({ 
  limit: '20mb', // 支持大文件上传（base64 图片等）
  type: ['application/json', 'text/plain'], // 同时支持两种 Content-Type
}));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/', healthRouter);
app.use('/graph', graphRouter);
app.use('/audio', audioRouter);
app.use('/video', videoRouter);
app.use('/upload', uploadRouter);
app.use('/api/v1/cgi-tasks', cgiTasksRouter);
app.use('/system', systemRouter);
app.use('/media', mediaRouter);
app.use('/knowledge', knowledgeRouter);
app.use('/writing', writingRouter);
app.use('/api/v1/characters', characterRouter);

// 全局错误处理：客户端/网关提前关闭连接会导致 raw-body 抛出 request aborted，避免未处理异常刷屏
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  const msg = err?.message ?? String(err);
  const isAborted = err?.code === 'ECONNABORTED' || /request aborted|aborted/i.test(msg);
  if (isAborted) {
    try { if (!res.writableEnded) res.status(499).json({ success: false, error: 'Client closed request' }); } catch { /* 连接已关闭 */ }
    return;
  }
  console.error('[mxmcgi] Unhandled error:', err);
  try { res.status(500).json({ success: false, error: msg }); } catch { /* ignore */ }
});

app.listen(port, async () => {
  console.log('mxmcgi service listening on port ' + port);

  // 从 DB 加载业务模型路由覆盖，使 Admin 配置在重启后生效
  try {
    const { getSupabaseClient } = await import('@mxmai/mxmdata');
    const { setRoutingOverride } = await import('./models/providers');
    const supabase = getSupabaseClient();
    const { data: rows, error } = await supabase
      .from('model_routing_overrides')
      .select('logical_model, provider, model');
    if (!error && rows && rows.length > 0) {
      for (const r of rows as { logical_model: string; provider: string; model: string }[]) {
        setRoutingOverride(r.logical_model, { provider: r.provider as any, model: r.model });
      }
      console.log(`[mxmcgi] ✅ 已加载 ${rows.length} 条业务模型路由覆盖`);
    }
  } catch (e) {
    console.warn('[mxmcgi] ⚠️  加载业务模型路由覆盖失败:', e instanceof Error ? e.message : String(e));
  }

  // 启动任务事件 outbox 重试（不影响主流程）
  try {
    const { TaskEventOutboxProcessor } = await import('./task/notification-outbox');
    const processor = new TaskEventOutboxProcessor({
      intervalMs: Number(process.env.TASK_EVENT_OUTBOX_INTERVAL_MS || 3000),
      batchSize: Number(process.env.TASK_EVENT_OUTBOX_BATCH_SIZE || 30),
      maxAttempts: Number(process.env.TASK_EVENT_OUTBOX_MAX_ATTEMPTS || 20),
    });
    processor.start();
    console.log('[mxmcgi] ✅ Task event outbox processor started');
  } catch (e) {
    console.warn('[mxmcgi] ⚠️  Task event outbox processor start failed:', e instanceof Error ? e.message : String(e));
  }

  // 启动任务恢复服务
  // 配置更长的超时时间，特别是视频任务可能需要 60 分钟以上
  try {
    const { getTaskRecoveryService } = await import('./task/task-recovery');
    const taskRecoveryService = getTaskRecoveryService({
      timeoutMs: 60 * 60 * 1000, // 60 分钟（视频任务可能需要更长时间）
      checkIntervalMs: 5 * 60 * 1000, // 5 分钟检查一次
      autoRecoverOnStartup: true,
      autoRetry: false,
    });
    await taskRecoveryService.start();
    console.log('[mxmcgi] ✅ 任务恢复服务已启动（超时时间：60 分钟）');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // 检查是否是 Supabase 连接错误
    if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
      console.warn('[mxmcgi] ⚠️  任务恢复服务启动失败：Supabase 连接不可用');
      console.warn('[mxmcgi] ⚠️  提示：请检查 SUPABASE_URL 和 SUPABASE_ANON_KEY 环境变量是否正确');
      console.warn('[mxmcgi] ⚠️  应用将继续运行，但任务恢复功能暂时不可用');
    } else {
      console.error('[mxmcgi] ⚠️  任务恢复服务启动失败:', errorMessage);
    }
    // 不阻止应用启动，恢复服务失败不影响主要功能
  }
});
