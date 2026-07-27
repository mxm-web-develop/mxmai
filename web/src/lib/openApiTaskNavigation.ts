/** 从开放 API 统计页跳转到业务任务详情（无 React Router 深链） */

export const OPEN_API_TASK_NAV_KEY = 'mxm_pending_task_nav';

export type OpenApiNavPageId =
  | 'graph'
  | 'writing'
  | 'video'
  | 'audio'
  | 'music'
  | 'smartflow';

export type OpenApiTaskNavPayload = {
  page: OpenApiNavPageId;
  taskId: string;
  creationSourceTab: 'open_api';
};

export function scopeToNavPage(
  scope: string | null | undefined,
  kind: string
): OpenApiNavPageId | null {
  if (kind === 'smartflow') return 'smartflow';
  const s = String(scope ?? '').toLowerCase();
  if (s === 'graph') return 'graph';
  if (s === 'writing' || s === 'outline' || s === 'text') return 'writing';
  if (s === 'video') return 'video';
  if (s === 'audio') return 'audio';
  if (s === 'music') return 'music';
  return 'graph';
}

export function saveOpenApiTaskNav(payload: OpenApiTaskNavPayload): void {
  sessionStorage.setItem(OPEN_API_TASK_NAV_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent('mxm-request-nav'));
}

export function peekOpenApiTaskNav(): OpenApiTaskNavPayload | null {
  try {
    const raw = sessionStorage.getItem(OPEN_API_TASK_NAV_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as OpenApiTaskNavPayload;
    if (!p?.taskId || !p?.page) return null;
    return p;
  } catch {
    return null;
  }
}

export function consumeOpenApiTaskNav(): OpenApiTaskNavPayload | null {
  const p = peekOpenApiTaskNav();
  if (p) sessionStorage.removeItem(OPEN_API_TASK_NAV_KEY);
  return p;
}
