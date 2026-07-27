# 以「大纲」为例：一次请求的提示词拼装与规范

用**大纲（outlines）** 业务做例子，说明：用户发一个模拟请求进来后，**理想上**应该如何做「提示词拼装、输出格式、写作规范」，以及**当前代码里实际**是怎么做的。

---

## 一、用户发的是什么请求（模拟）

例如用户调用「生成大纲」接口，请求体里会带：

- `writing_type: 'outlines'`
- `prompt`: 用户写的主题/需求（如「写一篇关于 AI 的科技文章大纲」）
- `applyto`: 用于哪种写作（如 `articles` / `voice-scripts` / `storyboard-scripts`）
- `outline_type`: 子类型（如 `tech-article`、`short-video-storyboard`）
- `outline_structure_type`: 结构类型（如 `three-act`、`imrad`）
- `maxDepth`、`expectedNodes`、`total_textcount` 或 `total_duration_seconds` 等
- 可选：`knowledgeBase`、`stance`、`tone`、角色相关参数等

路由识别到 `writing_type === 'outlines'` 后，会创建任务并最终走到 **writing-service** 的 **generateOutline**（或流式版 **generateOutlineStream**）。

---

## 二、理想流程：提示词拼装、输出格式、写作规范应该怎么来

和规范里说的「四步」一致，理想上应该是：

1. **写作规范（rules）**  
   - 从**提示词工程**来：先查 DB 表 `prompt_engineering_config`（scope=writing, type=outlines, subtype=可选），取 `rules_i18n`；  
   - 若 DB 没有或未启用，再回退到**代码**里 `wtconfigs/outlines.ts` 的 **outlinesConfig.rules**。  
   - 这段内容就是「大纲写作规则和指导原则」（层次清晰、逻辑严密、结构要求、字数分配原则等），应该**放在最终 prompt 的最前面**，告诉模型「按什么规范写大纲」。

2. **输出格式（outputFormat）**  
   - 同样先 DB 的 `output_format_i18n`，没有再回退到 **outlinesConfig.outputformat**。  
   - 这段是「大纲格式要求」（几级标题怎么标号、必须包含引言/正文/结论、纯文本层级与示例、字数分配要求等），应该**放在最终 prompt 的后面**，告诉模型「输出长什么样」。

3. **拼装顺序（理想）**  
   最终发给模型的 prompt 理想结构可以是：

   ```
   [写作规范]  ← rules（来自 DB 或 outlinesConfig.rules）
   ---
   [用户需求与参数]
   - 用户 prompt（若配置了知识库，这里可以是 enhancedPrompt）
   - 深度、节点数、字数/时长要求
   - applyto / outline_type / outline_structure_type 等
   - 结构类型模板（若有）
   - 角色信息（若有）
   - 每个节点要包含的字段说明、JSON 示例等
   ---
   [输出格式]  ← outputFormat（来自 DB 或 outlinesConfig.outputformat）
   ```

也就是说：**写作规范**靠 rules、**输出格式**靠 outputFormat，中间是「用户说了什么 + 我们补充的参数与示例」。这样就和「文章段落生成」那套一致：先取配置，再按固定顺序拼装。

---

## 三、当前代码里大纲实际是怎么做的

在 **writing-service.ts** 的 **generateOutline** / **generateOutlineStream** 里，大纲的 prompt 是**手写的一整段**，**没有**调用 **getWritingRulesAndFormatResolved('outlines', ...)**，也**没有**用 **outlinesConfig.rules** 和 **outlinesConfig.outputformat**。

### 3.1 实际拼装顺序（简化）

当前 `outlinePrompt` 的大致顺序是：

1. **语言指令**（中文/英文）
2. **开头一句**：「请根据以下要求生成一个写作大纲：」
3. **enhancedPrompt**：用户输入的 `prompt`，若配置了知识库会先做知识库召回再拼进来（`enhancePromptWithKnowledge`）
4. **「要求」列表**：手写的若干条，例如：
   - 大纲层级深度、期望节点数
   - 总字数/总时长要求（按 applyto 分支）
   - 字数或时长分配原则（手写文案）
5. **结构类型模板**：若传了 `outline_structure_type`，从 `getStructurePromptTemplate(...)` 取一段模板拼上
6. **立场/语调**：若有 stance、tone 且非分镜，再拼两条
7. **角色信息**：若有 cast 角色，拼「参演角色」和关系说明
8. **节点字段说明**：手写的「每个节点需要包含：content、motivation、length、key_elements、cast、stance、tone…」以及口播/分镜的强制要求
9. **JSON 示例与约束**：手写的「返回 JSON」「不要截断」「格式如下：{ "uid", "content", "children" }」等

也就是说：**写作规范**和**输出格式**在代码里是**手写散落在各段**的，并没有用 wtconfigs 里已经写好的那两段长文案（outlinesConfig.rules 和 outlinesConfig.outputformat）。

### 3.2 和「理想」的差异

| 项目       | 理想做法 | 当前大纲实现 |
|------------|----------|--------------|
| 写作规范   | 用 DB 或 outlinesConfig.**rules**，放在 prompt 最前 | **未使用** rules，规范类描述是手写在各段里的 |
| 输出格式   | 用 DB 或 outlinesConfig.**outputformat**，放在 prompt 最后 | **未使用** outputformat，格式与示例是手写在「节点字段说明 + JSON 示例」里的 |
| 拼装入口   | 先 `getWritingRulesAndFormatResolved('outlines', outlineType, lang)`，再按「rules + 中间 + outputFormat」拼 | 没有调用 resolver，也没有用 wtconfigs 的 rules/outputformat |
| 知识库     | 有：enhancedPrompt = 用户 prompt + 知识库召回结果 | 有，一致 |

所以：**当前「大纲」并没有接入统一的「提示词工程」流程**；规则和格式在配置里存在，但生成时没用上，而是另一套手写逻辑。

---

## 四、若要让大纲也走「统一提示词工程」

要让大纲和「文章段落」一样：**明确有「写作规范」和「输出格式」两段，且来自配置**，可以这样改：

1. **在 generateOutline / generateOutlineStream 里**  
   - 开头先调用：  
     `const { rules, outputFormat } = await getWritingRulesAndFormatResolved('outlines', params.outline_type ?? null, lang);`
   - 若 `rules` 非空，把 **rules** 放在 `outlinePrompt` 的**最前面**（例如在「请根据以下要求生成一个写作大纲」之前或紧跟其后），用 `---` 和后面内容分隔。
   - 若 `outputFormat` 非空，把 **outputFormat** 放在**最后**（在「返回 JSON」「格式如下」等之前或之后，视你是想用 outputFormat 替代部分手写格式说明还是补充），同样用 `---` 分隔。

2. **中间部分**  
   - 保持现有逻辑：enhancedPrompt、深度/节点数、字数时长、结构类型模板、角色、节点字段说明、JSON 示例等，仍然按现在顺序拼在「rules 和 outputFormat 之间」。

3. **效果**  
   - **写作规范**：由 outlinesConfig.rules（或 DB）统一提供，便于 Admin 在后台改「大纲写作原则」而不改代码。  
   - **输出格式**：由 outlinesConfig.outputformat（或 DB）统一提供，便于改「大纲格式要求」和示例。  
   - 拼装方式与文章段落、其他写作类型一致，便于维护和后续做「提示词工程统一化」。

---

## 五、小结（直接回答你的三个点）

- **提示词拼装**  
  - **理想**：先取 rules，再拼「用户需求 + 参数 + 结构/角色/节点说明 + JSON 示例」，最后拼 outputFormat。  
  - **当前大纲**：没有用 rules/outputFormat，是用手写的一大段（开头语 + enhancedPrompt + 要求 + 结构模板 + 角色 + 节点说明 + JSON）拼出来的。

- **输出格式**  
  - **理想**：由配置里的 outputFormat 明确要求（编号方式、必须包含引言/正文/结论、纯文本示例、字数分配等）。  
  - **当前大纲**：输出格式是手写在「节点需要包含…」和「返回 JSON、格式如下」里的，没有用 outlinesConfig.outputformat。

- **写作规范**  
  - **理想**：由配置里的 rules 明确要求（层次清晰、逻辑严密、重点突出、可执行性等）。  
  - **当前大纲**：没有用 outlinesConfig.rules，规范类描述分散在手写文案里。

如果你愿意，下一步可以在 **writing-service.ts** 里给 generateOutline/generateOutlineStream 加对 **getWritingRulesAndFormatResolved** 的调用，并按上面顺序把 **rules** 和 **outputFormat** 拼进 **outlinePrompt**，这样「大纲」就和文档里说的「提示词拼装、输出格式、写作规范」一致了。
