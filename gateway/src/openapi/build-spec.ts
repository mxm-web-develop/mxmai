import { GATEWAY_ROUTE_CATALOG, OPENAPI_TAGS } from './catalog';
import type { AuthLevel, OpenApiDocument, RouteDoc } from './types';

function gatewayBaseUrl(): string {
  const port = Number(process.env.GATEWAY_PORT || process.env.PORT || 3000);
  const publicUrl = process.env.GATEWAY_PUBLIC_URL?.replace(/\/$/, '');
  if (publicUrl) return publicUrl;
  return `http://localhost:${port}`;
}

function securityForAuth(auth: AuthLevel): Array<Record<string, string[]>> | undefined {
  switch (auth) {
    case 'jwt':
    case 'admin':
      return [{ bearerAuth: [] }];
    case 'none':
    case 'webhook':
      return undefined;
    default:
      return undefined;
  }
}

function buildParameters(path: string): Array<Record<string, unknown>> {
  const params: Array<Record<string, unknown>> = [];
  const segments = path.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg.startsWith('{') && seg.endsWith('}')) {
      const name = seg.slice(1, -1);
      params.push({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: name,
      });
    }
  }
  return params;
}

function buildOperation(route: RouteDoc): Record<string, unknown> {
  const op: Record<string, unknown> = {
    tags: [route.tag],
    summary: route.summary,
    operationId: `${route.method}_${route.path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
    responses: {
      '200': {
        description: '成功',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ApiResponse' },
          },
        },
      },
      '400': { description: '请求参数错误' },
      '401': { description: '未认证或 Token 无效' },
      '403': { description: '无权限' },
      '404': { description: '资源不存在' },
      '502': { description: '上游服务不可用（Gateway 代理错误）' },
    },
    'x-upstream': route.upstream,
    'x-auth': route.auth,
  };

  if (route.description) {
    op.description = route.description;
  }
  if (route.deprecated) {
    op.deprecated = true;
  }

  const security = securityForAuth(route.auth);
  if (security) {
    op.security = security;
  }

  const parameters = buildParameters(route.path);
  if (parameters.length > 0) {
    op.parameters = parameters;
  }

  if (['post', 'put', 'patch'].includes(route.method)) {
    op.requestBody = {
      required: route.auth !== 'webhook',
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true },
        },
      },
    };
  }

  if (route.tag === 'WebSocket') {
    op.responses = {
      '101': { description: 'Switching Protocols — WebSocket 升级成功' },
      '401': { description: '未认证' },
      '502': { description: '上游 WebSocket 代理失败' },
    };
    delete op.requestBody;
  }

  if (route.auth === 'admin') {
    op.description = [route.description, '需要 admin 角色或 ADMIN_TOKEN。'].filter(Boolean).join('\n\n');
  }

  return op;
}

export function buildOpenApiSpec(): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of GATEWAY_ROUTE_CATALOG) {
    if (!paths[route.path]) {
      paths[route.path] = {};
    }
    paths[route.path][route.method] = buildOperation(route);
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'SuperMXMai Gateway API',
      version: '1.0.0',
      description: [
        'SuperMXMai 统一 API 网关对外接口文档。',
        '',
        '所有客户端应通过 Gateway 访问后端微服务。认证方式：',
        '- **JWT**：`Authorization: Bearer <access_token>`（登录或 refresh-token 获取）',
        '- **Personal API Key**：同上，Bearer 前缀 + Key 字符串',
        '- **Partner Integration Key**：Bearer + Integration Key（部分路径受限）',
        '',
        `共收录 **${GATEWAY_ROUTE_CATALOG.length}** 条路由。详细参数见各微服务实现或 \`docs/API.md\`。`,
        '',
        '上游服务：mxmauth (4001) · mxmpay (4002) · mxmcgi (4003) · mxmnotify (4005)',
      ].join('\n'),
      contact: { name: 'SuperMXMai' },
    },
    servers: [
      { url: gatewayBaseUrl(), description: 'Gateway 统一入口' },
    ],
    tags: OPENAPI_TAGS,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT or API Key',
          description: 'JWT Access Token 或个人/Integration API Key',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', additionalProperties: true },
            message: { type: 'string' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        },
        ProxyError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'PROXY_ERROR' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
}
