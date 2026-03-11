/**
 * 后台接口调试用 API 客户端
 * Base URL 默认指向 Gateway（如 http://localhost:3000）
 */

const getBaseUrl = (): string => {
  const stored = localStorage.getItem('api_base_url');
  // 开发时留空则走当前域名，配合 Vite proxy 代理到 Gateway
  return stored !== null && stored !== '' ? stored : '';
};

const getToken = (): string => {
  return localStorage.getItem('api_token') || '';
};

export function setBaseUrl(url: string) {
  localStorage.setItem('api_base_url', url);
}

export function setToken(token: string) {
  if (token) localStorage.setItem('api_token', token);
  else {
    localStorage.removeItem('api_token');
    setStoredUser(null);
  }
}

export function getStoredToken(): string {
  return getToken();
}

export async function request<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'body' | 'headers' | 'method'> & {
    method?: string;
    headers?: Record<string, string>;
    body?: object | FormData | string | null;
  } = {}
): Promise<{ data?: T; error?: string; status: number }> {
  const base = getBaseUrl().replace(/\/$/, '');
  const url = path.startsWith('http') ? path : base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();

  const { body, headers: customHeaders, method, ...rest } = options;
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(customHeaders ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const init: RequestInit = { ...rest, method, headers };
  if (body !== undefined) {
    if (isFormData) init.body = body;
    else if (typeof body === 'string') init.body = body;
    else if (body === null) init.body = null;
    else init.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data: T | undefined;
    try {
      data = text ? (JSON.parse(text) as T) : undefined;
    } catch {
      data = text as unknown as T;
    }
    if (!res.ok) {
      if (res.status === 401) {
        setToken('');
        try {
          sessionStorage.setItem('auth_401', '1');
          window.dispatchEvent(new CustomEvent('auth:401'));
        } catch {}
        const errMsg = (data as { message?: string; error?: string })?.message ?? (data as { message?: string; error?: string })?.error ?? res.statusText;
        return { error: String(errMsg), status: res.status };
      }
      const errMsg = (data as { message?: string; error?: string })?.message ?? (data as { message?: string; error?: string })?.error ?? res.statusText;
      return { error: String(errMsg), status: res.status };
    }
    return { data, status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), status: 0 };
  }
}

export interface LoginUser {
  id: string;
  username: string;
  role?: 'user' | 'admin';
  primaryBalance?: { assetCode: string; availableBalance: string };
  [key: string]: unknown;
}

// 登录（mxmauth 返回 { code, data: { user, tokens: { accessToken, refreshToken } } }）
export async function login(username: string, password: string) {
  const res = await request<{ data?: { tokens?: { accessToken: string }; user?: LoginUser } }>('/api/v1/account/login', {
    method: 'POST',
    body: { username, password },
  });
  if (res.error) return { error: res.error };
  const body = res.data as { data?: { tokens?: { accessToken: string }; user?: LoginUser } };
  const data = body?.data ?? (body as unknown as { tokens?: { accessToken: string }; user?: LoginUser });
  const tokens = data?.tokens;
  const user = data?.user;
  if (tokens?.accessToken) {
    setToken(tokens.accessToken);
    if (user) setStoredUser(user);
    return { ok: true, accessToken: tokens.accessToken, user };
  }
  return { error: '响应中无 accessToken' };
}

function setStoredUser(user: LoginUser | null) {
  if (user) localStorage.setItem('api_user', JSON.stringify(user));
  else localStorage.removeItem('api_user');
}

export function getStoredUser(): LoginUser | null {
  try {
    const s = localStorage.getItem('api_user');
    return s ? (JSON.parse(s) as LoginUser) : null;
  } catch {
    return null;
  }
}

// 获取当前用户信息（需已登录）
export async function getProfile() {
  return request<{ data?: LoginUser }>('/api/v1/account/profile');
}

// 修改密码（需已登录）
export async function changeMyPassword(params: { currentPassword: string; newPassword: string }) {
  return request<{ code?: number; message?: string }>('/api/v1/account/password', {
    method: 'PUT',
    body: {
      current_password: params.currentPassword,
      new_password: params.newPassword,
    },
  });
}

// ---------- API 密钥（需已登录）----------
export interface AccountApiKeyItem {
  id: string;
  key_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export async function getAccountApiKeys() {
  return request<{ code?: number; data?: AccountApiKeyItem[] }>('/api/v1/account/api-keys');
}

export interface CreateAccountApiKeyResult {
  id: string;
  name: string | null;
  key_prefix: string;
  created_at: string;
  key: string;
}

export async function createAccountApiKey(name?: string) {
  return request<{ code?: number; message?: string; data?: CreateAccountApiKeyResult }>('/api/v1/account/api-keys', {
    method: 'POST',
    body: name != null ? { name: String(name).trim() || undefined } : {},
  });
}

export async function deleteAccountApiKey(id: string) {
  return request(`/api/v1/account/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// 角色列表
export async function listCharacters(params?: {
  search?: string;
  is_public?: boolean;
  page?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.is_public !== undefined) q.set('is_public', String(params.is_public));
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const query = q.toString();
  return request<{ data?: { characters?: CharacterItem[]; total?: number } }>(
    `/api/v1/characters${query ? `?${query}` : ''}`
  );
}

export interface CharacterItem {
  id: string;
  name: string;
  nickname?: string;
  description?: string;
  age?: number | string;
  category?: string[];
  tags?: string[];
  appearance?: { description?: string; reference_images?: string[] };
  clothing_style?: { description?: string; reference_images?: string[] };
  voice?: {
    voice_id?: string;
    voice_example?: string;
    description?: string;
  };
  reference_videos?: string[];
  others?: { personality?: string; background?: string; [key: string]: unknown };
  personality?: Record<string, unknown>;
  background?: Record<string, unknown>;
  mediaUrls?: { avatar?: string; voice_example?: string };
  is_public?: boolean;
  created_at?: string;
  updated_at?: string;
}

// 角色详情
export async function getCharacter(id: string) {
  return request<{ data?: CharacterItem }>(`/api/v1/characters/${encodeURIComponent(id)}`);
}

// 创建角色
export async function createCharacter(body: Record<string, unknown>) {
  return request('/api/v1/characters', { method: 'POST', body });
}

// 更新角色
export async function updateCharacter(id: string, body: Record<string, unknown>) {
  return request(`/api/v1/characters/${encodeURIComponent(id)}`, { method: 'PUT', body });
}

// 删除角色
export async function deleteCharacter(id: string) {
  return request(`/api/v1/characters/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// 上传用户资源（图片等），用于角色参考图，存储到 userId/upload/graph/
export async function uploadAssets(file: File) {
  const form = new FormData();
  form.append('file', file);
  return request<{ data?: { url: string; key: string; bucket: string; proxyPath?: string } }>(
    '/api/v1/cgi/upload/assets',
    { method: 'POST', body: form }
  );
}

// 关联图片任务到角色
export async function linkCharacterImageTask(
  characterId: string,
  taskId: string,
  imageType: 'appearance' | 'clothing_style' = 'appearance'
) {
  return request(`/api/v1/characters/${encodeURIComponent(characterId)}/link-image-task`, {
    method: 'POST',
    body: { taskId, imageType },
  });
}

// 大纲生成
export async function createOutline(body: Record<string, unknown>) {
  return request<{ data?: { taskId?: string } }>('/api/v1/writing/outline', { method: 'POST', body });
}

// 写作生成
export async function createWriting(body: Record<string, unknown>) {
  return request<{ data?: { taskId?: string } }>('/api/v1/writing/generate', { method: 'POST', body });
}

// 查询任务
export async function getTask(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}`);
}

// 删除任务（软删除）
export async function deleteTask(taskId: string) {
  return request(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

// 写作任务列表（含大纲，当前用户）
export interface WritingTaskItem {
  id: string;
  type: string;
  status: string;
  progress?: { status: string; progress?: number; error?: string };
  result?: { metadata?: Record<string, unknown> };
  metadata?: Record<string, unknown>;
  requestParams?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface WritingTaskListResponse {
  success?: boolean;
  data?: {
    tasks: WritingTaskItem[];
    total: number;
    count: number;
    limit: number;
    offset: number;
  };
}

export async function listWritingTasks(params?: {
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  q.set('type', 'writing');
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  return request<WritingTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

// 通用 CGI 任务列表（图片 type=graph、音频 type=audio、视频 type=video）
export async function listCgiTasks(params: {
  type: 'graph' | 'audio' | 'video';
  status?: string;
  model?: string;
  limit?: number;
  offset?: number;
}) {
  const q = new URLSearchParams();
  q.set('type', params.type);
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  return request<WritingTaskListResponse>(`/api/v1/cgi-tasks?${q.toString()}`);
}

// 视频生成
export async function createVideo(body: Record<string, unknown>) {
  return request<{ data?: unknown }>('/api/v1/cgi/video/generate', { method: 'POST', body });
}

// ---------- 图文 ----------
export async function getGraphFormOptions(params?: { graphType?: 'photograph' | 'design' | 'painting'; type?: string; lang?: string }) {
  const q = new URLSearchParams();
  // 后端通过 query 中是否存在 photograph/design/painting 来判断 graphType
  if (params?.graphType) q.set(params.graphType, '1');
  if (params?.type) q.set('type', params.type);
  if (params?.lang) q.set('lang', params.lang);
  const query = q.toString();
  return request<{ data?: unknown }>(`/api/v1/cgi/graph/getformOptions${query ? `?${query}` : ''}`);
}

export async function postGraph(path: 'photograph' | 'design' | 'painting', body: Record<string, unknown>) {
  return request<{ data?: unknown }>(`/api/v1/cgi/graph/${path}`, { method: 'POST', body });
}

export async function postGraphModel(modelName: string, body: Record<string, unknown>) {
  return request<{ data?: unknown }>(`/api/v1/cgi/graph/${encodeURIComponent(modelName)}`, { method: 'POST', body });
}

// ---------- 文本 ----------
export async function postTextModel(modelName: string, body: Record<string, unknown>) {
  return request<{ data?: unknown }>(`/api/v1/cgi/text/${encodeURIComponent(modelName)}`, { method: 'POST', body });
}

// ---------- 音频 ----------
export async function getAudioModels() {
  return request<{ data?: unknown }>('/api/v1/cgi/audio/models');
}

export async function postAudioModel(modelName: string, body: Record<string, unknown>) {
  return request<{ data?: unknown }>(`/api/v1/cgi/audio/${encodeURIComponent(modelName)}`, { method: 'POST', body });
}

// ---------- 知识库 ----------
export async function listKnowledgeBases() {
  return request<{ data?: unknown }>('/api/v1/knowledge/bases');
}

export async function getKnowledgeBase(id: string) {
  return request<{ data?: unknown }>(`/api/v1/knowledge/bases/${encodeURIComponent(id)}`);
}

export async function searchKnowledgeBase(id: string, body: { query: string; limit?: number }) {
  return request<{ data?: unknown }>(`/api/v1/knowledge/bases/${encodeURIComponent(id)}/search`, { method: 'POST', body });
}

// ---------- 媒体（按任务取结果） ----------
export async function getMediaGraph(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/graph/${encodeURIComponent(taskId)}`);
}

export async function getMediaVideo(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/video/${encodeURIComponent(taskId)}`);
}

export async function getMediaWriting(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/writing/${encodeURIComponent(taskId)}`);
}

export async function getMediaAudio(taskId: string) {
  return request<{ data?: unknown }>(`/api/v1/media/audio/${encodeURIComponent(taskId)}`);
}

/** 获取媒体文件的 Blob URL（用于 img/audio 展示，需带认证） */
export async function fetchMediaBlobUrl(
  taskId: string,
  type: 'graph' | 'audio' | 'video'
): Promise<string> {
  const base = getBaseUrl().replace(/\/$/, '');
  const path = `/api/v1/media/${type}/${encodeURIComponent(taskId)}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(res.statusText || 'Failed to fetch media');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** 获取用户上传资源（/media/asset）的 Blob URL（用于 img 展示，需带认证） */
export async function fetchAssetBlobUrl(bucket: string, key: string): Promise<string> {
  const base = getBaseUrl().replace(/\/$/, '');
  const path = `/api/v1/media/asset?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
  const url = base ? `${base}${path.startsWith('/') ? '' : '/'}${path}` : path.startsWith('/') ? path : `/${path}`;
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(res.statusText || 'Failed to fetch asset');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---------- 表单选项（写作/视频/图文，用于提示词与参数对照） ----------
export async function getWritingFormOptions(params?: { writing_type?: string; outline_type?: string; lang?: string }) {
  const q = new URLSearchParams();
  if (params?.writing_type) q.set('writing_type', params.writing_type);
  if (params?.outline_type) q.set('outline_type', params.outline_type);
  if (params?.lang) q.set('lang', params.lang ?? 'zh');
  return request<{ data?: unknown }>(`/api/v1/writing/getformOptions?${q.toString()}`);
}

export async function getVideoFormOptions(params?: { lang?: string; mode?: 'sora-2' | 'sora-2-deer' }) {
  const q = new URLSearchParams();
  if (params?.lang) q.set('lang', params.lang ?? 'zh');
  if (params?.mode) q.set('mode', params.mode);
  return request<{ data?: unknown }>(`/api/v1/cgi/video/getformOptions?${q.toString()}`);
}

// ---------- 提示词工程配置（Admin） ----------
export interface PromptConfigParams {
  scope?: string;
  type?: string;
  subtype?: string | null;
  lang?: string;
}

export interface PromptConfigBody {
  scope: string;
  type: string;
  subtype?: string | null;
  rules_i18n?: Record<string, string>;
  output_format_i18n?: Record<string, string>;
  form_options_i18n?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  is_active?: boolean;
}

export async function listPromptConfig(params?: PromptConfigParams) {
  const q = new URLSearchParams();
  if (params?.scope) q.set('scope', params.scope);
  if (params?.type) q.set('type', params.type);
  if (params?.subtype != null && params.subtype !== '') q.set('subtype', String(params.subtype));
  const query = q.toString();
  return request<{ data?: { items?: unknown[]; total?: number } }>(
    `/api/v1/system/prompt-config${query ? `?${query}` : ''}`
  );
}

export async function getPromptConfigByKey(params: { scope: string; type: string; subtype?: string | null; lang?: string }) {
  const q = new URLSearchParams({ scope: params.scope, type: params.type });
  if (params.subtype != null && params.subtype !== '') q.set('subtype', String(params.subtype));
  if (params.lang) q.set('lang', params.lang);
  return request<{ data?: unknown }>(`/api/v1/system/prompt-config/by-key?${q.toString()}`);
}

export async function upsertPromptConfig(body: PromptConfigBody) {
  return request<{ data?: unknown }>('/api/v1/system/prompt-config', { method: 'PUT', body });
}

export async function deletePromptConfig(id: string) {
  return request(`/api/v1/system/prompt-config/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------- 管理员：敏感词管理（需 Admin 权限）----------
const SENSITIVE_BASE = '/api/v1/system/admin/sensitive-words';

export async function listSensitiveWordLists() {
  return request<{ data?: { items?: { id: string; name: string; description?: string | null; is_active: boolean }[] } }>(`${SENSITIVE_BASE}/lists`);
}

export async function getSensitiveWordList(listId: string) {
  return request<{ data?: { id: string; name: string; description?: string | null; is_active: boolean } }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}`);
}

export async function createSensitiveWordList(body: { name: string; description?: string | null; is_active?: boolean }) {
  return request<{ data?: { id: string; name: string } }>(`${SENSITIVE_BASE}/lists`, { method: 'POST', body });
}

export async function updateSensitiveWordList(listId: string, body: { name?: string; description?: string | null; is_active?: boolean }) {
  return request<{ data?: unknown }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}`, { method: 'PUT', body });
}

export async function deleteSensitiveWordList(listId: string) {
  return request(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}`, { method: 'DELETE' });
}

export async function listSensitiveWords(listId: string) {
  return request<{ data?: { items?: { id: string; list_id: string; word: string }[] } }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}/words`);
}

export async function addSensitiveWord(listId: string, word: string) {
  return request<{ data?: unknown }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}/words`, { method: 'POST', body: { word } });
}

export async function addSensitiveWordsBatch(listId: string, words: string[]) {
  return request<{ data?: { added: number } }>(`${SENSITIVE_BASE}/lists/${encodeURIComponent(listId)}/words/batch`, { method: 'POST', body: { words } });
}

export async function deleteSensitiveWord(wordId: string) {
  return request(`${SENSITIVE_BASE}/words/${encodeURIComponent(wordId)}`, { method: 'DELETE' });
}

export async function listSensitiveWordBindings(params?: { scope?: string; type?: string; subtype?: string }) {
  const q = new URLSearchParams();
  if (params?.scope != null) q.set('scope', params.scope);
  if (params?.type != null) q.set('type', params.type);
  if (params?.subtype != null) q.set('subtype', params.subtype);
  const query = q.toString();
  return request<{ data?: { items?: { id: string; scope: string; type: string; subtype: string | null; list_id: string; sort_order: number }[] } }>(
    `${SENSITIVE_BASE}/bindings${query ? `?${query}` : ''}`
  );
}

export async function setSensitiveWordBindingsForSlot(body: { scope: string; type: string; subtype?: string | null; list_ids: string[] }) {
  return request<{ data?: unknown }>(`${SENSITIVE_BASE}/bindings/slot`, { method: 'PUT', body });
}

export async function removeSensitiveWordBinding(bindingId: string) {
  return request(`${SENSITIVE_BASE}/bindings/${encodeURIComponent(bindingId)}`, { method: 'DELETE' });
}

// ---------- 管理员：系统知识库默认绑定（需 Admin 权限）----------
export async function getKnowledgeAdminDefaults(scope?: string) {
  const q = scope != null ? `?scope=${encodeURIComponent(scope)}` : '';
  return request<{ data?: { defaults?: { scope: string; category: string; sub_type: string; knowledge_base_id: string }[] } }>(
    `/api/v1/knowledge/admin/defaults${q}`
  );
}

export async function setKnowledgeAdminDefault(body: { scope: string; category: string; sub_type: string; knowledge_base_id: string }) {
  return request<{ data?: unknown }>('/api/v1/knowledge/admin/defaults', { method: 'PUT', body });
}

export async function deleteKnowledgeAdminDefault(scope: string, category: string, subType: string) {
  return request(
    `/api/v1/knowledge/admin/defaults/${encodeURIComponent(scope)}/${encodeURIComponent(category)}/${encodeURIComponent(subType)}`,
    { method: 'DELETE' }
  );
}

// ---------- 管理员：用户列表（需 Admin 权限）----------
export interface AdminUsersParams {
  page?: number;
  limit?: number;
  status?: 'active' | 'suspended' | 'banned';
  role?: 'user' | 'admin';
  search?: string;
}

export interface AdminUserItem {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  role?: 'user' | 'admin';
  status?: string;
  level?: number;
  balance?: number;
  membership_type?: string;
  isLoggedIn?: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function getAdminUsers(params?: AdminUsersParams) {
  const q = new URLSearchParams();
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.status) q.set('status', params.status);
  if (params?.role) q.set('role', params.role);
  if (params?.search) q.set('search', params.search);
  const query = q.toString();
  return request<{ code?: number; data?: { users?: AdminUserItem[]; pagination?: { total: number; page: number; limit: number; totalPages: number } } }>(
    `/api/v1/account/admin/users${query ? `?${query}` : ''}`
  );
}

export async function updateAdminUserStatus(userId: string, status: 'active' | 'suspended' | 'banned') {
  return request(`/api/v1/account/admin/users/${encodeURIComponent(userId)}/status`, {
    method: 'PUT',
    body: { status },
  });
}

export async function adminForceLogout(userId: string) {
  return request(`/api/v1/account/admin/users/${encodeURIComponent(userId)}/force-logout`, {
    method: 'POST',
  });
}

// ---------- 管理员：任务列表（需 Admin 权限）----------
export interface AdminTasksParams {
  type?: string;
  status?: string;
  model?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  includeDeleted?: boolean;
}

export interface AdminTaskItem {
  id: string;
  type: string;
  status: string;
  progress?: { status: string; progress?: number; error?: string };
  metadata?: { userId?: string; userName?: string; model?: string; provider?: string };
  /** 后端保存的原始请求参数（已做 base64 清理），用于展示 provider 传参 */
  requestParams?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export async function getAdminTasks(params?: AdminTasksParams) {
  const q = new URLSearchParams();
  if (params?.type) q.set('type', params.type);
  if (params?.status) q.set('status', params.status);
  if (params?.model) q.set('model', params.model);
  if (params?.userId) q.set('userId', params.userId);
  if (params?.limit != null) q.set('limit', String(params.limit));
  if (params?.offset != null) q.set('offset', String(params.offset));
  if (params?.startDate) q.set('startDate', params.startDate);
  if (params?.endDate) q.set('endDate', params.endDate);
  if (params?.includeDeleted) q.set('includeDeleted', 'true');
  const query = q.toString();
  return request<{ success?: boolean; data?: { tasks: AdminTaskItem[]; total: number; count: number; limit: number; offset: number } }>(
    `/api/v1/cgi-tasks/admin${query ? `?${query}` : ''}`
  );
}

export async function cancelTask(taskId: string) {
  return request(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' });
}

export async function recoverTask(taskId: string) {
  return request(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}/recover`, { method: 'POST' });
}

export async function retryTask(taskId: string) {
  return request(`/api/v1/cgi-tasks/${encodeURIComponent(taskId)}/retry`, { method: 'POST' });
}

// ---------- 管理员：系统统计（需 Admin 权限）----------
export interface DailyUsageItem {
  date: string;
  count: number;
}

export interface TopUserByUsage {
  userId: string;
  username: string;
  taskCount: number;
}

export interface AdminStatsData {
  userCount: number;
  taskCount: number;
  taskCountByStatus: Record<string, number>;
  taskCountByType: Record<string, number>;
  dailyUsage?: DailyUsageItem[];
  topUsersByUsage?: TopUserByUsage[];
}

export async function getAdminStats(params?: { days?: number; topLimit?: number }) {
  const q = new URLSearchParams();
  if (params?.days != null) q.set('days', String(params.days));
  if (params?.topLimit != null) q.set('topLimit', String(params.topLimit));
  const query = q.toString();
  return request<{ success?: boolean; data?: AdminStatsData }>(
    `/api/v1/system/admin/stats${query ? `?${query}` : ''}`
  );
}

// ---------- Admin：Provider 路由与监控（仅 Admin 可访问）----------
export type ProviderRoutingEntry = { provider: string; model: string; overridden?: boolean };
export type ProvidersRoutingResponse = { success?: boolean; data?: Record<string, ProviderRoutingEntry> };
export async function getProvidersRouting() {
  return request<ProvidersRoutingResponse>('/api/v1/system/admin/providers/routing');
}
export type ProvidersOptionsResponse = {
  success?: boolean;
  data?: {
    modelsByProvider?: Record<string, string[]>;
    modelsByProviderByScope?: Record<string, Record<string, string[]>>;
  };
};
export async function getProvidersOptions() {
  return request<ProvidersOptionsResponse>('/api/v1/system/admin/providers/options');
}
export async function postProvidersRouting(body: { logicalModel: string; provider: string; model: string }) {
  return request<{ success?: boolean; data?: unknown }>('/api/v1/system/admin/providers/routing', {
    method: 'POST',
    body,
  });
}
export async function deleteProvidersRouting(logicalModel: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/providers/routing?logicalModel=${encodeURIComponent(logicalModel)}`,
    { method: 'DELETE' }
  );
}
export interface ProviderStatsItem {
  provider: string;
  requestCount: number;
  successCount: number;
  errorRate: number;
  avgLatencyMs: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  window: string;
  errorDistribution?: Record<string, number>;
}
export async function getProvidersStats(params?: { provider?: string; window?: string }) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.window) q.set('window', params.window);
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderStatsItem[] }>(
    `/api/v1/system/admin/providers/stats${query ? `?${query}` : ''}`
  );
}
export interface ProviderBillingItem {
  provider: string;
  supported: boolean;
  totalLimit?: string | number;
  used?: string | number;
  resetAt?: string;
  manualBalance?: number;
  currency?: string;
}
export async function getProvidersBilling() {
  return request<{ success?: boolean; data?: ProviderBillingItem[] }>(
    '/api/v1/system/admin/providers/billing'
  );
}
export async function putProviderBalance(body: { provider: string; balance: number }) {
  return request<{ success?: boolean; data?: unknown }>(
    '/api/v1/system/admin/providers/balances',
    { method: 'PUT', body }
  );
}

// ---------- Admin：Provider 成本统计 ----------

export interface ProviderCostByProvider {
  provider: string;
  requestCount: number;
  totalTokens: number;
  imageCount: number;
  audioSeconds: number;
  videoSeconds: number;
  estimatedCost: number;
}

export interface ProviderCostByModel extends ProviderCostByProvider {
  model_key: string;
  chargeMode: string;
}

export async function getProvidersCosts(params?: { window?: string; groupBy?: 'provider' | 'model' }) {
  const q = new URLSearchParams();
  if (params?.window) q.set('window', params.window);
  if (params?.groupBy) q.set('groupBy', params.groupBy);
  const query = q.toString();
  return request<{
    success?: boolean;
    data?: Array<ProviderCostByProvider | ProviderCostByModel>;
    window?: string;
    groupBy?: 'provider' | 'model';
  }>(`/api/v1/system/admin/providers/costs${query ? `?${query}` : ''}`);
}

// ---------- Admin：账单（PPIO 等）----------

export interface PpioBill {
  userId: string;
  startTime: string;
  endTime: string;
  billingMethod: string;
  productName: string;
  category: string;
  ownerID: string;
  amount: string;
  voucherAmount: string;
  payAmount: string;
  payAmountDisplay?: number;
}

export interface PpioBillSummary {
  totalBills: number;
  totalAmount: string;
  totalPayAmount: string;
  totalVoucherAmount: string;
}

export interface PpioBillAccount {
  credit_balance: number;
  allow_features?: string[];
  free_trial?: unknown;
}

export interface SystemBillsResponse {
  ppio?: {
    bills?: PpioBill[];
    summary?: PpioBillSummary;
    account?: PpioBillAccount;
    error?: string;
  };
}

export async function getSystemBills(params?: {
  cycleType?: 'Hour' | 'Day' | 'Week' | 'Month';
  productCategory?: string;
  startTime?: number;
  endTime?: number;
}) {
  const q = new URLSearchParams();
  if (params?.cycleType) q.set('cycleType', params.cycleType);
  if (params?.productCategory) q.set('productCategory', params.productCategory);
  if (params?.startTime != null) q.set('startTime', String(params.startTime));
  if (params?.endTime != null) q.set('endTime', String(params.endTime));
  const query = q.toString();
  return request<{ success?: boolean; data?: SystemBillsResponse }>(
    `/api/v1/system/bills${query ? `?${query}` : ''}`,
  );
}

// ---------- Admin：Provider / 业务定价 ----------

export interface ProviderPricingRow {
  id: string;
  provider: string;
  scope: string;
  model_key: string;
  charge_mode: string;
  unit_price: number;
  currency: string;
  input_unit_price?: number | null;
  output_unit_price?: number | null;
  /** 平台向用户收取的 MXM-TOKEN 单价（per_image / per_request / per_second_* 时使用） */
  platform_unit_price?: number | null;
  /** token_based 模式：每千输入 token 收取的 MXM-TOKEN */
  platform_input_unit_price?: number | null;
  /** token_based 模式：每千输出 token 收取的 MXM-TOKEN */
  platform_output_unit_price?: number | null;
  /** 本次调用最低收取的 MXM-TOKEN（0 或 null 表示不设下限） */
  platform_min_charge?: number | null;
  metadata?: Record<string, unknown> | null;
}

export async function getProviderPricing(params?: { provider?: string; scope?: string }) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.scope) q.set('scope', params.scope);
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderPricingRow[] }>(
    `/api/v1/system/admin/pricing/provider${query ? `?${query}` : ''}`,
  );
}

export type UpsertProviderPricingBody = Partial<ProviderPricingRow> & {
  provider: string;
  scope: string;
  model_key: string;
  charge_mode: string;
  unit_price: number;
};

export async function upsertProviderPricing(body: UpsertProviderPricingBody) {
  return request<{ success?: boolean; data?: ProviderPricingRow }>(
    '/api/v1/system/admin/pricing/provider',
    { method: 'PUT', body },
  );
}

export async function deleteProviderPricing(id: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/pricing/provider/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

// ---------- Admin：Provider API Keys（增删改查）----------

// ---------- Admin：Provider API Keys（增删改查）----------
export type ProviderApiKeyMasked = {
  id: string;
  provider: string;
  service: string | null;
  key_masked: string;
  priority: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
};

export async function getProviderKeys(params?: { provider?: string; service?: string | null }) {
  const q = new URLSearchParams();
  if (params?.provider) q.set('provider', params.provider);
  if (params?.service !== undefined && params?.service !== null) q.set('service', params.service);
  const query = q.toString();
  return request<{ success?: boolean; data?: ProviderApiKeyMasked[] }>(
    `/api/v1/system/admin/providers/keys${query ? `?${query}` : ''}`
  );
}

export async function postProviderKey(body: {
  provider: string;
  service?: string | null;
  key_value: string;
  priority?: number;
}) {
  return request<{ success?: boolean; data?: ProviderApiKeyMasked }>(
    '/api/v1/system/admin/providers/keys',
    { method: 'POST', body }
  );
}

export async function putProviderKey(
  id: string,
  body: { priority?: number; is_active?: boolean }
) {
  return request<{ success?: boolean; data?: ProviderApiKeyMasked }>(
    `/api/v1/system/admin/providers/keys/${encodeURIComponent(id)}`,
    { method: 'PUT', body }
  );
}

export async function deleteProviderKey(id: string) {
  return request<{ success?: boolean }>(
    `/api/v1/system/admin/providers/keys/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

// ─────────────────────────────────────────────
// Wallet / Balance APIs  (mxmpay)
// ─────────────────────────────────────────────

export interface WalletItem {
  id: string;
  user_id: string;
  asset_code: string;
  available_balance: string;
  frozen_balance: string;
  created_at?: string;
  updated_at?: string;
}

export interface WalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  asset_code: string;
  type: 'deposit' | 'withdraw' | string;
  amount: string;
  balance_before: string;
  balance_after: string;
  reference_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
}

export async function getMyWallets() {
  return request<{ data: WalletItem[] }>('/api/v1/wallets/');
}

export async function getMyWallet(assetCode: string) {
  return request<{ data: WalletItem }>(`/api/v1/wallets/${encodeURIComponent(assetCode)}`);
}

export async function getMyWalletTransactions(assetCode: string, limit = 20) {
  return request<{ data: WalletTransaction[] }>(
    `/api/v1/wallets/${encodeURIComponent(assetCode)}/transactions?limit=${limit}`
  );
}

// ─────────────────────────────────────────────
// Admin wallet management
// ─────────────────────────────────────────────

export interface AdminWalletUser {
  userId: string;
  username?: string;
  wallets: WalletItem[];
}

/** Admin: list all user wallets (via system API) */
export async function adminListUserWallets(params?: { userId?: string; assetCode?: string }) {
  const qs = new URLSearchParams();
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.assetCode) qs.set('assetCode', params.assetCode);
  const q = qs.toString();
  return request<{ data: WalletItem[] }>(`/api/v1/system/admin/wallets${q ? `?${q}` : ''}`);
}

/** Admin: get a specific user's wallet */
export async function adminGetUserWallet(targetUserId: string, assetCode: string) {
  return request<{ data: WalletItem }>(
    `/api/v1/wallets/admin/${encodeURIComponent(targetUserId)}/${encodeURIComponent(assetCode)}`
  );
}

/** Admin: deposit MXM-TOKEN to a user's wallet */
export async function adminDepositToWallet(params: {
  userId: string;
  assetCode: string;
  amount: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}) {
  return request<{ data: WalletItem }>(
    `/api/v1/wallets/admin/${encodeURIComponent(params.userId)}/${encodeURIComponent(params.assetCode)}/deposit`,
    {
      method: 'POST',
      body: {
        amount: params.amount,
        referenceId: params.referenceId,
        metadata: params.metadata,
      },
    }
  );
}
