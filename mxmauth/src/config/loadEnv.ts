import dotenv from 'dotenv';
import { resolve } from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __MXMAUTH_ENV_LOADED__: boolean | undefined;
}

if (!global.__MXMAUTH_ENV_LOADED__) {
  // 禁用 dotenv 的提示信息
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  
  const workspaceEnvPath = resolve(__dirname, '../../../mxmdata/.env');
  dotenv.config({ path: workspaceEnvPath });
  dotenv.config(); // load mxmauth/.env for tsx watch
  global.__MXMAUTH_ENV_LOADED__ = true;
}

