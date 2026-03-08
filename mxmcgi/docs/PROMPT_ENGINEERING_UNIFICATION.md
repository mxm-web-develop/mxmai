# 提示词工程结构与流程统一化分析

本文档分析 **Writing / Graph / Video / Audio** 四类业务的提示词工程现状，并给出**可统一的结构与流程**方案。

---

## 一、现状对比

### 1.1 数据层（已统一）

| 项目     | 说明 |
|----------|------|
| 表       | `prompt_engineering_config`（单表） |
| 唯一键   | `(scope, type, subtype)` |
| 字段     | `rules_i18n`、`output_format_i18n`、`form_options_i18n`、`extra`、`is_active` |
| Writing  | scope=writing, type=writingType, subtype=outlineType（可为 null） |
| Graph    | scope=graph, type=graphType, subtype=type（如 portrait、cinematic） |
| Video    | 未使用 |
| Audio    | 未使用 |

结论：**存储结构已经统一**，所有业务都可以用同一张表、同一套 (scope, type, subtype) 标识。

---

### 1.2 解析层（未统一）

| 业务    | 当前 API | 返回 | 回退来源 |
|---------|-----------|------|----------|
| Writing | `getWritingRulesAndFormatResolved(writingType, outlineType, lang)` | `{ rules, outputFormat }` | wtconfigs：getWritingTypeRules / getWritingTypeOutputFormat |
| Graph   | `getGraphRulesResolved(graphType, type, lang)` | `string`（仅 rules） | graphconfigs：getGraphRulesForType |
| Video   | 无 | - | - |
| Audio   | 无 | - | - |

差异点：

- **接口不统一**：Writing 用「写作专用」API 且返回 rules + outputFormat；Graph 用「图文专用」API 且只返回 rules（DB 里其实也有 output_format_i18n，只是代码未用）。
- **参数形式不统一**：Writing 是 (writingType, outlineType)，Graph 是 (graphType, type)，本质都是 (scope 下的 type, subtype)。
- **回退逻辑分散**：分别依赖 core/writing/wtconfigs 和 core/graph/graphconfigs，没有「按 scope 选回退」的同一入口。

---

### 1.3 拼接层（结构相似、实现分散）

| 业务    | 概念顺序 | 实际实现位置 |
|---------|----------|--------------|
| Writing | rules → 细分/段落/角色/知识库 → 用户要求 → outputFormat → 固定要求 | writing-service 内多处 sectionPrompt 拼接 |
| Graph   | rules → 知识库 → 业务参数 → 用户需求 → 输出要求（语言+格式） | graph-service：buildPromptGenerationRequest |
| Video   | 无（仅用户 prompt 直传） | video-service 不拼规则 |
| Audio   | 无 | 各模型直传 |

共同点：

- **都是「规则在前、用户输入在后、可选输出格式/要求在后」**。
- 中间段（知识库、业务参数、段落信息等）按业务不同而不同，但可以抽象成「可插拔的中间块」。

---

## 二、统一化目标

1. **解析层**：所有业务共用一个「按业务 key 解析提示词配置」的 API，返回形状一致（rules + outputFormat），便于后续统一组装。
2. **拼接层**：抽象出一套通用的「模板」：**rules + [可选中间块] + userInput + outputFormat + [可选固定尾巴]**，各业务只填自己的「中间块」和「回退实现」。
3. **扩展**：Video / Audio 若要做提示词工程，只需接入同一套解析 + 同一张表，不必再造一套结构。

---

## 三、统一方案

### 3.1 统一解析 API（prompts/resolver）

**建议：单一入口，统一返回形状。**

```ts
// 业务 key 的通用表示（与 DB 的 scope/type/subtype 对应）
export type PromptConfigKey = {
  scope: 'writing' | 'graph' | 'video' | 'audio';
  type: string;   // writingType | graphType | videoMode | audioType
  subtype?: string | null;
};

/**
 * 统一解析：先 DB，再按 scope 回退代码。
 * 所有业务都返回 { rules, outputFormat }，未使用的字段可为空串。
 */
export async function getPromptConfigResolved(
  key: PromptConfigKey,
  lang: string = 'zh'
): Promise<{ rules: string; outputFormat: string }> {
  const { scope, type, subtype } = key;
  try {
    const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
    const row = await repo.findByKey(scope, type, subtype ?? null);
    if (row?.is_active) {
      const rules = langFallback(row.rules_i18n, lang);
      const outputFormat = langFallback(row.output_format_i18n, lang);
      return { rules: rules || '', outputFormat: outputFormat || '' };
    }
  } catch (_) {}
  // 按 scope 回退到代码配置
  return getFallbackPromptConfig(scope, type, subtype, lang);
}

function getFallbackPromptConfig(
  scope: string,
  type: string,
  subtype: string | null,
  _lang: string
): { rules: string; outputFormat: string } {
  if (scope === 'writing') {
    return {
      rules: getWritingTypeRules(type as any),
      outputFormat: getWritingTypeOutputFormat(type as any),
    };
  }
  if (scope === 'graph') {
    return {
      rules: getGraphRulesForType(type, subtype || ''),
      outputFormat: '', // graph 当前不用，可后续在 graphconfigs 中提供
    };
  }
  if (scope === 'video' || scope === 'audio') {
    return { rules: '', outputFormat: '' }; // 暂无代码回退
  }
  return { rules: '', outputFormat: '' };
}
```

**兼容旧调用：**

- 保留 `getWritingRulesAndFormatResolved(writingType, outlineType, lang)`，内部改为调用 `getPromptConfigResolved({ scope: 'writing', type: writingType, subtype: outlineType ?? null }, lang)`。
- 保留 `getGraphRulesResolved(graphType, type, lang)`，内部改为 `getPromptConfigResolved({ scope: 'graph', type: graphType, subtype: type || null }, lang).then(r => r.rules)`。

这样 **解析层** 在「数据来源 + 返回形状」上就统一了，Writing/Graph 行为不变，Video/Audio 将来只需在 `getFallbackPromptConfig` 里加分支即可。

---

### 3.2 统一拼接模板（概念）

把「最终发给模型的 prompt」抽象成同一结构，便于各业务复用逻辑（或至少统一文档与约定）：

```
[PREFIX]
  rules（必选，来自 getPromptConfigResolved）
  可选：subtypeRules / rhythmRules / 角色与 cast 等（业务自定义）

[MIDDLE]（业务自定义块，可多段）
  知识库、业务参数、段落标题、写作指导、前文记忆等

[USER_INPUT]
  用户主 prompt / effectiveUserPrompt / chunk.prompt

[SUFFIX]
  outputFormat（可选，来自 getPromptConfigResolved）
  可选：固定输出要求（语言、格式、禁止项等）
```

- **Writing**：PREFIX = typeRules + subtypeRules + …；MIDDLE = 段落标题 + 写作指导 + 前文记忆 + 知识库；USER_INPUT = enhancedPrompt；SUFFIX = typeOutputFormat + 重要要求。
- **Graph（给文本模型）**：PREFIX = rules；MIDDLE = 知识库 + 业务参数；USER_INPUT = effectiveUserPrompt；SUFFIX = 输出语言 + 「只输出最终提示词」。
- **Video / Audio**：若未来加提示词工程，可沿用同一模板，只实现自己的 MIDDLE/SUFFIX。

实现上不必立刻把 writing-service / graph-service 重写成一个通用函数，可先在 **prompts** 层提供一个小型工具函数，例如：

```ts
/**
 * 按统一模板拼接：rules + middleBlocks + userInput + outputFormat + tail
 * 空段自动忽略，段落之间用 \n\n 或 --- 分隔（可由调用方传 separator）。
 */
export function assemblePrompt(parts: {
  rules?: string;
  middleBlocks?: string[];
  userInput: string;
  outputFormat?: string;
  tail?: string;
  separator?: string;
}): string { ... }
```

各业务在现有拼接处逐步改为调用 `assemblePrompt`，或保持现有实现但**在文档/注释中标明对应 PREFIX/MIDDLE/USER_INPUT/SUFFIX**，以便后续收敛到同一实现。

---

### 3.3 业务 key 与 (scope, type, subtype) 的映射

与现有规范一致，建议在 **prompts** 或 **业务 key 工具** 中集中维护「业务 key → PromptConfigKey」的映射，便于解析与 Admin 配置一致：

| 业务 key 示例           | scope   | type     | subtype   |
|-------------------------|--------|----------|-----------|
| writing-articles        | writing | articles | null      |
| writing-outlines        | writing | outlines | null 或子类型 |
| graph-photograph        | graph   | photograph | portrait / landscape / … |
| graph-design            | graph   | design   | 3d / coverImage / … |
| video-sora-2 / sora-2-deer | video | 模式名   | null（可选） |
| audio-speak / audio-music | audio | 类型     | null（可选） |

这样「业务 key → 提示词配置」与「业务 key → model-routing」可以共用同一套 key 体系，便于统一管理与扩展。

---

## 四、实施步骤建议

1. **第一阶段（解析层统一）**
   - 在 `prompts/resolver.ts` 中实现 `getPromptConfigResolved` 与 `getFallbackPromptConfig`。
   - `getWritingRulesAndFormatResolved` / `getGraphRulesResolved` 改为调用上述统一入口，保持对外接口不变。
   - 测试：Writing / Graph 现有行为不变。

2. **第二阶段（可选：拼接工具）**
   - 在 `prompts/` 下增加 `assemblePrompt`（或类似），实现「rules + middle + userInput + outputFormat + tail」的通用拼接。
   - Writing / Graph 可择机把现有拼接改为调用该工具，或仅在新功能中使用。

3. **第三阶段（扩展 Video / Audio）**
   - 若需要为 Video / Audio 做提示词工程：在 DB 中为对应 (scope, type, subtype) 配置 rules/output_format；在 `getFallbackPromptConfig` 中增加 video/audio 的回退（若需要代码默认值）；在 video-service / audio 调用处使用 `getPromptConfigResolved` + 统一模板拼出最终 prompt。

---

## 五、小结

| 维度     | 现状           | 统一后 |
|----------|----------------|--------|
| 存储     | 已统一（单表、同一 schema） | 不变 |
| 解析 API | Writing/Graph 各用各的、返回形状不一致 | 单一 `getPromptConfigResolved(key, lang)`，统一返回 `{ rules, outputFormat }`，旧 API 保留为薄包装 |
| 拼接结构 | 各业务自己拼，但概念上都是「规则 + 中间 + 用户 + 格式/要求」 | 抽象成统一模板，可选实现 `assemblePrompt`，便于扩展 Video/Audio |
| 业务 key | 与 model-routing 一致，但未与提示词 key 显式统一 | 显式映射「业务 key → (scope, type, subtype)」，与规范一致 |

**结论**：**可以统一**。数据层已是统一基础；解析层通过「统一 API + 按 scope 回退」即可在不改业务行为的前提下统一；拼接层用统一模板概念（并可选通用工具函数）即可让四类业务结构一致、便于扩展。建议先做解析层统一，再视需要做拼接工具与 Video/Audio 扩展。
