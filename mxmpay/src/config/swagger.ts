import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Web3 支付系统 API',
      version: '1.0.0',
      description: '基于 Express 构建的 Web3 支付系统后端 API 文档',
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: '本地开发服务器',
      },
    ],
    tags: [
      { name: '支付', description: '支付相关接口' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/api/**/*.ts'], // 从路由文件中读取 Swagger 注释
};

export function setupSwagger(app: Express): void {
  const specs = swaggerJsdoc(options);
  app.use('/api', swaggerUi.serve, swaggerUi.setup(specs, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'Web3 支付系统 API 文档',
  }));
}

