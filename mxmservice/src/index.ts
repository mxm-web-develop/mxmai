import express from 'express';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import promptOptimizerRouter from './routes/prompt-optimizer';
import agentChatRouter from './routes/agent-chat';

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4004;

app.use(express.json());

// CORS for mobile app
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id, x-username');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Routes
app.use('/', healthRouter);
app.use('/api/prompt-optimizer', promptOptimizerRouter);
app.use('/api/v1/agents', agentChatRouter);

app.listen(port, () => {
  console.log(`[mxmservice] Agent service listening on port ${port}`);
  console.log(`[mxmservice] Agent Chat API: http://localhost:${port}/api/v1/agents/message`);
});
