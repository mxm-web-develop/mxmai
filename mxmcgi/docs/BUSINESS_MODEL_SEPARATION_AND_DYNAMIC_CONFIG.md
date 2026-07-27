# 业务与模型分离 & 动态配置说明

## 当前设计：业务与模型已分离

### 1. 分层关系

```
┌─────────────────────────────────────────────────────────────────┐
│  业务层 (core/)                                                  │
│  writing-service, graph-service, routes/*                        │
│  - 只关心：用哪个 scope + modelKey，传什么 params                │
│  - 通过 registry.getModel(provider, scope, modelKey) 取定义      │
│  - 调用 def.generate(params, ctx)，不关心底层 API 怎么调        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  模型层 (models/)                                                │
│  - registry：内存注册表，getModel / getModelsByKey / listModels  │
│  - DB provider_models：provider + model_key + upstream_model（Admin）│
│  - models/{provider}/{scope}/*.ts：各模型 registerModel()       │
│    只做一件事：generate 时调 providerFactory.getProviderForModel │
│    → provider.generate(modelKey, params)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  Provider 层 (core/providers/)                                  │
│  - 根据 provider_models（catalog）决定本 provider 支持哪些 modelKey │
│  - 实际请求上游 API（Deer/Replicate/Official 等）               │
└─────────────────────────────────────────────────────────────────┘
```

- **业务**：不依赖具体 provider、不写死模型实现，只依赖「scope + modelKey + generate(params)」。
- **模型**：不包含业务规则，只负责「把 params 转交给对应 provider 的 modelKey」。

因此从架构上已经做到**业务与模型分离**。

### 2. 业务侧调用方式（以 writing 为例）

- `selectModel(taskType)`：按任务类型得到「当前要用的 modelKey」（如 `gemini-3-pro`）。
- `provider = providerFactory.getProviderForModel(modelName, providerOverride)`：得到该 modelKey 由哪个 provider 提供。
- `def = getModel(prov.provider, 'writing', modelName)`：从注册表取该 provider 下、writing scope、该 modelKey 的定义。
- `def.generate(params, ctx)`：执行生成，业务不关心内部是 HTTP 还是 WebSocket、哪个 API。

其他 scope（graph / audio / video）同理：业务只依赖 registry + provider 的抽象接口。

---

## 已具备的“动态”能力

| 能力 | 说明 |
|------|------|
| **Provider 选择** | `DEFAULT_PROVIDER` 环境变量、请求里 `providerOverride`、或 `getProviderForModel` 结合已注册模型与 `provider_models` 选择。 |
| **逻辑模型路由（业务侧）** | 各 scope 的 `*_scope_config`（Supabase）为运行时主源；Admin「模型与定价」保存时同步 `setRoutingOverride` 供进程内读取。`model-routing.ts` 的 `defaultRouting` 为空表，勿再依赖代码内默认映射。 |
| **API Key** | `getFirstProviderKey()` 优先从 DB 读，再回退 .env，便于运维动态配置 key。 |

---

## 若要“完全动态配置”可做的扩展

当前仍写在代码里的配置，若希望都改为可配置（DB/配置中心/Admin 界面），可以按下面方向做。

### 1. 写作候选模型列表（outline/paragraph/full）

- **现状**：`core/writing/wtconfigs/writing-models.ts` 里写死 `WRITING_MODEL_SELECTION`（outline/paragraph/full 各对应一个 modelKey 数组）。
- **动态化**：把该结构放到配置表或配置服务，启动或定时拉取；`model-selector` 改为从配置读取候选列表再 `selectModel`。业务逻辑不变，只是数据源从代码改为配置。

### 2. 物理模型目录与定价（已实现 DB 化）

- **现状**：`provider_models` 存启用模型与 `upstream_model`；`provider_pricing` 存成本价与计费模式；服务启动 `loadProviderModelCatalog()`。
- **运维**：新增/下架模型、改上游名在 Admin「物理模型」；调价在「模型价格管理」或 SQL。

### 3. 逻辑模型 → provider + 物理模型（model-routing）

- **现状**：`defaultRouting` 在代码里，覆盖在内存（`overrides`）。
- **动态化**：默认路由也进 DB/配置；`getResolvedRouting` 先查 DB 再回退代码默认值。这样「业务用哪个逻辑名、背后走哪个 provider 和哪个 model」都可运维配置。

### 4. 可选：纯配置驱动的新模型

- **现状**：每增加一个 modelKey 就要在 `models/{provider}/{scope}/` 下加一个 TS 文件并 `registerModel`。
- **动态化（可选演进）**：  
  - 若 `provider_models` + 元数据已足够描述通用调用，可为一个 scope 提供**通用 model 定义**：按 (provider, modelKey) 调用 `provider.generate(modelKey, params)` 并统一映射结果。  
  - 这样部分场景可少写重复 TS 文件，仍以安全与可观测性为前提。

---

## 业务接口统一规范（细分配置）

为实现 **Admin 对细分业务接口配置/切换不同 provider 与模型**，已单独约定「业务接口 key」与统一解析/调用方式，详见：

- **[业务接口统一规范 (BUSINESS_INTERFACE_SPEC.md)](./BUSINESS_INTERFACE_SPEC.md)**  
  - 业务接口 key 清单（writing / graph / audio / video / text）  
  - 统一解析：业务 key → (provider, model, scope)  
  - 统一调用链：getResolvedRouting → getModel → generate  
  - 与提示词工程的衔接  

落地时需让各业务（writing、graph、audio、video）统一走该规范，并保证 model-routing 的 key 与文档一致。

---

## 小结

- **是的，按当前设计业务和模型已经分开**：业务只依赖 registry 的 `getModel`/`getModelsByKey` 和 `def.generate()`，模型层只负责按 provider + modelKey 转发并适配结果。
- **已经具备一部分动态配置**：provider 选择、逻辑路由覆盖（内存）、API Key 来源。
- **若要进一步动态化**：把「写作候选列表、model-routing 默认表」等仍写死在代码里的部分迁到配置/DB，并可选增加通用模型定义，即可减少改代码频率。
- **业务接口统一**：按 [BUSINESS_INTERFACE_SPEC.md](./BUSINESS_INTERFACE_SPEC.md) 收口业务 key 与调用方式，便于 Admin 对细分业务做 provider/模型配置与后续提示词管理。
