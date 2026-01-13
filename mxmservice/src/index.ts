import express from 'express';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import promptOptimizerRouter from './routes/prompt-optimizer';

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4003;

app.use(express.json());
app.use('/', healthRouter);
app.use('/api/prompt-optimizer', promptOptimizerRouter);

app.listen(port, () => {
  console.log('mxmprompt service listening on port ' + port);
});
