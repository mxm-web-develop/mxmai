/**
 * Test App Helper
 *
 * Creates an isolated Express app instance for integration testing
 * without starting the actual server.
 */

import express from 'express';
import cors from 'cors';
import { responseMiddleware } from '../../middleware/response';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';
import healthRouter from '../../routes/health';
import accountRouter from '../../routes/account';
import assetsRouter from '../../routes/assets';

export function createTestApp() {
  const app = express();

  // CORS
  app.use(cors({ origin: '*', credentials: true }));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Response middleware
  app.use(responseMiddleware);

  // Routes
  app.use('/', healthRouter);
  app.use('/api/v1/account', accountRouter);
  app.use('/api/v1/assets', assetsRouter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}