import express from 'express';
import dotenv from 'dotenv';
import { resolve } from 'path';
import healthRouter from './routes/health';
import smartflowRouter from './routes/smartflow';
import taskRouter from './routes/task';
import promptTemplateRouter from './routes/prompt-template';
import modelsRouter from './routes/models';

// 禁用 dotenv 的提示信息
process.env.DOTENV_CONFIG_DEBUG = 'false';

// 加载环境变量（优先加载项目根目录的 .env）
dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config(); // 也加载当前目录的 .env（如果有）

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4004;

// JSON 解析中间件，允许空 body（用于 DELETE 等请求）
app.use(express.json({
  strict: false, // 允许非数组/对象的 JSON
  verify: (req: any, res: any, buf: Buffer) => {
    // 如果 body 为空，不尝试解析
    if (buf.length === 0) {
      req.body = {};
    }
  },
}));

// 路由注册
app.use('/', healthRouter);
app.use('/api/v1/smartflows', smartflowRouter);
app.use('/api/v1/tasks', taskRouter);
app.use('/api/v1/prompt-templates', promptTemplateRouter);
app.use('/api/v1/models', modelsRouter);

app.listen(port, () => {
  console.log('mxmagent service listening on port ' + port);
});
