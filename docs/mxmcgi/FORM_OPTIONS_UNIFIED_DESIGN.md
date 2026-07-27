# 表单选项统一设计方案

## 一、当前情况分析

### Graph 当前设计（已实现）

**数据结构：**
```typescript
// 扁平对象结构
export interface FormOptionsConfig {
  [key: string]: FormOption[];  // key 是字段名，value 是选项数组
}

export interface FormOption {
  value: string;
  label: string;
  labelEn?: string;
}
```

**返回格式：**
```json
{
  "success": true,
  "data": {
    "graphType": "photograph",
    "type": "landscape",
    "language": "zh",
    "options": {
      "timeOfDay": [
        { "value": "dawn", "label": "清晨", "labelEn": "Dawn" },
        { "value": "noon", "label": "正午", "labelEn": "Noon" }
      ],
      "weather": [...],
      "season": [...]
    }
  }
}
```

**特点：**
- ✅ 简单直接，适合 select 类型字段
- ✅ 前端容易处理
- ✅ 已在实际使用中验证
- ❌ 只支持 select 类型
- ❌ 缺少字段元数据（type, placeholder, required 等）

### Writing 需求分析

**需要的字段类型：**
- `select`：下拉选择（如：立场、语调）
- `multi-select`：多选（如：关键要素）
- `text`：单行文本（如：目标职位）
- `textarea`：多行文本（如：写作动机）
- `number`：数字（如：场景数量、角色数量）

**需要的元数据：**
- `label`：字段标签
- `type`：字段类型
- `placeholder`：占位符
- `required`：是否必填
- `helpText`：帮助文本

## 二、统一方案设计

### 方案选择：扩展 Graph 的设计（推荐）

**理由：**
1. ✅ 保持 API 返回格式一致
2. ✅ 不破坏 Graph 现有代码
3. ✅ 向后兼容
4. ✅ 前端可以统一处理
5. ✅ 逐步迁移，风险低

### 2.1 统一类型定义

```typescript
// src/core/shared/formOptions.ts（新建共享模块）

/**
 * 表单选项（用于 select 类型）
 */
export interface FormOption {
  value: string;
  label: string;
  labelEn?: string;
}

/**
 * 字段元数据（扩展信息）
 */
export interface FieldMetadata {
  type: 'select' | 'multi-select' | 'text' | 'textarea' | 'number';
  label: string;
  labelEn?: string;
  placeholder?: string;
  placeholderEn?: string;
  required?: boolean;
  helpText?: string;
  helpTextEn?: string;
  min?: number;  // 用于 number 类型
  max?: number;  // 用于 number 类型
}

/**
 * 统一的表单选项配置
 * 
 * 兼容两种格式：
 * 1. 简单格式（Graph 当前使用）：{ fieldName: FormOption[] }
 * 2. 扩展格式（Writing 使用）：{ fieldName: FormOption[], _metadata: { fieldName: FieldMetadata } }
 */
export interface FormOptionsConfig {
  // 字段选项（select 类型直接是数组，其他类型为空数组或 undefined）
  [key: string]: FormOption[] | FieldMetadata | undefined;
  
  // 元数据（可选，用于非 select 类型字段）
  _metadata?: {
    [fieldName: string]: FieldMetadata;
  };
}
```

### 2.2 向后兼容的辅助函数

```typescript
// src/core/shared/formOptions.ts

/**
 * 检查字段是否为 select 类型（兼容 Graph 的简单格式）
 */
export function isSelectField(
  config: FormOptionsConfig,
  fieldName: string
): boolean {
  const value = config[fieldName];
  return Array.isArray(value) && value.length > 0;
}

/**
 * 获取字段元数据
 */
export function getFieldMetadata(
  config: FormOptionsConfig,
  fieldName: string
): FieldMetadata | null {
  // 优先从 _metadata 获取
  if (config._metadata && config._metadata[fieldName]) {
    return config._metadata[fieldName];
  }
  
  // 如果是 select 类型，从选项数组推断
  if (isSelectField(config, fieldName)) {
    return {
      type: 'select',
      label: fieldName, // 默认使用字段名
    };
  }
  
  return null;
}

/**
 * 获取字段类型
 */
export function getFieldType(
  config: FormOptionsConfig,
  fieldName: string
): 'select' | 'multi-select' | 'text' | 'textarea' | 'number' {
  const metadata = getFieldMetadata(config, fieldName);
  if (metadata) {
    return metadata.type;
  }
  
  // 默认：如果有选项数组，则是 select
  if (isSelectField(config, fieldName)) {
    return 'select';
  }
  
  // 默认类型
  return 'text';
}
```

### 2.3 Writing 配置示例（使用统一格式）

```typescript
// src/core/writing/wtconfigs/articles.ts

import type { FormOptionsConfig, FieldMetadata } from '../../shared/formOptions';

export const articlesFormOptionsZh: FormOptionsConfig = {
  // Select 类型字段（与 Graph 格式一致）
  stance: [
    { value: 'neutral', label: '中立客观', labelEn: 'Neutral' },
    { value: 'supportive', label: '支持赞同', labelEn: 'Supportive' },
    { value: 'critical', label: '批判质疑', labelEn: 'Critical' },
  ],
  tone: [
    { value: 'formal', label: '正式严谨', labelEn: 'Formal' },
    { value: 'casual', label: '轻松随意', labelEn: 'Casual' },
    { value: 'professional', label: '专业权威', labelEn: 'Professional' },
  ],
  length: [
    { value: 'short', label: '短篇（500-1000字）', labelEn: 'Short (500-1000 words)' },
    { value: 'medium', label: '中篇（1000-3000字）', labelEn: 'Medium (1000-3000 words)' },
    { value: 'long', label: '长篇（3000字以上）', labelEn: 'Long (3000+ words)' },
  ],
  key_elements: [
    { value: 'data', label: '数据支撑', labelEn: 'Data Support' },
    { value: 'examples', label: '案例说明', labelEn: 'Examples' },
    { value: 'quotes', label: '引用参考', labelEn: 'Quotes' },
  ],
  
  // 元数据（用于非 select 类型字段）
  _metadata: {
    motivation: {
      type: 'textarea',
      label: '写作动机',
      labelEn: 'Motivation',
      placeholder: '请描述写作的动机和目的...',
      placeholderEn: 'Describe the motivation and purpose...',
      helpText: '说明为什么要写这篇文章，想要达到什么目的',
      helpTextEn: 'Explain why you are writing this article',
    },
    key_elements: {
      type: 'multi-select',
      label: '关键要素',
      labelEn: 'Key Elements',
      helpText: '选择文章需要包含的关键要素',
      helpTextEn: 'Select key elements to include',
    },
  },
};

export function getArticlesFormOptions(language: 'zh' | 'en' = 'zh'): FormOptionsConfig {
  if (language === 'en') {
    // 英文版本：转换 label 和 placeholder
    return {
      stance: articlesFormOptionsZh.stance.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.value,
      })),
      tone: articlesFormOptionsZh.tone.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.value,
      })),
      length: articlesFormOptionsZh.length.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.value,
      })),
      key_elements: articlesFormOptionsZh.key_elements.map(opt => ({
        value: opt.value,
        label: opt.labelEn || opt.value,
      })),
      _metadata: {
        motivation: {
          ...articlesFormOptionsZh._metadata!.motivation,
          label: articlesFormOptionsZh._metadata!.motivation.labelEn || 'Motivation',
          placeholder: articlesFormOptionsZh._metadata!.motivation.placeholderEn,
          helpText: articlesFormOptionsZh._metadata!.motivation.helpTextEn,
        },
        key_elements: {
          ...articlesFormOptionsZh._metadata!.key_elements,
          label: articlesFormOptionsZh._metadata!.key_elements.labelEn || 'Key Elements',
          helpText: articlesFormOptionsZh._metadata!.key_elements.helpTextEn,
        },
      },
    };
  }
  
  return articlesFormOptionsZh;
}
```

### 2.4 大纲（outlines）配置示例

```typescript
// src/core/writing/wtconfigs/outlines.ts

export const outlinesFormOptionsZh: FormOptionsConfig = {
  // Select 类型
  maxDepth: [
    { value: '1', label: '一级标题', labelEn: 'Level 1' },
    { value: '2', label: '二级标题', labelEn: 'Level 2' },
    { value: '3', label: '三级标题', labelEn: 'Level 3' },
    { value: '4', label: '四级标题', labelEn: 'Level 4' },
  ],
  
  // 元数据
  _metadata: {
    expectedNodes: {
      type: 'number',
      label: '期望节点数',
      labelEn: 'Expected Nodes',
      placeholder: '例如：10',
      placeholderEn: 'e.g., 10',
      helpText: '大致控制大纲的篇幅（节点总数）',
      helpTextEn: 'Roughly control the outline length (total nodes)',
      min: 1,
      max: 100,
    },
    prompt: {
      type: 'textarea',
      label: '写作主题',
      labelEn: 'Writing Topic',
      placeholder: '请描述你想要写作的主题和内容...',
      placeholderEn: 'Describe the topic and content you want to write about...',
      required: true,
    },
  },
};
```

### 2.5 电影剧本配置示例

```typescript
// src/core/writing/wtconfigs/movie-scripts.ts

export const movieScriptsFormOptionsZh: FormOptionsConfig = {
  dialogueStyle: [
    { value: 'natural', label: '自然流畅', labelEn: 'Natural' },
    { value: 'dramatic', label: '戏剧化', labelEn: 'Dramatic' },
    { value: 'minimal', label: '极简风格', labelEn: 'Minimal' },
  ],
  genre: [
    { value: 'drama', label: '剧情片', labelEn: 'Drama' },
    { value: 'comedy', label: '喜剧', labelEn: 'Comedy' },
    { value: 'action', label: '动作片', labelEn: 'Action' },
  ],
  
  _metadata: {
    sceneCount: {
      type: 'number',
      label: '场景数量',
      labelEn: 'Scene Count',
      placeholder: '例如：10',
      min: 1,
      max: 100,
    },
    characterCount: {
      type: 'number',
      label: '角色数量',
      labelEn: 'Character Count',
      placeholder: '例如：5',
      min: 1,
      max: 50,
    },
  },
};
```

## 三、API 接口统一

### 3.1 Graph 接口（保持不变）

```typescript
// src/routes/graph.ts

router.get('/getformOptions', (req: Request, res: Response) => {
  // ... 现有代码保持不变
  
  return res.json({
    success: true,
    data: {
      graphType,
      type: subType,
      language,
      options: formOptions,  // 格式：{ fieldName: FormOption[] }
    },
  });
});
```

### 3.2 Writing 接口（统一格式）

```typescript
// src/routes/writing.ts

router.get('/getformOptions', (req: Request, res: Response) => {
  try {
    const { writing_type, lang } = req.query;
    const language = (lang as 'zh' | 'en') || 'zh';

    if (!writing_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing writing_type parameter',
      });
    }

    const formOptions = getWritingFormOptionsForType(
      writing_type as WritingType,
      language
    );

    if (!formOptions) {
      return res.status(404).json({
        success: false,
        error: 'Form options not found',
      });
    }

    // 统一返回格式（与 Graph 保持一致）
    return res.json({
      success: true,
      data: {
        writingType: writing_type,  // 对应 Graph 的 graphType
        language,
        options: formOptions,  // 格式：{ fieldName: FormOption[], _metadata?: {...} }
      },
    });
  } catch (error) {
    // ...
  }
});
```

## 四、前端处理逻辑

### 4.1 统一的前端处理函数

```typescript
// 前端工具函数

interface FormField {
  name: string;
  type: 'select' | 'multi-select' | 'text' | 'textarea' | 'number';
  label: string;
  placeholder?: string;
  required?: boolean;
  helpText?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
}

/**
 * 将后端返回的 FormOptionsConfig 转换为前端可用的字段数组
 */
function parseFormOptions(
  config: FormOptionsConfig,
  language: 'zh' | 'en' = 'zh'
): FormField[] {
  const fields: FormField[] = [];
  const isZh = language === 'zh';
  
  // 遍历所有字段
  Object.keys(config).forEach(fieldName => {
    // 跳过元数据字段
    if (fieldName === '_metadata') return;
    
    const options = config[fieldName] as FormOption[] | undefined;
    const metadata = config._metadata?.[fieldName] as FieldMetadata | undefined;
    
    // 确定字段类型
    let fieldType: FormField['type'] = 'text';
    if (metadata?.type) {
      fieldType = metadata.type;
    } else if (options && options.length > 0) {
      fieldType = 'select';
    }
    
    // 构建字段配置
    const field: FormField = {
      name: fieldName,
      type: fieldType,
      label: metadata?.label || fieldName,
      placeholder: metadata?.placeholder,
      required: metadata?.required,
      helpText: metadata?.helpText,
      options: options?.map(opt => ({
        value: opt.value,
        label: isZh ? opt.label : (opt.labelEn || opt.value),
      })),
      min: metadata?.min,
      max: metadata?.max,
    };
    
    // 多语言处理
    if (!isZh && metadata) {
      if (metadata.labelEn) field.label = metadata.labelEn;
      if (metadata.placeholderEn) field.placeholder = metadata.placeholderEn;
      if (metadata.helpTextEn) field.helpText = metadata.helpTextEn;
    }
    
    fields.push(field);
  });
  
  return fields;
}
```

## 五、迁移计划

### 阶段一：创建共享模块（1周）

1. ✅ 创建 `src/core/shared/formOptions.ts`
2. ✅ 定义统一的类型接口
3. ✅ 实现辅助函数
4. ✅ 更新 Graph 导入路径（可选，保持向后兼容）

### 阶段二：实现 Writing 配置（2周）

1. ✅ 实现 `articles` 配置
2. ✅ 实现 `outlines` 配置
3. ✅ 实现 `movie-scripts` 配置
4. ✅ 实现其他写作类型配置

### 阶段三：API 接口（1周）

1. ✅ 添加 `/api/v1/writing/getformOptions` 接口
2. ✅ 确保返回格式与 Graph 一致

### 阶段四：测试（1周）

1. ✅ 单元测试
2. ✅ 集成测试
3. ✅ 前端兼容性测试

## 六、优势总结

1. **统一性**：Graph 和 Writing 使用相同的数据结构和 API 格式
2. **向后兼容**：Graph 现有代码无需修改
3. **扩展性**：支持 Writing 需要的所有字段类型
4. **前端友好**：前端可以统一处理两种类型的表单
5. **渐进式迁移**：可以逐步完善配置，不影响现有功能

## 七、注意事项

1. **元数据字段名**：使用 `_metadata` 前缀，避免与字段名冲突
2. **类型推断**：如果字段有选项数组但没有元数据，默认推断为 `select` 类型
3. **多语言支持**：所有文本字段都支持中英文
4. **字段顺序**：前端可以根据需要自定义字段显示顺序
