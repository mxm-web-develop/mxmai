export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export type AuthLevel = 'none' | 'jwt' | 'admin' | 'webhook';

export interface RouteDoc {
  /** Gateway 对外路径，如 /api/v1/account/login */
  path: string;
  method: HttpMethod;
  tag: string;
  summary: string;
  description?: string;
  auth: AuthLevel;
  /** 上游微服务 */
  upstream: string;
  deprecated?: boolean;
}

export interface OpenApiDocument {
  openapi: string;
  info: Record<string, unknown>;
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
}
