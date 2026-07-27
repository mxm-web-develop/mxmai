import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from './build-spec';

let cachedSpec: ReturnType<typeof buildOpenApiSpec> | null = null;

function getSpec() {
  if (!cachedSpec) {
    cachedSpec = buildOpenApiSpec();
  }
  return cachedSpec;
}

/** 刷新缓存（开发时若更新了 catalog 可调用） */
export function refreshOpenApiSpec(): void {
  cachedSpec = null;
}

/**
 * 挂载 OpenAPI 文档：
 * - GET /openapi.json  — 原始 OpenAPI 3.0 JSON
 * - GET /docs          — Swagger UI
 */
export function setupOpenApiDocs(app: Express): void {
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/json');
    res.send(JSON.stringify(getSpec()));
  });

  const swaggerOptions = {
    explorer: true,
    persistAuthorization: true,
    docExpansion: 'list' as const,
    filter: true,
    showExtensions: true,
    syntaxHighlight: { theme: 'monokai' as const },
  };

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(getSpec(), {
      swaggerOptions,
      customSiteTitle: 'SuperMXMai Gateway API',
      customCss: '.swagger-ui .topbar { display: none }',
    })
  );

  // 兼容常见路径别名
  app.get('/swagger', (_req, res) => res.redirect(301, '/docs'));
  app.get('/api-docs', (_req, res) => res.redirect(301, '/docs'));
}
