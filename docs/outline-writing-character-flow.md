# 大纲写作中角色的作用流程

本文档详细说明从创建大纲到使用大纲写作的整个流程中，角色是如何发挥作用的。

## 一、创建大纲阶段

### 1.1 角色生成方式

大纲生成时，角色生成已独立为单独的接口。系统支持以下方式获取角色：

1. **用户引用已有角色**：通过 `cast_character_ids` 参数传入角色ID列表
2. **自动生成角色**：如果指定了 `cast_character_count` 但没有提供足够的角色ID，系统会自动调用角色生成接口

### 1.2 角色生成接口

**接口**: `POST /api/v1/characters/generate`

**参数**:
- `count: number` - 需要生成的角色数量
- `prompt: string` - 角色描述提示词

**功能**:
- 使用 LLM 根据提示词批量生成角色数据
- 自动推断角色之间的关系（relations 字段）
- 返回 `CharacterProfile[]`（不保存到数据库）

**relations 字段格式**:
```typescript
relations?: {
  [characterId: string]: {
    [otherCharacterId: string]: string;  // 关系描述，如 "情侣"、"父子"、"朋友"等
  };
};
```

### 1.3 大纲生成时的角色处理

当用户请求生成大纲时：

1. **如果提供了 `cast_character_ids`**：
   - 从 Character 模块获取已有角色信息
   - 如果数量不足且指定了 `cast_character_count`，自动生成剩余角色

2. **如果只提供了 `cast_character_count`**：
   - 自动调用角色生成接口生成指定数量的角色
   - 使用大纲的 `prompt` 作为角色生成的提示词

3. **大纲生成**：
   - 不再要求 LLM 生成角色
   - 专注于生成大纲结构
   - 在 prompt 中添加角色信息，要求 LLM 在合适的节点中添加 `cast` 字段

### 1.4 旧版 LLM 生成角色（已废弃）

~~当满足上述条件时，系统会在提示词中要求 LLM 生成角色画像：~~

```json
{
  "characters": [
    {
      "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "name": "角色名",
      "age": "24岁",
      "appearance": "外貌描述",
      "voice_description": "声音/台词风格描述（口播建议填写）",
      "clothing_style": "服装风格（可选）",
      "personality": "性格标签（可选）",
      "others": "其他设定（可选）"
    }
  ],
  "outline": {
    "uid": "root",
    "content": "主标题",
    "children": []
  }
}
```

### 1.5 角色保存策略

**重要**：生成的角色不会自动保存到用户的角色库。用户可以在编辑大纲时手动保存角色。

**手动保存方式**：
- 在大纲编辑页面，每个角色卡片都有"保存角色"按钮
- 点击后会将角色保存到用户的角色库
- 已保存的角色不会显示"保存角色"按钮（避免重复保存）

**保存内容**：
- 角色基本信息（name, nickname, age）
- 外貌描述（appearance）
- 声音描述（voice_description）
- 服装风格（clothing_style）
- 性格标签（personality）
- 其他设定（others）
- 分类和标签（category, tags）
- 角色关系（relations）

### 1.6 大纲节点中的角色引用（cast）

在大纲的每个节点中，可以指定该段落出场的角色：

```typescript
// 位置：mxmcgi/src/core/writing/type.ts
interface Outline {
  uid: string;
  content: string;
  /**
   * 出场角色（可选）
   * - 用于分镜脚本/多人口播/故事小说等场景
   * - 允许为空或不填：表示该段落是镜头/旁白/氛围，不绑定任何角色（正常）
   * - 元素为 string：可填 CharacterProfile.id 或 CharacterProfile.name
   */
  cast?: string[];
  children?: Outline[];
}
```

**cast 字段说明**：
- 可选字段，可以为空数组或不设置
- 元素可以是角色的 `id` 或 `name`
- 用于指定该段落出场的角色
- 允许纯镜头/旁白/氛围段落，不强制角色出场

## 二、使用大纲写作阶段

### 2.1 获取角色信息

在开始写作生成时，系统会从参数中获取角色信息：

```typescript
// 位置：mxmcgi/src/core/writing/writing-service.ts
async function getCharactersFromParams(
  params: WritingGenerateParams,
  userId?: string
): Promise<CharacterProfile[] | undefined> {
  // 1. 优先从 characterIds 获取（从 Character 模块）
  const characterIds = (params as any)?.characterIds as string[] | undefined;
  if (characterIds && characterIds.length > 0 && userId) {
    const characterService = new CharacterService();
    return await characterService.getCharactersForWriting(characterIds, userId);
  }

  // 2. 否则从 metadata.characters 中获取（向后兼容）
  const chars = (params as any)?.metadata?.characters;
  return Array.isArray(chars) ? (chars as CharacterProfile[]) : undefined;
}
```

**获取优先级**：
1. **从 Character 模块获取**：如果 `params.characterIds` 存在，从用户的角色库中获取完整角色信息（包括 relations）
2. **从 metadata 获取**：向后兼容，从 `params.metadata.characters` 中获取角色信息

### 2.2 格式化角色信息用于提示词

获取角色后，系统会将角色信息格式化为提示词格式：

```typescript
// 位置：mxmcgi/src/core/writing/writing-service.ts
function formatCharactersForPrompt(characters: CharacterProfile[]): string {
  return characters
    .map((c) => {
      const parts: string[] = [];
      parts.push(`- id=${c.id} name=${c.name}`);
      if (c.age) parts.push(`  age: ${c.age}`);
      if (c.appearance) parts.push(`  appearance: ${c.appearance}`);
      if (c.voice_description) parts.push(`  voice_description: ${c.voice_description}`);
      if (c.clothing_style) parts.push(`  clothing_style: ${c.clothing_style}`);
      if (c.personality) parts.push(`  personality: ${c.personality}`);
      if (c.others) parts.push(`  others: ${c.others}`);
      return parts.join('\n');
    })
    .join('\n');
}
```

**格式化结果示例**：
```
【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：
- id=xxx-xxx-xxx name=张三
  age: 24岁
  appearance: 外貌描述
  voice_description: 声音描述
  clothing_style: 服装风格
  personality: 性格标签
  others: 其他设定
```

### 2.3 解析段落中的出场角色（cast）

对于每个大纲段落，系统会解析该段落的 `cast` 字段，确定哪些角色在该段落出场：

```typescript
// 位置：mxmcgi/src/core/writing/writing-service.ts
function resolveCastCharacters(
  characters: CharacterProfile[],
  cast?: string[],
): CharacterProfile[] {
  if (!cast || cast.length === 0) return [];
  const castSet = new Set(cast.map((s) => String(s).trim()).filter(Boolean));
  return characters.filter(
    (c) => castSet.has(c.id) || castSet.has(c.name),
  );
}
```

**解析逻辑**：
- 如果 `cast` 为空或未设置，返回空数组（允许纯镜头/旁白/氛围段落）
- 通过角色的 `id` 或 `name` 匹配
- 返回匹配到的角色列表

### 2.4 在段落生成提示词中使用角色

在生成每个段落时，系统会将角色信息加入到提示词中：

```typescript
// 位置：mxmcgi/src/core/writing/writing-service.ts
// 1. 全局角色画像库（所有段落共享）
const characters = await getCharactersFromParams(params, userId);
const charactersText =
  characters && characters.length > 0
    ? `【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：\n${formatCharactersForPrompt(characters)}`
    : '';

// 2. 本段出场角色（仅该段落使用）
const castCharacters =
  characters && characters.length > 0 ? resolveCastCharacters(characters, section.cast) : [];
const castText =
  section.cast && section.cast.length > 0
    ? castCharacters.length > 0
      ? `【本段出场角色（cast）】（仅这些角色出场/发言；其他角色不得出现）：\n- ${castCharacters.map((c) => `${c.name}(${c.id})`).join('\n- ')}`
      : `【本段出场角色（cast）】（按 name/id 引用未匹配到角色画像，请检查）：\n- ${section.cast.join('\n- ')}`
    : `【本段 cast】未指定（允许纯镜头/旁白/氛围段落，不强制角色出场）`;
```

**提示词结构**：
1. **【角色画像库】**：全局角色设定，所有段落共享，用于保持角色一致性
2. **【本段出场角色（cast）】**：仅该段落出场的角色，其他角色不得出现

**示例提示词片段**：
```
【角色画像库】（全局设定，需保持一致，可用于台词/镜头风格化）：
- id=xxx-xxx-xxx name=张三
  age: 24岁
  appearance: 外貌描述
  voice_description: 声音描述

【本段出场角色（cast）】（仅这些角色出场/发言；其他角色不得出现）：
- 张三(xxx-xxx-xxx)
```

## 三、前端交互流程

### 3.1 创建大纲时

**前端文件**：`moblie/app/create/writing.tsx`

1. 用户选择写作类型（`writing_type`）
2. 如果选择 `outlines`，可以进一步选择：
   - `applyto`：articles / voice-scripts / storyboard-scripts
   - `outline_type`：细分类型（如 story-novel）
3. 系统根据类型判断是否需要生成角色
4. 生成的大纲结果中包含 `characters` 数组

### 3.2 查看/编辑大纲时

**前端文件**：`moblie/app/outline-viewer.tsx`

1. 显示大纲结构
2. 显示生成的角色列表
3. 用户可以：
   - 编辑角色信息
   - 保存角色到用户角色库（`保存角色` 按钮）
   - 引用已有角色（`引用已有` 按钮）
   - 新增角色
4. 每个大纲节点可以编辑 `cast` 字段，指定出场角色

### 3.3 使用大纲写作时

**前端文件**：`moblie/app/create/writing.tsx`

1. 用户选择已有大纲
2. 系统从大纲中提取角色信息：
   ```typescript
   metadata: {
     ...((outlineCharacters.length > 0 ? outlineCharacters : localCharacters).length > 0
       ? { characters: (outlineCharacters.length > 0 ? outlineCharacters : localCharacters) }
       : {}),
   }
   ```
3. 调用 `generateWriting` API，传入：
   - `outlines`：大纲数据（包含 cast 信息）
   - `metadata.characters`：角色信息
   - 或 `characterIds`：角色ID列表（如果使用已有角色）

## 四、角色数据流转

### 4.1 大纲生成流程

```
用户请求生成大纲（cast_character_count > 0, cast_character_ids 为空或不足）
  ↓
调用 CharacterService.generateCharacters(count, prompt)
  ↓
LLM 生成角色数据（CharacterProfile[]，包含 relations）
  ↓
将角色数据传递给 generateOutline
  ↓
在 prompt 中添加角色信息和关系信息
  ↓
LLM 生成大纲（包含 cast 字段，不包含 characters 字段）
  ↓
返回大纲和角色数据
```

### 4.2 使用大纲写作流程

```
用户选择大纲进行写作
  ↓
从 Character 模块或 metadata 获取角色（包括 relations）
  ↓
格式化角色信息为提示词（包含关系信息）
  ↓
解析每个段落的 cast 字段
  ↓
在段落生成提示词中使用角色信息和关系信息
  ↓
生成符合角色设定和关系的内容
```

## 五、关键代码位置

### 后端

1. **角色生成接口**：`mxmcgi/src/core/character/character-service.ts:generateCharacters`
2. **角色生成 API 路由**：`mxmcgi/src/routes/character.ts:POST /api/v1/characters/generate`
3. **大纲生成时的角色处理**：`mxmcgi/src/core/writing/writing-service.ts:1028`（获取或生成角色）
4. **获取角色用于写作**：`mxmcgi/src/core/writing/writing-service.ts:123`
5. **格式化角色信息**：`mxmcgi/src/core/writing/writing-service.ts:145`
6. **解析 cast 字段**：`mxmcgi/src/core/writing/writing-service.ts:161`
7. **在段落生成中使用角色**：`mxmcgi/src/core/writing/writing-service.ts:2468`
8. **relations 字段定义**：
   - `mxmdata/src/interfaces/ICharacterRepository.ts:46`（Character 接口）
   - `mxmcgi/src/core/writing/type.ts:70`（CharacterProfile 接口）
   - `mxmdata/src/database/migrations/add_character_relations.sql`（数据库迁移）

### 前端

1. **创建大纲**：`moblie/app/create/writing.tsx`
2. **查看/编辑大纲**：`moblie/app/outline-viewer.tsx`
3. **使用大纲写作**：`moblie/app/create/writing.tsx:1575`

## 六、总结

角色在大纲写作流程中的作用：

1. **创建阶段**：
   - 角色生成已独立为单独接口（`POST /api/v1/characters/generate`）
   - 大纲生成时如果需要角色，会自动调用角色生成接口
   - 支持用户引用已有角色或自动生成新角色
   - 自动推断角色之间的关系（relations 字段）

2. **编辑阶段**：用户可以编辑、保存、引用角色，并在大纲节点中指定出场角色

3. **写作阶段**：角色信息（包括关系）被格式化为提示词，确保生成的内容符合角色设定和关系，每个段落根据 `cast` 字段确定出场角色

这样的设计确保了：
- 角色生成和大纲生成的职责分离（单一职责原则）
- 角色信息的一致性（全局角色画像库）
- 角色关系的支持（relations 字段）
- 段落级别的角色控制（cast 字段）
- 角色信息的可复用性（保存到 Character 模块）
- 向后兼容性（支持从 metadata 获取角色）
