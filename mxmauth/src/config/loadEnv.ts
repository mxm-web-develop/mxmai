import { loadMonorepoEnv } from '@mxmai/mxmdata';

declare global {
  // eslint-disable-next-line no-var
  var __MXMAUTH_ENV_LOADED__: boolean | undefined;
}

if (!global.__MXMAUTH_ENV_LOADED__) {
  loadMonorepoEnv({ service: 'mxmauth' });
  global.__MXMAUTH_ENV_LOADED__ = true;
}
