import { MockOpenApiAdapter } from './mock';
import { HttpOpenApiAdapter } from './http';
import type { OpenApiPort } from './types';
import { getApiMode, getOpenApiBaseUrl } from '@/lib/runtime-config';
import { getAuthBearerTokenSync } from '@/lib/auth-token';
import { isSmsLoggedIn } from '@/lib/partner-session';

let instance: OpenApiPort | null = null;

export function getOpenApiAdapter(): OpenApiPort {
  if (instance) return instance;

  const mode = getApiMode();
  if (mode === 'http') {
    instance = new HttpOpenApiAdapter({
      baseUrl: getOpenApiBaseUrl(),
      getToken: getAuthBearerTokenSync,
      ensureAuth: async () => {
        if (!isSmsLoggedIn()) {
          throw new Error('请先手机号登录');
        }
      },
    });
  } else {
    instance = new MockOpenApiAdapter();
  }

  return instance;
}

export function resetOpenApiAdapter(): void {
  instance = null;
}
