'use client';

import { useEffect } from 'react';
import { resetOpenApiAdapter } from '@/adapters';
import { ensurePartnerSession, isSmsLoggedIn } from '@/lib/partner-session';
import { ensureProjectStorageReady } from '@/lib/project/project-migrate-v1';
import { getApiMode, seedOpenApiRuntimeFromEnv } from '@/lib/runtime-config';
import { syncProjectsFromCloud } from '@/lib/project/project-sync';
import { taskNotificationsWs } from '@/lib/realtime/task-notifications-ws';

/** 应用启动：注入 .env 配置、Partner 会话、迁移项目存储、建立任务进度 WebSocket */
export function OpenApiBootstrap() {
  useEffect(() => {
    seedOpenApiRuntimeFromEnv();
    resetOpenApiAdapter();
    void ensureProjectStorageReady();
    if (getApiMode() === 'http' && isSmsLoggedIn()) {
      void ensurePartnerSession()
        .then(() => syncProjectsFromCloud())
        .catch(() => {
          /* 会话过期时由 AuthGate 跳转登录 */
        });
    }
    taskNotificationsWs.start();
    return () => taskNotificationsWs.stop();
  }, []);
  return null;
}
