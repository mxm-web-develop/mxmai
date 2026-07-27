# 视觉风格卡（style）视觉语言对象与解析流程

> 状态：实现中（2026-07）— 已上架 `text/transform/vf-style-frame` + `vf-style-pack`，索引走 Task V2，禁止 DeerAPI 直连。  
> **已知空缺：PDF 解析**（写作产出 PDF 进风格夹仍会 skip，待后续服务端 PDF→文本/页图接入）。  
> 范围：仅 `card_tag=style` 的虚拟文件夹（UI 称「视觉风格」）。语感文风见 [`virtual-folder-writing-style-pack.md`](./virtual-folder-writing-style-pack.md)。  
> 原则：LLM 调用必须走入库的 **text 业务**，禁止工具内直连 DeerAPI / 写死模型。

---

## 1. 产品意图

用户批量丢入「觉得好看 / 想参考」的素材，类型不确定（官网截图、相片、色卡、海报、分镜静帧等）。  
视觉风格卡要抽取的是 **可复用的设计语言**（风格、主题、样式规则），不是看图说话或全文 OCR，也不是文章语感（那是 writing 卡）。

下游需同时覆盖：

- 产品 / 包装 / UI 视觉锁定  
- AI 剧分镜气质与画面规则  

业务挂的是 **整夹风格包（卡）**，不是单张图。

---

## 2. Text 业务拆分（两个，不是三个）

| 业务键（拟定） | 输入 | 输出 |
|----------------|------|------|
| `text/transform/vf-style-frame` | 单张图 **或** 一段设计文案 | 一个 `StyleVisionObj` |
| `text/transform/vf-style-pack` | 本夹已有帧 Obj 列表（JSON） | 一个 `StylePackSummary` → 写入 `card_summary.style` |

- **不要**按风格/角色/知识拆三个 vision 业务。  
- 帧抽取与包汇总分离，便于增删素材后增量更新。

---

## 3. 色板模型（修订）

**不要**拆成互斥的 `primary_colors` / `secondary_colors` + 独立 `gradients`。

现实约束：

- **主色本身可以是渐变**（不是「先 solid 再另挂 gradient」）  
- 一套设计里常有 **多套色板**（品牌主板、暗色板、强调板、分镜情绪板…）  
- 能抽多少套、每套几色，**以画面/文案为准**，字段全可选

### 3.1 色值：`ColorValue`

```ts
/** 单色或渐变，二选一语义；都缺则仅 note */
type ColorValue =
  | {
      kind: 'solid';
      hex: string;           // #RRGGBB
      note?: string;
    }
  | {
      kind: 'gradient';
      stops: Array<{ hex: string; at?: number }>; // at: 0–1 可选
      angle?: string;        // 如 "90deg" / "to bottom"
      note?: string;
    };
```

### 3.2 色板：`ColorPalette`

```ts
type ColorPalette = {
  /** 本套色板名：主品牌 / 暗色 / 强调 / 未命名则空 */
  name?: string;
  /** 在整套设计中的角色，可多选语义，模型自由填短词 */
  roles?: string[];          // 例: ["primary"], ["surface","bg"], ["accent"]
  /** 有序色值：第一枚常即「主色」（可为渐变） */
  colors: ColorValue[];
  note?: string;
};
```

单帧 / 整包都用 **`palettes: ColorPalette[]`**，套数不限；抽不出则 `[]` 或省略。

---

## 4. 单帧对象 `StyleVisionObj`

```ts
type StyleVisionObj = {
  schema_version: 1;
  confidence: number;          // 0–1
  source: 'image' | 'text';    // 图抽 / 文抽
  media_kind?: 
    | 'photo' | 'illustration' | 'ui_screenshot' | 'palette_card'
    | 'storyboard' | 'poster' | 'logo' | 'texture' | 'design_doc' | 'other';

  // —— 风格 / 主题（核心）——
  style_tags?: string[];
  theme?: string;
  mood?: string[];
  aesthetic_summary?: string;  // 2～4 句样式规则（下游 prompt 主用）

  // —— 色彩（多套色板；主色可为渐变）——
  palettes?: ColorPalette[];

  color_rules?: string;        // 「高对比」「莫兰迪低饱和」等自然语言规则

  // —— 字体 / 排版（有证据才填）——
  typography?: {
    font_feel?: string;
    weight_contrast?: string;
    size_ratio?: string;
    text_density?: string;
  };

  // —— 布局 / 间距 / 构图 ——
  composition?: string;
  layout_rules?: string;
  spacing_rhythm?: string;
  aspect_bias?: string;

  // —— 设计元素 / 母题（风格向）——
  design_elements?: string[];
  motif?: string[];
  subject_roles?: string[];    // 主体在设计中的功能，非剧情描述

  materials?: string[];
  lighting?: string;
  avoid?: string[];

  // —— 弱字段（默认少填、不作主检索）——
  ocr_style_hints?: string;    // 仅字体/字号样例相关短摘
  caption?: string;            // 极短标签，可选
  feature_tags?: string[];     // 1–3 English tokens: palette / layout / typography…
};
```

**抽取原则**：字段全可选；偏向风格与规则；避免长 caption / 全文 OCR。

---

## 5. 整包对象 `StylePackSummary`（卡面）

写入 `folders.card_summary.style`，业务挂 `style_folder_id` 时主要消费本对象 + exemplar 图 URL。

```ts
type StyleExemplar = {
  ref_key: string;          // storage_object:uuid | task:uuid
  url?: string;
  fit_score: number;        // 0～1，与整包 style_summary 结合度
  feature_tags: string[];   // 1–3 English professional tokens (user-editable)
};

type StylePackSummary = {
  schema_version: 1;
  style_summary: string;                 // 整包设计语言（主注入文案）
  palettes: ColorPalette[];              // 跨帧共识后的多套色板
  color_rules?: string;
  typography_feel?: string;
  composition_bias?: string;
  mood?: string[];
  style_tags?: string[];
  design_elements?: string[];
  avoid?: string[];
  variants?: string[];                   // 包内明显两套以上倾向时说明
  exemplars: StyleExemplar[];            // 最多 5，按 fit_score 降序
  exemplar_ref_ids: string[];            // 与 exemplars 对齐（兼容）
  frame_count: number;
  coverage?: Record<string, number>;
};
```

**单帧**另有 `feature_tags?: string[]`（1～3 English tokens）：夹内每张图都打；汇总时按结合度挑 Top5 进 `exemplars`。

`unifiedTemplate` 写法遵循 [`.cursor/skills/mxmai_text_business_bundle/SKILL.md`](../../.cursor/skills/mxmai_text_business_bundle/SKILL.md)：英文专业用语、无平台自我介绍、JSON 供下游机器消费。

用户可在虚拟文件夹编辑任一条目的 `feature_tags`（`PATCH .../items/:itemId/feature-tags`）；若该图在 Top5 内则同步卡面。**再次解析会整表覆盖**标签与分数（不保留手改）。

与旧字段对照（迁移期可双写）：

| 旧 `card_summary.style` | 新 |
|-------------------------|----|
| `style_summary` | 保留；注入时追加样例特征行 |
| `palette: string[]` | 由 `palettes` 展平导出兼容，或逐步废弃 |
| `exemplar_urls` | 由 `exemplars[].url` 派生 |
| `donts` | 对齐 `avoid` |

---

## 6. 增量更新（是的：新文件解析 + 一次再汇总）

```text
已有：entry.analysis = StyleVisionObj（indexed）
新增/变更软链：
  1. 仅对这些 ref 跑 vf-style-frame
  2. 收集本夹全部有效 StyleVisionObj
  3. 跑一次 vf-style-pack → 覆写 card_summary.style
  4. card_status = ready
```

| 场景 | 行为 |
|------|------|
| 只加 1 张图 | 1 次 frame + 1 次 pack |
| 改/删若干张 | 受影响帧重跑或删除 entry → 再 1 次 pack |
| `force: true` | 全量 frame + 1 次 pack |
| 内容 hash 未变 | 跳过该帧 frame，仍可因其它帧变更而 pack |

**不**把所有图一次塞进视觉模型；汇总步输入为 JSON Obj 列表（可截断低 confidence / 抽样）。

---

## 7. 文字设计方案能否抽取？

**能。** 风格夹不限于图。

| 素材 | 处理 |
|------|------|
| 图片 | `vf-style-frame`（vision，`source: image`） |
| txt / md 设计说明、brief、规范文 | **同一** `vf-style-frame`（纯文本模式，`source: text`），输出**同一** `StyleVisionObj` |
| PDF | 当前索引仍 skip；落地时：先抽文本（或抽内嵌图再 vision）→ 再走 frame；未接通前勿假装已支持 |

文字抽取重点同样是：色板描述、字体层级、间距规则、情绪与禁忌——**不是**把方案全文当知识库问答语料（那是 knowledge 卡）。

多模态混夹时：图 Obj + 文 Obj 一起进入 **同一次** `vf-style-pack`，由汇总模型做共识 / 变体 / exemplar（exemplar 优先图；纯文夹则 exemplar 可空，只注入 `style_summary`）。

---

## 8. 推荐调用形态（回顾）

```text
混素材入夹
  → 按 ref 增量 vf-style-frame → StyleVisionObj[]
  → vf-style-pack → StylePackSummary
  → card_summary.style（业务注入主路径）
  → **不做** embedding / 知识库向量（省 token；向量只留给 knowledge 卡）
业务 style_folder_id
  → 注入增强 style_summary（含样例特征行）+ style_exemplar_hints + style_ref_images（最多 5 URL）
  → 合并进 referenceImage（type: style-reference）供生图像素通路
```

---

## 9. 实现清单

- [x] 落地两个 text bundle：`mxmcgi/src/tasks/examples/text-transform-vf-style-pack.business.json`
- [x] 种子：`pnpm --filter mxmcgi seed:text-vf-style-pack`
- [x] `folder-image-caption` 去掉 DeerAPI 直连；风格走 `vf-style-pack-runner`
- [x] 索引服务：增量 frame + 单次 pack → `card_summary.style`
- [x] 每帧 `feature_tags` + pack Top5 `exemplars`（fit_score）；VF 可编辑标签；重解析覆盖
- [x] 挂卡注入：Top5 URL → `style_ref_images` + `referenceImage`；标签并入 `style_summary`
- [ ] PDF 接入（文本层 / 内嵌页图）— **记作空缺，未做**
- [ ] 角色卡 / 知识卡独立 text 业务（当前非风格卡不跑视觉 LLM）
- [ ] SchemaForm 接 FolderCardPicker（`style_folder_id` 表单字段）

## 10. 相关

- 现况索引说明：[`virtual-folder-index.md`](./virtual-folder-index.md)  
- 挂卡注入：`mxmcgi/src/folder-cards/resolve-card-assets.ts`  
- 命名规范：`.cursor/skills/mxmai_business_naming/SKILL.md`
- Runner：`mxmcgi/src/folder-index/vf-style-pack-runner.ts`
- 类型：`mxmcgi/src/folder-index/style-vision-types.ts`
- **text 业务 Prompt 规范**：[`.cursor/skills/mxmai_text_business_bundle/SKILL.md`](../../.cursor/skills/mxmai_text_business_bundle/SKILL.md)
