# 项目文档中心

本目录集中管理所有模块的文档，方便部署和维护查阅。

## 目录结构

```
docs/
├── shared/           # 跨模块共享文档（项目介绍、架构、CLAUDE.md）
├── mxmcgi/           # AI 内容生成服务文档
│   ├── api/          # API 接口文档
│   ├── guides/       # 开发指南
│   ├── knowledge/    # 知识库文档
│   ├── smartflow/    # Smartflow 工作流文档
│   └── task/         # 任务系统文档
├── mxmdata/          # 数据访问层文档
├── mxmpay/           # 支付服务文档
├── mxmnotify/        # 通知服务文档
├── mxmauth/          # 认证服务文档
├── gateway/          # 网关文档
└── *.md              # 项目级文档（API、计费、搜索架构等）
```

## 核心文档索引

| 文档 | 说明 |
|------|------|
| shared/CLAUDE.md | 项目全局开发规范 |
| shared/PORTS.md | 服务端口映射 |
| mxmcgi/guides/SETUP_DATABASE.md | 数据库初始化 |
| mxmcgi/api/ | 各模块 API 文档 |
| mxmdata/ | 数据层架构与迁移 |
| shared/PRICING_SETUP_GUIDE.md | 定价配置指南 |
