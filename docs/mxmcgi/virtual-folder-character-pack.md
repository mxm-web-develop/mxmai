# 角色卡（character）整包解析与注入

> 状态：实现中（2026-07）— `text/transform/vf-character-pack` + 索引整包 + 注入 1～10 参考图。  
> 范围：仅 `card_tag=character` 的虚拟文件夹。  
> 原则：LLM 走入库 **text 业务**；text 步骤相互独立，模板自带输入语义；遵循 [`.cursor/skills/mxmai_text_business_bundle/SKILL.md`](../../.cursor/skills/mxmai_text_business_bundle/SKILL.md)。

---

## 1. 产品意图

用户把角色相关素材丢进虚拟文件夹：人设文档、立绘、三视图/模卡、表情差分、服装参考等。  
业务挂 `character_folder_id` 时需要：

| 下游 | 主要吃什么 |
|------|------------|
| 写作 | 人设 / 背景 / 性格 / 喜好等（结构化 + `character_brief`） |
| 生图 / 视频 | **角色参考图**（1～10）+ `appearance_prompt` |

与视觉风格卡不同：

| | 视觉风格 | 角色卡 |
|--|--------|--------|
| 解析 | 每图 frame + 一次 pack | **整夹一次** pack |
| 缺字段 | 省略 | **推理补全**；抽取覆盖脑补；用户覆盖一切 |
| 主资产 | 设计语言 + Top5 风格样例 | 人设文案 + **1～10 张**形象参考 |
| 向量 | 无 | 无 |

UX：打标角色卡 → 软链/上传 →「解析此卡」（与风格卡相同入口）。

---

## 2. Text 业务（一个）

| 业务键 | 输入 | 输出 |
|--------|------|------|
| `text/transform/vf-character-pack` | 本夹文案拼接 + 多图 reference（有上限） | 一个 `CharacterPackSummary` → `card_summary.character` |

**不**做 `vf-character-frame`。管线里的 LLM **不知道**上游业务名；模板须写明：输入是独立抽取前的「夹内素材清单 + 像素/文案」。

### 2.1 服务端组装

1. 收集 txt/md（及可读文本任务）→ `dossier_text`（截断上限）。  
2. 收集图片：优先 `asset_role=appearance`，否则全部图；送入 vision 的上限建议 **≤12**（控制 token）；卡面最终参考图 **1～10**。  
3. 一次调用 `vf-character-pack`（多模态）。  
4. 解析 URL → 写 `appearance_image_urls` 等。

---

## 3. 语言与参考图数量（已确认）

- **全部英文字段值**（人设、外形、标签、brief、appearance_prompt）。  
- **参考图数量：1～10**（`appearance_ref_ids` / `appearance_image_urls`）。  
- 主图：`appearance_primary_ref`（通常为最清晰正面/全身，或最佳模卡）。

---

## 4. 多维信息图（模卡 / 宫格 / 角色信息卡）

用户常上传 **一张图含多角度、多画幅、多表情**（character sheet / model sheet / 模卡 / 设定图）。

解析时每张输入图须标注：

```ts
type CharacterMediaKind =
  | 'single_portrait'      // 单角度肖像/半身/全身
  | 'multi_view_sheet'     // 三视图 / 多角度宫格 / turnaround
  | 'expression_sheet'     // 表情差分宫格
  | 'outfit_sheet'         // 多套服装拼图
  | 'info_card'            // 角色信息卡（图文混排设定图）
  | 'scene_with_character' // 场景中的角色（弱身份参考）
  | 'other';

type CharacterMediaAsset = {
  ref_key: string;
  media_kind: CharacterMediaKind;
  /** true = 单图承载多维信息（多角度/多画幅/多面板） */
  is_multi_panel: boolean;
  panel_hints?: string[];   // e.g. ["front","side","back"], ["3/4","close-up"]
  suitability?: {
    identity_lock: number;  // 0..1 适合作身份锁定参考
    costume_ref: number;
    expression_ref: number;
  };
  url?: string;             // 服务端填充
};
```

规则：

- 宫格/模卡/信息卡 → `is_multi_panel: true`，并尽量填 `panel_hints`。  
- 多维图 **可整张**进入 1～10 参考列表（下游生图吃整张 sheet，不强制裁切面板；裁切为后续可选）。  
- 选 Top 参考时：高 `identity_lock` 优先；多维图通常高于「场景里的小人」。

---

## 5. Provenance（抽取 vs 脑补 vs 用户）

```ts
type FieldProvenance = 'extracted' | 'inferred' | 'user';

type Provenanced<T> = {
  value: T;
  provenance: FieldProvenance;
  evidence?: string[];  // optional short English notes / ref_keys
};
```

合并优先级（再解析时）：

**`user` > `extracted` > `inferred`**

- 素材不足：可推理的字段用 `inferred` 填满，**避免无意义的 null**（`voice_id` 除外：无证据则省略，禁止编造）。  
- 新素材抽出的 `extracted` 覆盖旧 `inferred`，不覆盖 `user`。  
- VF 手改字段标 `user`。

---

## 6. `CharacterPackSummary`（卡面）

```ts
type CharacterPackSummary = {
  schema_version: 1;

  display_name: Provenanced<string>;
  aliases?: Provenanced<string[]>;
  species_or_race?: Provenanced<string>;
  gender_presentation?: Provenanced<string>;
  age_band?: Provenanced<string>;

  physique?: Provenanced<string>;
  face?: Provenanced<string>;
  hair?: Provenanced<string>;
  distinctive_marks?: Provenanced<string[]>;
  clothing_default?: Provenanced<string>;
  clothing_preferences?: Provenanced<string[]>;
  color_affinities?: Provenanced<string[]>;

  personality?: Provenanced<string>;
  background?: Provenanced<string>;
  speech_style?: Provenanced<string>;
  likes?: Provenanced<string[]>;
  dislikes?: Provenanced<string[]>;
  relationships?: Provenanced<string[]>;
  abilities?: Provenanced<string[]>;

  /** Writing inject — English dossier paragraph(s) */
  character_brief: string;
  /** Image/video inject — English appearance + wardrobe lock */
  appearance_prompt: string;

  /** Per-input media classification (incl. multi-panel sheets) */
  media_assets: CharacterMediaAsset[];

  appearance_primary_ref?: string;
  /** 1..10 ref_keys, identity-first */
  appearance_ref_ids: string[];
  appearance_image_urls?: string[];

  voice_id?: string;
  asset_count: number;
};
```

角色文案用 **专业英文**（character bible / casting brief 语气），禁止口语中文。

---

## 7. 下游注入

| need / param | 来源 |
|--------------|------|
| `character_brief` | `character_brief` |
| `appearance_prompt` | `appearance_prompt`（建议新增隐式注入） |
| `host_portrait` | primary URL |
| `character_ref_images` | `appearance_image_urls`（1～10） |
| `voice_id` | 仅有证据时 |
| `referenceImage` | 合并 character refs（`type: character-reference`） |

---

## 8. 流程

```text
混素材入夹（图文；可含模卡/宫格）
  → 一次 vf-character-pack（文案 + 多图）
  → 标记 media_kind / is_multi_panel
  → 推理补全 + provenance
  → 选 1～10 appearance refs
  → card_summary.character
  → 无 embedding
业务 character_folder_id
  → brief（写作）+ appearance_prompt + 参考图像素（生图）
```

---

## 9. 实现清单

- [x] `character-vision-types.ts` + normalize + merge（user/extracted/inferred）
- [x] Bundle `text-transform-vf-character-pack.business.json` + seed
- [x] 索引：`card_tag=character` 走整包；退出 character legacy
- [x] `resolve-card-assets`：1～10 refs + appearance_prompt + referenceImage
- [x] VF：卡面摘要（姓名 / refs / multi-panel）+ PATCH `/character` 字段编辑 API
- [ ] VF：完整人设表单编辑 UI（可后续迭代）
- [ ] PDF：与风格卡同为空缺

## 10. 相关

- 风格卡：[`virtual-folder-style-pack.md`](./virtual-folder-style-pack.md)  
- text skill：`.cursor/skills/mxmai_text_business_bundle/SKILL.md`  
- 挂卡：`mxmcgi/src/folder-cards/resolve-card-assets.ts`
- Runner：`mxmcgi/src/folder-index/vf-character-pack-runner.ts`
- 类型：`mxmcgi/src/folder-index/character-vision-types.ts`
- 种子：`pnpm --filter mxmcgi seed:text-vf-character-pack`
