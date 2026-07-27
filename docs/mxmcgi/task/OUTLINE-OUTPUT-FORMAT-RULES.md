# 大纲输出格式规则（来自老逻辑，用于 outputFormatTemplate）

以下规则从 `writing-service.ts` 中非 v2 路径的 prompt 拼接逻辑整理而来，配置到 TaskTemplate 的 **outputFormatTemplate** 后，v2 即可产出与老逻辑一致的大纲 JSON 结构。

---

## 1. 通用要求

- 只输出最终大纲 JSON，**不要**使用 markdown 代码块（不要 \`\`\`json ... \`\`\`）。
- 必须返回**完整、有效**的 JSON 对象，不要截断，不要在大纲内容后添加任何解释性文字。
- 直接返回 Outline 根对象，**不包含** `characters` 字段（角色信息由上游单独处理）。

---

## 2. 根节点与每个子节点字段

### 必选字段（每个节点必须有）

| 字段 | 类型 | 说明 |
|------|------|------|
| `uid` | string | 节点唯一标识，根节点可用任务 uid，子节点建议 sub_1、sub_2、… |
| `content` | string | 该节点标题/段落主题内容 |
| `children` | array | 子节点数组，结构与当前节点相同；叶子节点为 `[]` |

### 可选字段（按需输出，与兄弟节点同级结构保持一致）

| 字段 | 类型 | 说明 |
|------|------|------|
| `motivation` | string | 写作动机：该段落要达成的目的、承上启下的作用 |
| `stance` | string | 立场：该段落的叙述立场（如「客观陈述」「中立、方法论」） |
| `tone` | string | 语调：该段落的语气（如「学术性、引入性」「严谨、说明性」） |
| `length` | number 或 string | 长度要求：字数（number，如 80）或带单位描述（如「30秒（约100字）」） |
| `key_elements` | string[] | 关键要素：该段落需要涵盖的要点列表 |
| `cast` | string[] | 出场角色：角色 id 或 name 的数组；口播/分镜场景使用，可省略或空数组表示纯旁白/镜头 |
| `speech_rate` | string | 口播稿：语速（如字/分钟），可选 |
| `rhythm` | string | 分镜脚本：节奏（如镜头/分钟），可选 |

---

## 3. 示例节点（与老逻辑一致）

```json
{
  "uid": "sub_1",
  "content": "引言：张天一犯罪现象的背景与问题",
  "tone": "学术性、引入性",
  "stance": "客观陈述",
  "length": 80,
  "motivation": "引出张天一作为犯罪案例的典型性，概述其犯罪生涯的基本轮廓，提出本文旨在系统分析其犯罪路径的核心研究问题。",
  "key_elements": [
    "社会背景简述",
    "张天一身份与主要罪行概述",
    "研究目的：分析其犯罪演化路径"
  ],
  "children": []
}
```

---

## 4. 配置到 outputFormatTemplate 的推荐文案

可直接复制下面整段到业务管理 → 对应大纲任务 → **outputFormatTemplate**（或作为脚本/示例的默认值）：

```
【输出格式要求】
【重要】你的回复有且仅能是一个 JSON 对象：回复的第一个非空字符必须是 {，最后一个非空字符必须是 }。禁止输出任何 Markdown 标题（#、##）、章节说明、列表或其它文字，否则系统无法解析。

- 只输出最终大纲 JSON，不要使用 markdown 代码块，不要包裹在 ```json 中。
- 必须返回完整、有效的 JSON 对象，不要截断，不要添加任何解释性文字。不包含 characters 字段。

- 根节点与每个子节点结构一致。
  - 必选字段：uid(string)、content(string)、children(array)。
  - 可选字段（建议每个节点都输出，与兄弟节点结构一致）：motivation(string)、stance(string)、tone(string)、length(number 或 string)、key_elements(string 数组)。口播/分镜场景可增加 cast(string 数组)、speech_rate、rhythm。

- 示例子节点格式：
{"uid":"sub_1","content":"引言：xxx 的背景与问题","tone":"学术性、引入性","stance":"客观陈述","length":80,"motivation":"引出…概述…提出…","key_elements":["要点1","要点2","要点3"],"children":[]}

- 同一层级的所有节点应保持相同字段集合（若某一节点有 tone、stance、motivation、key_elements，同级其他节点也应输出这些字段，无内容可填空字符串或空数组）。
```

上述规则与老逻辑中「每个节点需要包含：content、motivation、length、key_elements；stance、tone；cast（可选）」及 JSON 示例要求一致，配置后 v2 即可产出与老接口一致的大纲结构。
