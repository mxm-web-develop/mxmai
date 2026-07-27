# 语感文风卡（writing）文章语感对象与解析流程

> 状态：实现中（2026-07）— `text/transform/vf-writing-frame` + `vf-writing-pack`，索引走 Task V2。  
> **已知空缺：PDF 解析**（与视觉风格卡相同，pdf 进夹仍会 skip）。  
> 范围：仅 `card_tag=writing` 的虚拟文件夹。  
> 原则：LLM 走入库 **text 业务**；禁止直连 DeerAPI。

---

## 1. 产品意图

用户批量丢入「想学其笔法」的文章（txt / md / 写作任务产出），类型可以是公号、评论、教程、口播稿等。  
语感文风卡要抽取的是 **可复用的写作语感与结构套路**，不是内容摘要，也不是视觉设计语言。

与视觉风格卡（`card_tag=style`）并列：

| | 视觉风格 `style` | 语感文风 `writing` |
|--|------------------|-------------------|
| 素材 | 图 + 设计文案 | 文章正文 |
| 抽什么 | 色板 / 构图 / 排版 | 语气 / 句式 / 结构 / 用词 |
| 卡面 | `card_summary.style` | `card_summary.writing` |
| 挂卡参 | `style_folder_id` | `writing_folder_id` |
| 主注入 | `style_summary` | `writing_summary`（= voice_summary） |
| 向量 | 无 | 无 |

下游：写作 / 口播稿 text / 任意生成业务均可挂 `writing_folder_id`（注入链路已预留）。

---

## 2. Text 业务（两个）

| 业务键 | 输入 | 输出 |
|--------|------|------|
| `text/transform/vf-writing-frame` | 一篇文章正文 | 一个 `WritingStyleObj` |
| `text/transform/vf-writing-pack` | 本夹已有帧 Obj 列表（JSON） | 一个 `WritingStylePackSummary` → `card_summary.writing` |

种子：

```bash
pnpm --filter mxmcgi seed:text-vf-writing-style-pack
```

---

## 3. 单篇对象 `WritingStyleObj`

```ts
type WritingStyleObj = {
  schema_version: 1;
  confidence: number;
  source: 'text';
  genre?: string;
  voice_summary?: string;     // 2～4 句可注入 brief（主用）
  tone?: string[];
  register?: string;
  person_pov?: string;
  rhythm?: string;
  sentence_craft?: string;
  rhetoric?: string[];
  lexicon?: { favored?: string[]; avoid?: string[]; catchphrases?: string[] };
  structure?: {
    opening?: string;
    progression?: string;
    headings?: string;
    closing?: string;
    outline_pattern?: string;
  };
  pacing?: string;
  audience_stance?: string;
  avoid?: string[];
  feature_tags?: string[];    // 1–3 English: tone/structure/rhythm/lexicon/…
};
```

---

## 4. 整包对象 `WritingStylePackSummary`

```ts
type WritingStylePackSummary = {
  schema_version: 1;
  voice_summary: string;
  tone?: string[];
  register?: string;
  genre_tags?: string[];
  structure_bias?: string;
  lexicon_rules?: string;
  rhythm_feel?: string;
  person_pov?: string;
  rhetoric_bias?: string[];
  avoid?: string[];
  variants?: string[];
  exemplars?: Array<{ ref_key: string; fit_score: number; feature_tags: string[]; title?: string }>;
  exemplar_ref_ids: string[];
  frame_count: number;
  coverage?: Record<string, number>;
};
```

---

## 5. 增量更新

与视觉风格卡同构：

```text
新增/变更文章：
  1. 仅对这些 ref 跑 vf-writing-frame
  2. 收集本夹全部有效 WritingStyleObj
  3. 跑一次 vf-writing-pack → 覆写 card_summary.writing
  4. card_status = ready
```

| 素材 | 处理 |
|------|------|
| txt / md / 写作任务正文 | `vf-writing-frame` |
| 图片 | skip（语感卡不吃图） |
| PDF | skip（待接入） |

---

## 6. 注入（预留）

业务 params 含 `writing_folder_id` 时，`resolveFolderCardAssets` 注入 `writing_summary`（由 `voice_summary` + tone/register/structure 等拼装）。

Schema 亦可：

```json
{
  "x-asset-source": {
    "from": "folder_card",
    "need": "writing_summary",
    "folder_param": "writing_folder_id"
  }
}
```

---

## 7. 实现清单

- [x] `writing-style-types` + runner + 索引分流
- [x] text bundle `vf-writing-frame` / `vf-writing-pack`
- [x] Web：卡标签「语感文风」+ 解析数据面板
- [x] `style` 用户文案改为「视觉风格」
- [ ] PDF 文本层接入
- [ ] SchemaForm `FolderCardPicker`（writing）默认字段（按业务需要再挂）
