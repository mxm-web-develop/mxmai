# 写作表单与提示词拼接 — Admin 可配置方案

## 一、现状与问题

| 模块 | 当前做法 | 问题 |
|------|----------|------|
| **表单配置** | `clientServer/writing/*.ts` 写死字段、选项、_metadata | 改表单要发版，Admin 无法动态增删改字段/选项 |
| **参数列表** | `wtconfigs` 里 `getParamsForType()` / `getArticlesParamsForSubtype()` 写死 | 哪些参数参与「写作指导」写死，无法按运营需求调整顺序或隐藏 |
| **写作指导拼接** | `writing-service.ts` 里固定 `【写作指导】` + `label: value` + `⚠️ 关键要求` | 文案、格式、占位符都写死，无法做 A/B 或多语言策略 |
| **Rules / OutputFormat** | 已支持 DB：`prompts/resolver.ts` 优先 `prompt_engineering_config` | 仅 rules/output_format 走 DB，表单和拼接未接 DB |

目标：在**不破坏现有逻辑**的前提下，让 Admin 能通过**已有**的 `prompt_engineering_config` 表动态配置「表单 + 参与提示词的参数 + 写作指导文案与格式」，代码只做「DB 优先，无则回退代码」的解析层。

---

## 二、已有能力（可直接复用）

- **表**：`prompt_engineering_config`  
  - 已存在字段：`scope`, `type`, `subtype`, `rules_i18n`, `output_format_i18n`, **`form_options_i18n`**, **`extra`**, `is_active`。
- **Admin 接口**：`PUT /system/prompt-config` 已支持写入 `form_options_i18n`、`extra`。
- **解析**：`getWritingRulesAndFormatResolved(writingType, outlineType, lang)` 已实现「先 DB 再代码」的 rules/output_format。

因此只需：
1. 约定 `form_options_i18n`、`extra` 的**写作相关 schema**；
2. 在「表单解析」和「提示词拼接」两处增加「先 DB 再代码」的解析与使用。

---

## 三、表单可配置：`form_options_i18n`

### 3.1 约定：与现有 FormOptionsConfig 同构

当前 Writing 使用的结构（含中英）：

- 每个字段要么是 **选项数组**：`{ value, label, labelEn? }[]`
- 要么在 **`_metadata`** 里描述类型与展示：`type, label, labelEn, placeholder, placeholderEn, helpText, helpTextEn` 等

为便于 Admin 一次配置、双语言共用，约定 **DB 里存「带 label/labelEn 的同一套结构」**，运行时再按 `lang` 选 label 或 labelEn 生成当前语言的 FormOptionsConfig。这样与现有 `clientServer/writing/*.ts` 的形态一致，前端无需改协议。

**约定：`form_options_i18n` 的 JSON 形状 = 当前代码里的 FormOptionsConfig（含 _metadata，选项含 label + labelEn）**

- 即：`{ [fieldKey]: FormOption[] | [], _metadata: { [fieldKey]: FieldMetadata } }`
- 其中 `FormOption = { value, label, labelEn? }`，`FieldMetadata` 含 `label`、`labelEn`、`placeholder`、`placeholderEn`、`helpText`、`helpTextEn` 等。

### 3.2 解析流程（表单）

- **新函数**（建议放在 `prompts/resolver.ts` 或 `prompts/writing-form-resolver.ts`）  
  `getWritingFormOptionsResolved(writingType, outlineType?, lang): Promise<FormOptionsConfig | null>`
  1. 查 DB：`findByKey('writing', writingType, outlineType ?? null)`，若存在且 `is_active` 且 `form_options_i18n` 非空，则：
     - 对 `form_options_i18n` 做「按 lang 生成单语 FormOptionsConfig」：
       - 选项数组：每条取 `label` 或 `labelEn` 作为当前语言的 `label`；
       - `_metadata`：每条取 `label`/`labelEn`、`placeholder`/`placeholderEn`、`helpText`/`helpTextEn` 按 lang 选一列。
     - 返回该单语 FormOptionsConfig。
  2. 否则回退：`getWritingFormOptionsForType(writingType, lang, outlineType)`（当前 clientServer 实现）。

- **使用处**  
  - **GET /writing/getformOptions**：改为调 `getWritingFormOptionsResolved(writing_type, outline_type, lang)`，不再直接调 `getWritingFormOptionsForType`。  
  - **getParamLabel**：在「从表单配置取标签」时，优先用「当前已解析出的 FormOptionsConfig」；若该 FormOptionsConfig 来自 DB（即本次请求已通过 `getWritingFormOptionsResolved` 得到），则 getParamLabel 已能自然使用 DB 的 _metadata；若仍用代码回退的 formOptions，则行为与现在一致。  
  - 为保持 getParamLabel 与表单同源，建议 **getParamLabel 增加可选参数**：若调用方已解析到 formOptions，则传入，否则内部再调一次 `getWritingFormOptionsResolved`（注意异步，或由上层先 resolve 再同步 getParamLabel）。见下节「参数列表与 getParamLabel」。

### 3.3 Admin 编辑方式

- 在现有 Admin 的「提示词配置」编辑页中，对 `scope=writing`、`type=articles`（等）、`subtype=null` 或 `story-novel` 等，增加「表单配置」编辑区。
- 编辑对象即 `form_options_i18n`：可 JSON 编辑，或后续做可视化（按字段 key 编辑选项列表 + _metadata），保存时写入 `form_options_i18n`。
- 可为每个 (writingType, outlineType) 配置一份，与现有 type/subtype 一致（如 articles + tech-article / story-novel / academic-paper 各一条）。

---

## 四、参数列表可配置：`extra.param_keys`

### 4.1 约定

- 在 `prompt_engineering_config.extra` 中增加可选键：**`param_keys`**：`string[]`，表示「该 scope/type/subtype 下，参与写作指导的参数名列表（顺序即展示顺序）」。
- 若存在且为非空数组，则：
  - **获取参数列表**：`getWritingParamsForTypeWithSubtype(writingType, outlineType)` 优先返回 `extra.param_keys`（需在解析层从 DB 读 extra，见下）。
  - **提取业务参数**：`extractWritingBusinessParams` 使用的「允许的参数名集合」应与此一致，即只保留在 `param_keys` 中的 key。

若 DB 无该 type/subtype 或未配置 `param_keys`，则逻辑与现在一致：使用代码里 `getParamsForType()` / `getArticlesParamsForSubtype()` 的返回值。

### 4.2 解析流程（参数列表）

- **新函数**（可与表单解析同文件）  
  `getWritingParamKeysResolved(writingType, outlineType?): Promise<string[] | null>`  
  1. 查 DB：`findByKey('writing', writingType, outlineType ?? null)`，若存在且 `extra?.param_keys` 且为数组且长度 > 0，则返回 `extra.param_keys`。  
  2. 否则返回 `null`（表示用代码逻辑）。

- **使用处**  
  - 在 **writing-service** 中，凡调用 `getWritingParamsForTypeWithSubtype` 的地方，改为：
    - 先 `await getWritingParamKeysResolved(writingType, outlineType)`；
    - 若返回非 null，则用该数组作为「参数列表」；
    - 否则再调现有 `getWritingParamsForTypeWithSubtype(...)`。  
  - `extractWritingBusinessParams` 的「允许 key 集合」同样：若本次请求已解析出 param_keys，则只保留这些 key；否则用现有代码的列表。

这样 Admin 可通过在对应配置的 `extra.param_keys` 里调整顺序或删减参数，控制哪些参数进提示词以及顺序。

---

## 五、写作指导文案与格式可配置：`extra.guidance_*`

### 5.1 约定

在 `prompt_engineering_config.extra` 中增加可选键（均可选，缺省则用当前写死文案）：

| 键 | 类型 | 说明 |
|----|------|------|
| `guidance_intro_i18n` | `Record<string, string>` | 写作指导块的开头文案，如 `{ "zh": "【写作指导】（重要：...）", "en": "..." }` |
| `guidance_warning_i18n` | `Record<string, string>` | 结尾的「关键要求」文案；支持占位符 `{{param_list}}`，替换为当前语言下参数标签拼接（如「立场、语调、长度」或 "Stance, Tone, Length"） |
| `guidance_line_format` | `string` | 每一行的格式，默认 `"{{label}}: {{value}}"`；可改为如 `"- {{label}}: {{value}}"` |

拼接逻辑（伪代码）：

- `intro = extra.guidance_intro_i18n?.[lang] ?? 当前写死 intro`
- 对每个业务参数：`line = (extra.guidance_line_format ?? "{{label}}: {{value}}").replace("{{label}}", paramLabel).replace("{{value}}", displayValue)`
- `warning = (extra.guidance_warning_i18n?.[lang] ?? 当前写死 warning).replace("{{param_list}}", paramLabels.join(...))`
- 最终：`intro + "\n" + lines.join("\n") + "\n" + warning`

这样 Admin 可调「写作指导」的说明语气、多语言、以及是否带列表符号等，而不改代码。

### 5.2 解析与使用

- **新函数**（同上，与表单/参数列表一起）  
  `getWritingGuidanceTemplateResolved(writingType, outlineType?): Promise<GuidanceTemplate | null>`  
  - 从 DB 取对应行的 `extra`，若存在 `guidance_intro_i18n` / `guidance_warning_i18n` / `guidance_line_format`，则返回 `{ intro_i18n, warning_i18n, line_format }`，否则返回 null。

- **writing-service** 中，在拼「写作指导」的两处（无大纲的全局块、以及若有按章节的指导）：
  - 先 `await getWritingGuidanceTemplateResolved(...)`；
  - 若不为 null，用返回的 intro/line_format/warning 按上面规则拼接；
  - 否则保持现有字符串拼接。

---

## 六、getParamLabel 与「同源」

当前 `getParamLabel` 是同步的，且内部会调 `getWritingFormOptionsForType` 取 formOptions 再查 _metadata。若表单改为「先 DB 再代码」的异步解析，有两种做法：

**方案 A（推荐）**  
- 在 writing-service 里，在需要「参数列表 + 标签 + 表单」的地方（例如构建写作指导的那几处），**先统一做一次解析**：
  - `formOptions = await getWritingFormOptionsResolved(...)`
  - `paramKeys = await getWritingParamKeysResolved(...) ?? getWritingParamsForTypeWithSubtype(...)`
  - `guidanceTemplate = await getWritingGuidanceTemplateResolved(...)`
- 拼「写作指导」时：
  - 用 `paramKeys` 决定顺序和过滤；
  - 用 `formOptions._metadata` 取每个 key 的 label（即 getParamLabel 的逻辑内联，或提供同步的 `getParamLabelFromConfig(paramName, formOptions, lang)`）；
  - 用 `guidanceTemplate` 拼 intro/line/warning。
- **getParamLabel** 保留为「无 formOptions 时」的回退实现：内部仍用 `getWritingFormOptionsForType`（同步），用于未迁移到「先 resolve 再拼」的调用点。这样表单与标签在「已走 DB 的分支」里同源且一致。

**方案 B**  
- 将 getParamLabel 改为 async，所有调用点 await。改动面大，不优先。

建议采用 **方案 A**：在「构建写作指导」的主路径上统一用 DB 解析结果；getParamLabel 仅作兼容回退。

---

## 七、数据流小结

```
Admin 编辑 prompt_engineering_config
  - scope=writing, type=articles, subtype=story-novel
  - form_options_i18n: { stance: [...], _metadata: { stance: {...}, ... } }
  - extra: { param_keys: ["genre", "pov", "writing_style", ...], guidance_intro_i18n: {...}, guidance_warning_i18n: {...}, guidance_line_format: "{{label}}: {{value}}" }

前端 GET /writing/getformOptions?writing_type=articles&outline_type=story-novel&lang=zh
  → getWritingFormOptionsResolved("articles", "story-novel", "zh")
  → DB 有则用 form_options_i18n 按 lang 生成 FormOptionsConfig，否则回退 clientServer
  → 返回给前端渲染表单

用户提交写作任务，writing-service 构建 prompt
  → getWritingFormOptionsResolved / getWritingParamKeysResolved / getWritingGuidanceTemplateResolved（均先 DB 再代码）
  → 用 param_keys 过滤与排序业务参数
  → 用 formOptions._metadata 取每参数 label
  → 用 guidance_* 拼 intro / 每行 / warning
  → 拼进 generatePrompt
```

---

## 八、实现步骤建议

1. **prompts 解析层**  
   - 新增 `getWritingFormOptionsResolved(writingType, outlineType?, lang)`：DB 优先，回退 `getWritingFormOptionsForType`；实现「form_options_i18n → 按 lang 的单语 FormOptionsConfig」的转换。  
   - 新增 `getWritingParamKeysResolved(writingType, outlineType?)`：返回 `extra?.param_keys ?? null`。  
   - 新增 `getWritingGuidanceTemplateResolved(writingType, outlineType?)`：返回 `extra` 中的 guidance_* 或 null。

2. **routes/writing.ts**  
   - GET getformOptions：改为调用 `getWritingFormOptionsResolved`，并传入 `outline_type`。

3. **writing-service.ts**  
   - 在拼「写作指导」的两处（无大纲全局 + 若有章节级）：  
     - 先 await 上述三个 resolve；  
     - 若 param_keys 存在，用其过滤并排序 `extractWritingBusinessParams` 的结果；  
     - 若 formOptions 存在（来自 resolve），用其 _metadata 取 label，否则仍用 getParamLabel；  
     - 若 guidanceTemplate 存在，用 intro/line_format/warning 拼接，否则用当前写死字符串。

4. **extractWritingBusinessParams**  
   - 增加可选参数 `allowedKeys?: string[]`；若传入则只保留 allowedKeys 中的 key，否则行为与现在一致（用 getWritingParamsForTypeWithSubtype 的列表）。

5. **Admin 文档与校验**  
   - 在文档中说明 `form_options_i18n`、`extra.param_keys`、`extra.guidance_*` 的 schema 与示例；  
   - 可选：在 PUT /system/prompt-config 里对 `form_options_i18n` 做简单 JSON schema 校验，避免存错结构。

按上述步骤，表单、参数列表、写作指导文案与格式都可被 Admin 动态配置，且与现有代码回退路径兼容，无需一次性迁移所有类型。
