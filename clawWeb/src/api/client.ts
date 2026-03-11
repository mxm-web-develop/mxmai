const STORAGE_PREFIX = 'clawweb_';

const TOKEN_KEY = `${STORAGE_PREFIX}api_token`;
const USER_KEY = `${STORAGE_PREFIX}api_user`;

const getToken = (): string => {
  return localStorage.getItem(TOKEN_KEY) || '';
};

export function setToken(token: string) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    setStoredUser(null);
  }
}

export function getStoredToken(): string {
  return getToken();
}

export interface LoginUser {
  id: string;
  username: string;
  role?: 'user' | 'admin';
  [key: string]: unknown;
}

function setStoredUser(user: LoginUser | null) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function getStoredUser(): LoginUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as LoginUser) : null;
  } catch {
    return null;
  }
}

type ApiResponse<T> = { data?: T; error?: string; status: number };

export async function request<T = unknown>(
  path: string,
  options: RequestInit & { body?: unknown; params?: Record<string, any> } = {},
): Promise<ApiResponse<T>> {
  // 构建带查询参数的URL
  let url = path.startsWith('http')
    ? path
    : path.startsWith('/')
      ? path
      : `/${path}`;

  // 处理查询参数
  if (options.params && Object.keys(options.params).length > 0) {
    const queryParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => queryParams.append(key, String(v)));
        } else {
          queryParams.append(key, String(value));
        }
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const init: RequestInit = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object' && !isFormData) {
    (init as any).body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, init as any);
    const text = await res.text();

    let data: T | undefined;
    try {
      data = text ? (JSON.parse(text) as T) : undefined;
    } catch {
      data = text as unknown as T;
    }

    if (!res.ok) {
      const body = data as { message?: string; error?: string } | undefined;
      const errMsg = body?.message ?? body?.error ?? res.statusText;
      if (res.status === 401) {
        setToken('');
      }
      return { status: res.status, error: String(errMsg || '请求失败') };
    }

    return { status: res.status, data };
  } catch (e) {
    return {
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function login(username: string, password: string) {
  const res = await request<{
    data?: { tokens?: { accessToken: string }; user?: LoginUser };
  }>('/api/v1/account/login', {
    method: 'POST',
    body: { username, password },
  });

  if (res.error) {
    return { error: res.error };
  }

  const body = res.data as { data?: { tokens?: { accessToken: string }; user?: LoginUser } } | undefined;
  const inner = body?.data ?? (body as unknown as { tokens?: { accessToken: string }; user?: LoginUser } | undefined);
  const tokens = inner?.tokens;
  const user = inner?.user;

  if (tokens?.accessToken) {
    setToken(tokens.accessToken);
    if (user) setStoredUser(user);
    return { ok: true as const, accessToken: tokens.accessToken, user };
  }

  return { error: '登录响应中缺少 accessToken' };
}

