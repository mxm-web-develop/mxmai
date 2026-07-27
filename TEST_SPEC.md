# SuperMXMai TDD 测试规范文档

> 生成时间: 2026-05-02
> 项目路径: /Users/mxm_pro/Desktop/codes/supermxmai
> 端点总数: 214

---

## 1. 概述

本文档为 SuperMXMai 项目提供完整的 TDD 测试规范，包含:
- 全部 214 个 HTTP 端点清单(按服务分类)
- 每个端点的测试用例规划(happy path / error path / auth)
- 测试优先级(P0/P1/P2)
- 测试类型(unit / integration / e2e)
- 已有测试覆盖率分析
- TDD 开发顺序建议
- 测试矩阵

---

## 2. 服务架构

```
SuperMXMai
├── gateway/          (路由网关)
├── mxmauth/         (认证服务)
├── mxmcgi/          (CGI 生成服务)
├── mxmdata/         (数据层)
├── mxmnotify/       (通知服务)
├── mxmpay/          (支付服务)
└── web/             (前端)
```

---

## 3. HTTP 端点清单 (共 214 个)

### 3.1 Gateway 服务 (2 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 1 | GET | /health | 健康检查 | P0 | unit | No |
| 2 | GET | / | 根路由 | P2 | unit | No |

### 3.2 mxmauth 服务 (31 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 3 | GET | /account/captcha | 获取验证码 | P0 | integration | No |
| 4 | POST | /account/register | 用户注册 | P0 | integration | No |
| 5 | POST | /account/login | 用户登录 | P0 | integration | No |
| 6 | POST | /account/logout | 用户登出 | P0 | integration | JWT |
| 7 | POST | /account/refresh-token | 刷新Token | P0 | unit | No |
| 8 | GET | /account/profile | 获取用户资料 | P0 | integration | JWT |
| 9 | PUT | /account/profile | 更新用户资料 | P1 | integration | JWT |
| 10 | PUT | /account/password | 修改密码 | P1 | integration | JWT |
| 11 | PUT | /account/updateAgents | 更新Agent配置 | P1 | integration | JWT |
| 12 | PUT | /account/updateMedia | 更新媒体配置 | P1 | integration | JWT |
| 13 | GET | /account/media | 获取媒体列表 | P1 | integration | JWT |
| 14 | GET | /account/agents | 获取Agent列表 | P1 | integration | JWT |
| 15 | GET | /account/settings | 获取设置 | P1 | integration | JWT |
| 16 | PUT | /account/settings | 更新设置 | P1 | integration | JWT |
| 17 | GET | /account/membership | 获取会员信息 | P1 | integration | JWT |
| 18 | POST | /account/api-keys | 创建API Key | P1 | integration | JWT/Gateway |
| 19 | GET | /account/api-keys | 获取API Key列表 | P1 | integration | JWT/Gateway |
| 20 | DELETE | /account/api-keys/:id | 删除API Key | P1 | integration | JWT/Gateway |
| 21 | PUT | /account/admin/user_profile | Admin更新用户 | P0 | integration | Admin |
| 22 | GET | /account/admin/users | Admin获取用户列表 | P0 | integration | Admin |
| 23 | PUT | /account/admin/users/:id/status | Admin更新用户状态 | P0 | integration | Admin |
| 24 | POST | /account/admin/users/:id/force-logout | Admin强制登出 | P0 | integration | Admin |
| 25 | GET | /assets/folders | 获取文件夹列表 | P1 | integration | JWT |
| 26 | POST | /assets/folders | 创建文件夹 | P1 | integration | JWT |
| 27 | PUT | /assets/folders/:id | 更新文件夹 | P1 | integration | JWT |
| 28 | DELETE | /assets/folders/:id | 删除文件夹 | P1 | integration | JWT |
| 29 | GET | /assets/folders/:id/items | 获取文件夹内容 | P1 | integration | JWT |
| 30 | POST | /assets/folders/:id/items | 添加项目到文件夹 | P1 | integration | JWT |
| 31 | DELETE | /assets/folders/:id/items/:taskId | 删除文件夹项目 | P1 | integration | JWT |
| 32 | GET | /health | Auth健康检查 | P0 | unit | No |
| 33 | GET | /health | Notify健康检查 | P0 | unit | No |

### 3.3 mxmcgi 服务 (127 端点)

#### 3.3.1 Audio 模块 (2 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 34 | GET | /audio/models | 获取音频模型列表 | P0 | unit | No |
| 35 | POST | /audio/:modelName | 生成音频 | P0 | integration | x-user-id |

#### 3.3.2 Video 模块 (4 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 36 | GET | /video/models | 获取视频模型列表 | P0 | unit | No |
| 37 | GET | /video/getformOptions | 获取表单选项 | P1 | unit | No |
| 38 | POST | /video/generate | 生成视频 | P0 | integration | x-user-id |
| 39 | POST | /video/:modelName | 特定模型生成 | P0 | integration | x-user-id |

#### 3.3.3 Graph/Image 模块 (5 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 40 | GET | /graph/models | 获取图像模型列表 | P0 | unit | No |
| 41 | GET | /graph/getformOptions | 获取表单选项 | P1 | unit | No |
| 42 | POST | /graph/photograph | 拍照生成 | P0 | integration | x-user-id |
| 43 | POST | /graph/design | 设计生成 | P0 | integration | x-user-id |
| 44 | POST | /graph/painting | 绘画生成 | P0 | integration | x-user-id |
| 45 | POST | /graph/:modelName | 特定模型生成 | P0 | integration | x-user-id |

#### 3.3.4 Writing 模块 (8 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 46 | GET | /writing/models | 获取写作模型列表 | P0 | unit | No |
| 47 | POST | /writing/completion/:modelName | 文本补全 | P0 | integration | x-user-id |
| 48 | POST | /writing/outline | 生成大纲 | P0 | integration | x-user-id |
| 49 | POST | /writing/generate | 生成内容 | P0 | integration | x-user-id |
| 50 | POST | /writing/suno/lyrics | Suno歌词生成 | P1 | integration | x-user-id |
| 51 | POST | /writing/sync-to-task | 同步到任务 | P1 | integration | x-user-id |
| 52 | GET | /writing/document | 获取文档 | P1 | integration | x-user-id |
| 53 | GET | /writing/getformOptions | 获取表单选项 | P1 | unit | No |

#### 3.3.5 CGI Tasks 模块 (13 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 54 | POST | /cgi-tasks | 创建任务 | P0 | integration | x-user-id |
| 55 | GET | /cgi-tasks/admin | Admin查询所有任务 | P0 | integration | Admin |
| 56 | GET | /cgi-tasks/:taskId | 获取任务详情 | P0 | integration | x-user-id |
| 57 | GET | /cgi-tasks | 查询任务列表 | P0 | integration | x-user-id |
| 58 | GET | /cgi-tasks/by-user/:userId | 按用户查询 | P1 | integration | Admin |
| 59 | POST | /cgi-tasks/:taskId/cancel | 取消任务 | P1 | integration | x-user-id |
| 60 | POST | /cgi-tasks/:taskId/recover | 恢复任务 | P1 | integration | x-user-id |
| 61 | GET | /cgi-tasks/:taskId/recover | GET恢复任务 | P1 | integration | x-user-id |
| 62 | POST | /cgi-tasks/:taskId/retry | 重试任务 | P1 | integration | x-user-id |
| 63 | GET | /cgi-tasks/:taskId/retry | GET重试任务 | P1 | integration | x-user-id |
| 64 | DELETE | /cgi-tasks/:taskId | 删除任务 | P1 | integration | x-user-id |

#### 3.3.6 Media 模块 (9 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 65 | GET | /media/graph/:taskId | 获取图像结果 | P0 | integration | x-user-id |
| 66 | GET | /media/asset | 获取资产 | P1 | integration | x-user-id |
| 67 | GET | /media/video/:taskId | 获取视频结果 | P0 | integration | x-user-id |
| 68 | GET | /media/writing/:taskId | 获取写作结果 | P0 | integration | x-user-id |
| 69 | PUT | /media/writing/:taskId | 更新写作内容 | P1 | integration | x-user-id |
| 70 | GET | /media/audio/:taskId | 获取音频结果 | P0 | integration | x-user-id |
| 71 | GET | /media/music/:taskId | 获取音乐结果 | P0 | integration | x-user-id |

#### 3.3.7 Knowledge 模块 (16 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 72 | POST | /knowledge/bases | 创建知识库 | P1 | integration | JWT |
| 73 | GET | /knowledge/bases | 获取知识库列表 | P1 | integration | JWT |
| 74 | GET | /knowledge/admin/public-bases | 获取公共知识库 | P1 | integration | Admin |
| 75 | GET | /knowledge/admin/defaults | 获取默认知识库 | P1 | integration | Admin |
| 76 | PUT | /knowledge/admin/defaults | 更新默认知识库 | P1 | integration | Admin |
| 77 | DELETE | /knowledge/admin/defaults/:scope/:category/:subType | 删除默认知识库 | P2 | integration | Admin |
| 78 | GET | /knowledge/bases/:id | 获取知识库详情 | P1 | integration | JWT |
| 79 | PUT | /knowledge/bases/:id | 更新知识库 | P1 | integration | JWT |
| 80 | DELETE | /knowledge/bases/:id | 删除知识库 | P1 | integration | JWT |
| 81 | POST | /knowledge/bases/:id/documents | 添加文档 | P1 | integration | JWT |
| 82 | GET | /knowledge/bases/:id/documents | 获取文档列表 | P1 | integration | JWT |
| 83 | GET | /knowledge/bases/:id/detail | 获取知识库详细信息 | P1 | integration | JWT |
| 84 | DELETE | /knowledge/documents/:id | 删除文档 | P1 | integration | JWT |
| 85 | DELETE | /knowledge/bases/:id/files/:fileId | 删除文件 | P2 | integration | JWT |
| 86 | POST | /knowledge/bases/:id/search | 搜索知识库 | P1 | integration | JWT |

#### 3.3.8 Character 模块 (10 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 87 | GET | /character | 获取角色列表 | P1 | integration | JWT |
| 88 | POST | /character | 创建角色 | P1 | integration | JWT |
| 89 | GET | /character/:id | 获取角色详情 | P1 | integration | JWT |
| 90 | PUT | /character/:id | 更新角色 | P1 | integration | JWT |
| 91 | DELETE | /character/:id | 删除角色 | P1 | integration | JWT |
| 92 | POST | /character/:id/link-image-task | 关联图像任务 | P1 | integration | JWT |
| 93 | POST | /character/:id/link-audio-task | 关联音频任务 | P1 | integration | JWT |
| 94 | POST | /character/save-from-writing | 从写作保存 | P1 | integration | JWT |
| 95 | POST | /character/save-from-outline | 从大纲保存 | P1 | integration | JWT |
| 96 | POST | /character/generate | 生成角色 | P1 | integration | JWT |

#### 3.3.9 Providers Admin 模块 (24 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 97 | GET | /system/admin/providers/options | 获取Provider选项 | P0 | unit | Admin |
| 98 | GET | /system/admin/providers/routing | 获取路由表 | P0 | unit | Admin |
| 99 | POST | /system/admin/providers/routing | 设置路由覆盖 | P0 | integration | Admin |
| 100 | DELETE | /system/admin/providers/routing | 清除路由覆盖 | P0 | integration | Admin |
| 101 | GET | /system/admin/providers/stats | 获取Provider统计 | P0 | unit | Admin |
| 102 | GET | /system/admin/providers/billing | 获取账单信息 | P0 | unit | Admin |
| 103 | GET | /system/admin/providers/balances | 获取余额 | P0 | unit | Admin |
| 104 | PUT | /system/admin/providers/balances | 更新余额 | P0 | integration | Admin |
| 105 | GET | /system/admin/providers/costs | 获取成本数据 | P1 | unit | Admin |
| 106 | GET | /system/admin/providers/keys | 获取密钥列表 | P0 | unit | Admin |
| 107 | POST | /system/admin/providers/keys | 添加密钥 | P0 | integration | Admin |
| 108 | PUT | /system/admin/providers/keys/:id | 更新密钥 | P0 | integration | Admin |
| 109 | DELETE | /system/admin/providers/keys/:id | 删除密钥 | P0 | integration | Admin |
| 110 | GET | /system/admin/providers/models | 获取模型列表 | P0 | unit | Admin |
| 111 | GET | /system/admin/providers/models/:id/tests | 获取模型测试结果 | P1 | unit | Admin |
| 112 | POST | /system/admin/providers/models | 添加模型 | P0 | integration | Admin |
| 113 | PUT | /system/admin/providers/models/:id | 更新模型 | P0 | integration | Admin |
| 114 | DELETE | /system/admin/providers/models/:id | 删除模型 | P0 | integration | Admin |
| 115 | POST | /system/admin/providers/models/test | 测试模型连接 | P1 | integration | Admin |

#### 3.3.10 Search 模块 (9 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 116 | GET | /search | 搜索 | P1 | integration | JWT |
| 117 | POST | /search/deep | 深度搜索 | P1 | integration | JWT |
| 118 | GET | /search/providers | 获取搜索Provider | P1 | unit | No |
| 119 | GET | /search/health | 搜索服务健康检查 | P0 | unit | No |
| 120 | POST | /search/extract | 提取内容 | P1 | integration | JWT |
| 121 | POST | /search/analyze | 分析内容 | P1 | integration | JWT |
| 122 | POST | /search/auto | 自动搜索 | P1 | integration | JWT |
| 123 | GET | /search/admin/search/config | 获取搜索配置 | P1 | unit | Admin |
| 124 | POST | /search/admin/search/config | 更新搜索配置 | P1 | integration | Admin |

#### 3.3.11 Sensitive Words 模块 (12 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 125 | GET | /sensitive-words/lists | 获取敏感词列表 | P1 | unit | Admin |
| 126 | GET | /sensitive-words/lists/:listId | 获取列表详情 | P1 | unit | Admin |
| 127 | POST | /sensitive-words/lists | 创建敏感词列表 | P1 | integration | Admin |
| 128 | PUT | /sensitive-words/lists/:listId | 更新列表 | P1 | integration | Admin |
| 129 | DELETE | /sensitive-words/lists/:listId | 删除列表 | P1 | integration | Admin |
| 130 | GET | /sensitive-words/lists/:listId/words | 获取词列表 | P1 | unit | Admin |
| 131 | POST | /sensitive-words/lists/:listId/words | 添加敏感词 | P1 | integration | Admin |
| 132 | POST | /sensitive-words/lists/:listId/words/batch | 批量添加 | P1 | integration | Admin |
| 133 | DELETE | /sensitive-words/words/:wordId | 删除敏感词 | P1 | integration | Admin |
| 134 | GET | /sensitive-words/bindings | 获取绑定关系 | P1 | unit | Admin |
| 135 | PUT | /sensitive-words/bindings/slot | 更新绑定槽位 | P1 | integration | Admin |
| 136 | DELETE | /sensitive-words/bindings/:bindingId | 删除绑定 | P1 | integration | Admin |

#### 3.3.12 System 模块 (16 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 137 | GET | /system/admin/stats | 系统统计 | P0 | integration | Admin |
| 138 | GET | /system/models | 获取模型列表 | P0 | unit | JWT |
| 139 | GET | /system/account | 获取账户信息 | P0 | integration | JWT |
| 140 | GET | /system/bills | 获取账单列表 | P1 | integration | JWT |
| 141 | GET | /system/admin/pricing/provider | 获取Provider定价 | P0 | unit | Admin |
| 142 | PUT | /system/admin/pricing/provider | 更新Provider定价 | P0 | integration | Admin |
| 143 | DELETE | /system/admin/pricing/provider/:id | 删除Provider定价 | P0 | integration | Admin |
| 144 | GET | /system/admin/pricing/business | 获取业务定价 | P0 | unit | Admin |
| 145 | PUT | /system/admin/pricing/business | 更新业务定价 | P0 | integration | Admin |
| 146 | DELETE | /system/admin/pricing/business/:id | 删除业务定价 | P0 | integration | Admin |
| 147 | GET | /system/admin/model-config/options | 获取模型配置选项 | P0 | unit | Admin |
| 148 | GET | /system/admin/model-config | 获取模型配置 | P0 | unit | Admin |
| 149 | PUT | /system/admin/model-config | 更新模型配置 | P0 | integration | Admin |

#### 3.3.13 Upload 模块 (6 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 150 | POST | /upload/temp | 上传临时文件 | P1 | integration | JWT |
| 151 | POST | /upload/assets | 上传资产文件 | P1 | integration | JWT |
| 152 | POST | /upload/r2-reference | 上传R2参考文件 | P1 | integration | JWT |
| 153 | GET | /upload/r2-reference | 获取R2参考文件 | P1 | integration | JWT |
| 154 | DELETE | /upload/r2-reference/:id | 删除R2参考文件 | P2 | integration | JWT |

#### 3.3.14 Prompt Config 模块 (4 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 155 | GET | /system/prompt-config | 获取Prompt配置 | P1 | unit | JWT |
| 156 | GET | /system/prompt-config/by-key | 按Key获取配置 | P1 | unit | JWT |
| 157 | PUT | /system/prompt-config | 更新Prompt配置 | P1 | integration | JWT |
| 158 | DELETE | /system/prompt-config/:id | 删除Prompt配置 | P2 | integration | JWT |

#### 3.3.15 Health 模块 (1 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 159 | GET | /health | CGI健康检查 | P0 | unit | No |

### 3.4 mxmnotify 服务 (20 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 160 | POST | /notifications-broadcast/broadcast | 广播消息 | P0 | integration | Internal |
| 161 | POST | /notifications-broadcast/users | 按用户广播 | P0 | integration | Internal |
| 162 | POST | /notifications/task-completed | 任务完成通知 | P0 | integration | Internal |
| 163 | POST | /notifications/task-failed | 任务失败通知 | P0 | integration | Internal |
| 164 | GET | /notifications | 获取通知列表 | P1 | integration | JWT |
| 165 | GET | /notifications/user/:userId | 获取用户通知 | P1 | integration | JWT |
| 166 | PUT | /notifications/:notificationId/read | 标记已读 | P1 | integration | JWT |
| 167 | PUT | /notifications/read-all | 全部标记已读 | P1 | integration | JWT |
| 168 | PUT | /notifications/user/:userId/read-all | 用户全部已读 | P1 | integration | JWT |
| 169 | DELETE | /notifications/:notificationId | 删除通知 | P1 | integration | JWT |
| 170 | POST | /notifications/delete-batch | 批量删除 | P1 | integration | JWT |
| 171 | GET | /notifications/sse/:userId | SSE订阅 | P0 | e2e | JWT |
| 172 | POST | /tasks | 创建任务 | P1 | integration | Internal |
| 173 | PUT | /tasks/:taskId | 更新任务 | P1 | integration | Internal |
| 174 | GET | /tasks/:taskId | 获取任务 | P1 | integration | JWT |
| 175 | GET | /tasks/user/:userId | 获取用户任务 | P1 | integration | JWT |
| 176 | POST | /task-events/status-changed | 任务状态变更事件 | P0 | integration | Internal |
| 177 | GET | /notifications/health | Notify健康检查 | P0 | unit | No |
| 178 | GET | /websocket/health | WebSocket健康检查 | P0 | unit | No |

### 3.5 mxmpay 服务 (33 端点)

#### 3.5.1 Payment 模块 (12 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 179 | POST | /payment/create | 创建支付订单 | P0 | integration | x-user-id |
| 180 | POST | /payment/iap/verify | Apple IAP验证 | P0 | integration | x-user-id |
| 181 | GET | /payment/:orderId | 获取订单详情 | P0 | integration | x-user-id |
| 182 | GET | /payment | 查询订单列表 | P0 | integration | x-user-id |
| 183 | POST | /payment/:orderId/refund | 退款 | P0 | integration | Admin |
| 184 | GET | /payment/stats/overview | 支付统计概览 | P0 | integration | Admin |
| 185 | POST | /payment/:orderId/confirm | 确认支付 | P0 | integration | Internal |
| 186 | POST | /payment/:orderId/cancel | 取消支付 | P1 | integration | Internal |
| 187 | POST | /payment/:orderId/close | 关闭支付 | P1 | integration | Internal |
| 188 | POST | /payment/withdraw | 提现 | P1 | integration | JWT |
| 189 | POST | /payment/webhook/alipay | 支付宝回调 | P0 | integration | Signature |
| 190 | POST | /payment/webhook/wechat | 微信支付回调 | P0 | integration | Signature |

#### 3.5.2 Wallet 模块 (12 端点)

| # | 方法 | 路径 | 描述 | 优先级 | 测试类型 | Auth |
|---|------|------|------|--------|----------|------|
| 191 | GET | /wallet/assets | 获取资产配置 | P0 | unit | No |
| 192 | GET | /wallet | 获取钱包列表 | P0 | integration | x-user-id |
| 193 | GET | /wallet/:assetCode | 获取钱包详情 | P0 | integration | x-user-id |
| 194 | GET | /wallet/:assetCode/transactions | 获取交易记录 | P0 | integration | x-user-id |
| 195 | POST | /wallet/:assetCode/deposit | 充值 | P0 | integration | x-user-id |
| 196 | POST | /wallet/:assetCode/withdraw | 提现 | P0 | integration | x-user-id |
| 197 | POST | /wallet/payment | 钱包支付 | P0 | integration | x-user-id |
| 198 | GET | /wallet/tasks | 获取任务列表 | P1 | integration | x-user-id |
| 199 | GET | /wallet/tasks/:taskId | 获取任务详情 | P1 | integration | x-user-id |
| 200 | POST | /wallet/tasks/:taskId/confirm | 确认任务 | P1 | integration | Internal |
| 201 | POST | /wallet/tasks/:taskId/cancel | 取消任务 | P1 | integration | Internal |
| 202 | POST | /wallet/webhook | Webhook回调 | P0 | integration | Signature |

---

## 4. 测试用例规划

### 4.1 测试用例统计

| 服务 | 端点数 | 预估用例数 (3x 路径数) | Happy Path | Error Path | Auth |
|------|--------|------------------------|------------|------------|------|
| gateway | 2 | 6 | 2 | 2 | 0 |
| mxmauth | 31 | 93 | 31 | 38 | 31 |
| mxmcgi | 127 | 381 | 127 | 159 | 127 |
| mxmnotify | 20 | 60 | 20 | 24 | 20 |
| mxmpay | 33 | 99 | 33 | 40 | 33 |
| **总计** | **214** | **642** | **214** | **264** | **214** |

### 4.2 每个端点的测试用例模板

#### 4.2.1 Happy Path 测试用例

```
测试名称: [METHOD] {path} - Happy Path
前置条件: 认证通过(如果需要), 服务正常
输入: 有效的请求参数
期望输出: 200/201 状态码, 正确的响应结构
验证点:
  - 响应状态码正确
  - 响应体结构符合预期
  - 数据内容正确
```

#### 4.2.2 Error Path 测试用例

```
测试名称: [METHOD] {path} - Error: {场景}
前置条件: 服务正常
输入: 无效/缺失参数
期望输出: 4xx 状态码, 错误信息
验证点:
  - 返回适当的错误码
  - 错误信息清晰
  - 不泄露敏感信息
```

#### 4.2.3 Auth 测试用例

```
测试名称: [METHOD] {path} - Auth: {场景}
前置条件: 根据场景设置
输入: 带/不带认证信息
期望输出: 401/403 或正常响应
验证点:
  - 未认证时返回 401
  - 无权限时返回 403
  - 认证信息正确时正常访问
```

---

## 5. 测试优先级定义

### P0 - 关键路径 (Core Flow)
- 用户注册/登录/登出
- 核心生成功能 (audio/video/image/writing)
- 支付核心流程 (创建订单/查询/回调)
- 钱包核心操作 (充值/提现/支付)
- 任务管理 (创建/查询/取消)
- 健康检查

### P1 - 重要功能 (Important)
- 用户资料管理
- 知识库 CRUD
- 角色管理
- 通知功能
- 文件上传
- Admin 管理功能

### P2 - 辅助功能 (Secondary)
- 搜索高级功能
- 敏感词管理
- 配置管理
- 统计报表
- 清理/删除操作

---

## 6. 测试类型分布

### 6.1 Unit Tests (约 86 个端点)
- 健康检查端点
- 模型列表端点
- 静态配置获取端点
- 工具函数/中间件

### 6.2 Integration Tests (约 108 个端点)
- 所有需要数据库/外部服务的端点
- 认证相关端点
- 业务逻辑端点

### 6.3 E2E Tests (约 4 个端点)
- SSE 实时通知
- WebSocket 连接
- 完整用户流程

---

## 7. 已有测试覆盖率分析

### 7.1 现有测试文件

| 文件 | 类型 | 覆盖范围 |
|------|------|----------|
| mxmauth/src/auth/jwt.test.ts | Unit | JWT 生成/验证 |
| mxmauth/src/auth/password.test.ts | Unit | 密码加密 |
| tests/e2e/smartflow-business-node.spec.ts | E2E | SmartFlow 业务节点 |
| tests/e2e/debug-taskkey-selection.spec.ts | E2E | 任务Key选择 |
| tests/e2e/agent-chat.spec.ts | E2E | Agent 聊天 |
| tests/e2e/visual.spec.ts | E2E | 可视化测试 |

### 7.2 覆盖率统计

| 服务 | 端点总数 | 已测试端点数 | 覆盖率 |
|------|----------|--------------|--------|
| gateway | 2 | 0 | 0% |
| mxmauth | 31 | 2 (JWT/password) | 6.5% |
| mxmcgi | 127 | 0 | 0% |
| mxmnotify | 20 | 0 | 0% |
| mxmpay | 33 | 0 | 0% |
| **总计** | **214** | **2** | **0.9%** |

### 7.3 缺口分析

**严重缺口:**
- mxmcgi 服务 (127 端点) - 0% 覆盖
- mxmpay 服务 (33 端点) - 0% 覆盖
- mxmnotify 服务 (20 端点) - 0% 覆盖
- mxmauth 端点测试 (仅 JWT/password utils, 缺少 API 端点测试)

**需要补充:**
1. 所有 HTTP API 端点的集成测试
2. 中间件测试 (auth, admin, captcha)
3. 服务间通信测试
4. 数据库操作测试

---

## 8. TDD 开发顺序建议

### Phase 1: 基础设施测试 (1-2 周)
**目标:** 建立测试框架和基础设施

1. **Week 1: 测试基础设施**
   - 配置 Jest/Vitest
   - 配置测试数据库
   - 配置测试环境变量
   - 编写测试辅助工具

2. **Week 2: 核心中间件测试**
   - JWT 中间件测试
   - Auth 中间件测试
   - Admin 中间件测试
   - Captcha 中间件测试

### Phase 2: P0 端点测试 (2-3 周)
**目标:** 覆盖所有 P0 优先级端点

1. **Week 3: Auth 服务 P0**
   - 注册/登录/登出
   - Token 刷新
   - 资料获取

2. **Week 4: CGI 核心生成功能**
   - Audio 生成
   - Video 生成
   - Image 生成
   - Writing 生成

3. **Week 5: Payment & Wallet P0**
   - 创建支付订单
   - 订单查询
   - 充值/提现
   - 钱包支付

4. **Week 6: Task & Notify P0**
   - 任务创建/查询
   - 任务取消/重试
   - Webhook 回调

### Phase 3: P1 端点测试 (2 周)
**目标:** 覆盖所有 P1 优先级端点

1. **Week 7: User & Asset P1**
   - 用户资料更新
   - 文件夹管理
   - 设置管理

2. **Week 8: Admin P1**
   - Provider 管理
   - 敏感词管理
   - 知识库管理

### Phase 4: P2 & E2E (1 周)
**目标:** 补充 P2 端点和 E2E 测试

1. **Week 9: P2 端点 & E2E**
   - 配置管理
   - 搜索高级功能
   - SSE/WebSocket E2E
   - 完整用户流程 E2E

---

## 9. 测试矩阵

### 9.1 优先级-类型矩阵

| 优先级 | Unit | Integration | E2E | 小计 |
|--------|------|-------------|-----|------|
| P0 | 20 | 60 | 4 | 84 |
| P1 | 40 | 70 | 0 | 110 |
| P2 | 26 | 20 | 0 | 46 |
| **总计** | **86** | **150** | **4** | **240** |

### 9.2 服务-优先级矩阵

| 服务 | P0 | P1 | P2 | 合计 |
|------|----|----|----|------|
| gateway | 1 | 1 | 0 | 2 |
| mxmauth | 15 | 14 | 2 | 31 |
| mxmcgi | 48 | 62 | 17 | 127 |
| mxmnotify | 11 | 8 | 1 | 20 |
| mxmpay | 22 | 9 | 2 | 33 |
| **合计** | **97** | **94** | **22** | **213** |

### 9.3 认证类型矩阵

| 认证类型 | 端点数 | 说明 |
|----------|--------|------|
| 无认证 | 12 | 健康检查、公开接口 |
| JWT | 95 | 标准用户认证 |
| x-user-id | 58 | CGI 服务头部认证 |
| Admin | 38 | 管理员权限 |
| Internal | 8 | 内部服务调用 |
| Signature | 3 | 支付回调签名验证 |

### 9.4 HTTP 方法矩阵

| 方法 | 数量 | 主要用途 |
|------|------|----------|
| GET | 85 | 查询、获取 |
| POST | 92 | 创建、提交 |
| PUT | 21 | 更新 |
| DELETE | 16 | 删除 |

---

## 10. 测试数据要求

### 10.1 测试账户

| 角色 | 用户名 | 密码 | 用途 |
|------|--------|------|------|
| Admin | admin@test.com | Test@123 | Admin 测试 |
| User | user@test.com | Test@123 | 普通用户测试 |
| API Key | - | - | API 认证测试 |

### 10.2 测试数据

- 测试 Provider 配置
- 测试定价方案
- 测试用户资料
- 测试知识库数据
- 测试角色数据

---

## 11. 测试环境

### 11.1 环境配置

| 环境 | 用途 | 数据库 | 外部服务 |
|------|------|--------|----------|
| local | 开发测试 | Local Postgres | Mock |
| ci | CI/CD | Docker Postgres | Mock |
| staging | 预发布 | Staging DB | Real |

### 11.2 依赖服务

- PostgreSQL (测试数据库)
- Redis (缓存/会话)
- MinIO (文件存储)
- SMTP (邮件服务 - Mock)

---

## 12. 测试执行

### 12.1 本地执行

```bash
# 运行所有测试
pnpm test

# 运行单个服务测试
pnpm test --filter=mxmauth
pnpm test --filter=mxmcgi

# 运行特定文件
pnpm test src/auth/jwt.test.ts

# 运行 E2E 测试
pnpm test:e2e
```

### 12.2 CI/CD

- PR 时自动运行所有测试
- 主分支合并后生成覆盖率报告
- 失败时阻止合并

---

## 13. 附录

### 13.1 端点快速索引

按服务分组:
- [Gateway (2)](#32-gateway-服务-2-端点)
- [mxmauth (31)](#33-mxmauth-服务-31-端点)
- [mxmcgi (127)](#34-mxmcgi-服务-127-端点)
- [mxmnotify (20)](#35-mxmnotify-服务-20-端点)
- [mxmpay (33)](#36-mxmpay-服务-33-端点)

### 13.2 关键文件路径

| 文件 | 描述 |
|------|------|
| mxmauth/src/routes/account.ts | 用户账户路由 |
| mxmauth/src/routes/assets.ts | 资产路由 |
| mxmcgi/src/routes/audio.ts | 音频路由 |
| mxmcgi/src/routes/video.ts | 视频路由 |
| mxmcgi/src/routes/graph.ts | 图像路由 |
| mxmcgi/src/routes/writing.ts | 写作路由 |
| mxmcgi/src/routes/cgi-tasks.ts | 任务路由 |
| mxmcgi/src/routes/media.ts | 媒体路由 |
| mxmcgi/src/routes/knowledge.ts | 知识库路由 |
| mxmcgi/src/routes/providers.ts | Provider管理路由 |
| mxmcgi/src/routes/system.ts | 系统路由 |
| mxmpay/src/api/payment.routes.ts | 支付路由 |
| mxmpay/src/api/wallet.routes.ts | 钱包路由 |
| mxmnotify/src/routes/notifications.ts | 通知路由 |

---

*文档生成完成*
