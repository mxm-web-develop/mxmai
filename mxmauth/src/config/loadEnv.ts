import dotenv from 'dotenv';
import { resolve } from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __MXMAUTH_ENV_LOADED__: boolean | undefined;
}

if (!global.__MXMAUTH_ENV_LOADED__) {
  // 禁用 dotenv 的提示信息
  process.env.DOTENV_CONFIG_DEBUG = 'false';
  
  // 重要：先加载项目根目录 .env（包含 SUPABASE_URL 等关键配置），再加载其他 .env
  // 使用 override: false 确保关键配置不被覆盖
  const projectRootEnvPath = resolve(__dirname, '../../..', '.env');
  const workspaceEnvPath = resolve(__dirname, '../../../mxmdata/.env');
  const mxmauthEnvPath = resolve(__dirname, '..', '.env');
  
  // 按优先级顺序加载：项目根目录 -> mxmdata -> mxmauth
  dotenv.config({ path: projectRootEnvPath, override: false });
  dotenv.config({ path: workspaceEnvPath, override: false });
  dotenv.config({ path: mxmauthEnvPath, override: false });
  
  global.__MXMAUTH_ENV_LOADED__ = true;
}

