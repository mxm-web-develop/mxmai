# Writing 系统升级方案

## 一、升级目标

1. **实现动态参数提取机制**：根据 `writing_type` 动态获取参数列表，类似 Graph 系统
2. **支持类型特定参数**：每个写作类型可以定义自己的参数列表
3. **添加表单选项配置**：支持前端根据写作类型动态生成表单
4. **保持向后兼容**：现有代码和 API 接口继续工作

## 二、架构设计

### 2.1 扩展配置接口

```typescript
// src/core/writing/wtconfigs/index.ts

export interface WritingTypeConfig {
  rules: string;
  outputformat: string;
  
  // 新增：获取该类型需要的参数列表
  getParamsForType?(): string[];
  
  // 新增：获取表单选项配置
  getFormOptions?(language: 'zh' | 'en'): FormOptionsConfig | null;
  
  // 新增：构建用户需求提示词（可选，用于特殊类型）
  buildUserPrompt?(params: WritingGenerateParams, language: 'zh' | 'en'): string;
}
```

### 2.2 参数提取函数

```typescript
// src/core/writing/wtconfigs/index.ts

/**
 * 根据 writing_type 获取该类型需要的参数列表
 * @param writingType 写作类型
 * @returns 参数列表，如果类型不存在或未定义则返回空数组
 */
export function getWritingParamsForType(writingType?: WritingType): string[] {
  const config = getWritingTypeConfig(writingType);
  if (config && typeof config.getParamsForType === 'function') {
    return config.getParamsForType();
  }
  // 默认返回通用参数（向后兼容）
  return ['motivation', 'stance', 'tone', 'length', 'key_elements'];
}

/**
 * 提取业务参数（根据类型动态提取）
 * @param params 完整的参数对象
 * @param writingType 写作类型
 * @returns 提取的业务参数对象
 */
export function extractWritingBusinessParams(
  params: WritingGenerateParams,
  writingType?: WritingType
): Record<string, any> {
  const businessParams: Record<string, any> = {};
  const paramList = getWritingParamsForType(writingType);

  for (const paramName of paramList) {
    if (params[paramName as keyof WritingGenerateParams] !== undefined && 
        params[paramName as keyof WritingGenerateParams] !== null && 
        params[paramName as keyof WritingGenerateParams] !== '') {
      businessParams[paramName] = params[paramName as keyof WritingGenerateParams];
    }
  }

  return businessParams;
}
```

### 2.3 表单选项支持

```typescript
// src/core/writing/wtconfigs/formOptions.ts

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'multi-select' | 'number';
  placeholder?: string;
  required?: boolean;
  options?: FormFieldOption[];
  helpText?: string;
}

export interface FormOptionsConfig {
  fields: FormFieldConfig[];
}

/**
 * 获取写作类型的表单选项配置
 * @param writingType 写作类型
 * @param language 语言
 * @returns 表单选项配置，如果类型不存在或未定义则返回 null
 */
export function getWritingFormOptionsForType(
  writingType?: WritingType,
  language: 'zh' | 'en' = 'zh'
): FormOptionsConfig | null {
  const config = getWritingTypeConfig(writingType);
  if (config && typeof config.getFormOptions === 'function') {
    return config.getFormOptions(language);
  }
  return null;
}
```

## 三、具体实现方案

### 3.1 更新 articles 配置（示例）

```typescript
// src/core/writing/wtconfigs/articles.ts

import type { WritingTypeConfig } from './index';
import type { WritingGenerateParams } from '../type';
import type { FormOptionsConfig } from './formOptions';

export const articlesConfig: WritingTypeConfig = {
  rules: `你是一位专业的文章写作助手...`, // 保持现有内容
  outputformat: `【文章结构要求】...`, // 保持现有内容

  // 新增：定义文章类型需要的参数
  getParamsForType(): string[] {
    return ['motivation', 'stance', 'tone', 'length', 'key_elements'];
  },

  // 新增：表单选项配置
  getFormOptions(language: 'zh' | 'en'): FormOptionsConfig {
    const isZh = language === 'zh';
    
    return {
      fields: [
        {
          name: 'motivation',
          label: isZh ? '写作动机' : 'Motivation',
          type: 'textarea',
          placeholder: isZh ? '请描述写作的动机和目的...' : 'Describe the motivation and purpose...',
          helpText: isZh ? '说明为什么要写这篇文章，想要达到什么目的' : 'Explain why you are writing this article',
        },
        {
          name: 'stance',
          label: isZh ? '立场观点' : 'Stance',
          type: 'select',
          options: [
            { value: 'neutral', label: isZh ? '中立客观' : 'Neutral' },
            { value: 'supportive', label: isZh ? '支持赞同' : 'Supportive' },
            { value: 'critical', label: isZh ? '批判质疑' : 'Critical' },
          ],
          helpText: isZh ? '文章的整体立场和观点倾向' : 'Overall stance and perspective',
        },
        {
          name: 'tone',
          label: isZh ? '语调风格' : 'Tone',
          type: 'select',
          options: [
            { value: 'formal', label: isZh ? '正式严谨' : 'Formal' },
            { value: 'casual', label: isZh ? '轻松随意' : 'Casual' },
            { value: 'professional', label: isZh ? '专业权威' : 'Professional' },
            { value: 'friendly', label: isZh ? '友好亲切' : 'Friendly' },
          ],
        },
        {
          name: 'length',
          label: isZh ? '文章长度' : 'Length',
          type: 'select',
          options: [
            { value: 'short', label: isZh ? '短篇（500-1000字）' : 'Short (500-1000 words)' },
            { value: 'medium', label: isZh ? '中篇（1000-3000字）' : 'Medium (1000-3000 words)' },
            { value: 'long', label: isZh ? '长篇（3000字以上）' : 'Long (3000+ words)' },
          ],
        },
        {
          name: 'key_elements',
          label: isZh ? '关键要素' : 'Key Elements',
          type: 'multi-select',
          options: [
            { value: 'data', label: isZh ? '数据支撑' : 'Data Support' },
            { value: 'examples', label: isZh ? '案例说明' : 'Examples' },
            { value: 'quotes', label: isZh ? '引用参考' : 'Quotes' },
            { value: 'analysis', label: isZh ? '深度分析' : 'Deep Analysis' },
          ],
          helpText: isZh ? '选择文章需要包含的关键要素' : 'Select key elements to include',
        },
      ],
    };
  },
};
```

### 3.2 更新 movie-scripts 配置（示例）

```typescript
// src/core/writing/wtconfigs/movie-scripts.ts

import type { WritingTypeConfig } from './index';
import type { FormOptionsConfig } from './formOptions';

export const movieScriptsConfig: WritingTypeConfig = {
  rules: `你是一位专业的电影剧本写作助手，擅长创作各类电影剧本...`,
  outputformat: `【剧本结构要求】...`,

  // 电影剧本特有的参数
  getParamsForType(): string[] {
    return ['sceneCount', 'characterCount', 'dialogueStyle', 'genre', 'duration', 'targetAudience'];
  },

  getFormOptions(language: 'zh' | 'en'): FormOptionsConfig {
    const isZh = language === 'zh';
    
    return {
      fields: [
        {
          name: 'sceneCount',
          label: isZh ? '场景数量' : 'Scene Count',
          type: 'number',
          placeholder: isZh ? '预计场景数' : 'Expected scene count',
        },
        {
          name: 'characterCount',
          label: isZh ? '角色数量' : 'Character Count',
          type: 'number',
          placeholder: isZh ? '主要角色数' : 'Main character count',
        },
        {
          name: 'dialogueStyle',
          label: isZh ? '对话风格' : 'Dialogue Style',
          type: 'select',
          options: [
            { value: 'natural', label: isZh ? '自然流畅' : 'Natural' },
            { value: 'dramatic', label: isZh ? '戏剧化' : 'Dramatic' },
            { value: 'minimal', label: isZh ? '极简风格' : 'Minimal' },
          ],
        },
        {
          name: 'genre',
          label: isZh ? '电影类型' : 'Genre',
          type: 'select',
          options: [
            { value: 'drama', label: isZh ? '剧情片' : 'Drama' },
            { value: 'comedy', label: isZh ? '喜剧' : 'Comedy' },
            { value: 'action', label: isZh ? '动作片' : 'Action' },
            { value: 'thriller', label: isZh ? '惊悚片' : 'Thriller' },
          ],
        },
        {
          name: 'duration',
          label: isZh ? '时长' : 'Duration',
          type: 'select',
          options: [
            { value: 'short', label: isZh ? '短片（5-15分钟）' : 'Short (5-15 min)' },
            { value: 'medium', label: isZh ? '中片（15-60分钟）' : 'Medium (15-60 min)' },
            { value: 'feature', label: isZh ? '长片（60分钟以上）' : 'Feature (60+ min)' },
          ],
        },
        {
          name: 'targetAudience',
          label: isZh ? '目标受众' : 'Target Audience',
          type: 'select',
          options: [
            { value: 'general', label: isZh ? '大众' : 'General' },
            { value: 'adult', label: isZh ? '成人' : 'Adult' },
            { value: 'youth', label: isZh ? '青少年' : 'Youth' },
          ],
        },
      ],
    };
  },
};
```

### 3.3 更新 resumes 配置（示例）

```typescript
// src/core/writing/wtconfigs/resumes.ts

export const resumesConfig: WritingTypeConfig = {
  rules: `你是一位专业的简历写作助手...`,
  outputformat: `【简历结构要求】...`,

  // 简历特有的参数（不需要 motivation、stance）
  getParamsForType(): string[] {
    return ['workYears', 'industry', 'skillFocus', 'targetPosition', 'highlightAchievements'];
  },

  getFormOptions(language: 'zh' | 'en'): FormOptionsConfig {
    const isZh = language === 'zh';
    
    return {
      fields: [
        {
          name: 'workYears',
          label: isZh ? '工作年限' : 'Work Years',
          type: 'select',
          options: [
            { value: '0-1', label: isZh ? '0-1年' : '0-1 years' },
            { value: '2-5', label: isZh ? '2-5年' : '2-5 years' },
            { value: '5-10', label: isZh ? '5-10年' : '5-10 years' },
            { value: '10+', label: isZh ? '10年以上' : '10+ years' },
          ],
        },
        {
          name: 'industry',
          label: isZh ? '行业领域' : 'Industry',
          type: 'select',
          options: [
            { value: 'tech', label: isZh ? '科技互联网' : 'Technology' },
            { value: 'finance', label: isZh ? '金融' : 'Finance' },
            { value: 'education', label: isZh ? '教育' : 'Education' },
            { value: 'healthcare', label: isZh ? '医疗健康' : 'Healthcare' },
          ],
        },
        {
          name: 'skillFocus',
          label: isZh ? '技能重点' : 'Skill Focus',
          type: 'multi-select',
          options: [
            { value: 'technical', label: isZh ? '技术能力' : 'Technical Skills' },
            { value: 'management', label: isZh ? '管理能力' : 'Management' },
            { value: 'communication', label: isZh ? '沟通能力' : 'Communication' },
          ],
        },
        {
          name: 'targetPosition',
          label: isZh ? '目标职位' : 'Target Position',
          type: 'text',
          placeholder: isZh ? '例如：高级软件工程师' : 'e.g., Senior Software Engineer',
        },
        {
          name: 'highlightAchievements',
          label: isZh ? '突出成就' : 'Highlight Achievements',
          type: 'textarea',
          placeholder: isZh ? '描述主要工作成就...' : 'Describe main achievements...',
        },
      ],
    };
  },
};
```

### 3.4 扩展类型定义

```typescript
// src/core/writing/type.ts

export interface WritingGenerateParams {
  prompt: string;
  writing_type?: WritingType;
  outlines?: Outline[];
  // ... 其他现有参数

  // 通用参数（向后兼容，但建议根据类型使用特定参数）
  motivation?: string;
  stance?: string;
  tone?: string;
  length?: string;
  key_elements?: string[];

  // 类型特定参数（使用 Record 支持扩展）
  typeSpecificParams?: Record<string, any>;
  
  // 或者直接扩展接口（更类型安全）
  // 文章类型参数
  sceneCount?: number;        // 电影剧本
  characterCount?: number;    // 电影剧本
  dialogueStyle?: string;      // 电影剧本
  genre?: string;             // 电影剧本
  
  // 简历类型参数
  workYears?: string;         // 简历
  industry?: string;          // 简历
  skillFocus?: string[];      // 简历
  targetPosition?: string;    // 简历
  
  // ... 其他类型特定参数
  [key: string]: any; // 支持未来扩展
}
```

### 3.5 更新 writing-service.ts

```typescript
// src/core/writing/writing-service.ts

import { 
  getWritingTypeRules, 
  getWritingTypeOutputFormat,
  extractWritingBusinessParams,  // 新增
} from './wtconfigs';

// 在 generateWritingStream 函数中替换硬编码的参数拼接

// 旧代码（硬编码）：
// const writingGuidance: string[] = [];
// if (params.motivation) writingGuidance.push(`动机: ${params.motivation}`);
// ...

// 新代码（动态提取）：
const currentWritingType = params.writing_type || 'articles';
const businessParams = extractWritingBusinessParams(params, currentWritingType);

// 构建参数描述
const writingGuidance: string[] = [];
Object.entries(businessParams).forEach(([key, value]) => {
  // 根据参数名获取中文标签（可以从配置中获取）
  const paramLabel = getParamLabel(key, currentWritingType);
  if (Array.isArray(value)) {
    writingGuidance.push(`${paramLabel}: ${value.join('、')}`);
  } else {
    writingGuidance.push(`${paramLabel}: ${value}`);
  }
});

if (writingGuidance.length > 0) {
  generatePrompt = `${generatePrompt}

【写作指导】（重要：这些是写作参数，用于指导你的写作风格和内容，绝对不要直接输出这些参数本身）：
${writingGuidance.join('\n')}

⚠️ 关键要求：这些参数是用来指导你如何写作的，不是要输出的内容！`;
}
```

## 四、API 接口扩展

### 4.1 添加获取表单选项接口

```typescript
// src/routes/writing.ts

import { getWritingFormOptionsForType } from '../core/writing/wtconfigs';

/**
 * GET /api/v1/writing/getformOptions
 * 获取表单选项配置
 * Query params:
 *   - writing_type: 写作类型（articles, lyrics, movie-scripts 等）
 *   - lang: 语言代码 'zh' | 'en' (默认 'zh')
 */
router.get('/getformOptions', (req: Request, res: Response) => {
  try {
    const { writing_type, lang } = req.query;
    const language = (lang as 'zh' | 'en') || 'zh';

    if (!writing_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing writing_type parameter',
        message: 'Please specify writing_type (e.g., articles, movie-scripts, resumes)',
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
        message: `Form options for writing_type "${writing_type}" are not available`,
      });
    }

    return res.json({
      success: true,
      data: {
        writing_type,
        language,
        options: formOptions,
      },
    });
  } catch (error) {
    console.error('[Writing Route] 获取表单选项失败:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get form options',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
```

## 五、迁移计划

### 阶段一：基础架构升级（1-2周）

1. ✅ 扩展 `WritingTypeConfig` 接口
2. ✅ 实现 `getWritingParamsForType` 函数
3. ✅ 实现 `extractWritingBusinessParams` 函数
4. ✅ 实现 `getWritingFormOptionsForType` 函数
5. ✅ 添加表单选项类型定义

### 阶段二：配置完善（2-3周）

1. ✅ 更新 `articles` 配置（添加参数列表和表单选项）
2. ✅ 完善 `movie-scripts` 配置（添加 rules、outputformat、参数列表）
3. ✅ 完善 `resumes` 配置
4. ✅ 完善 `lyrics` 配置
5. ✅ 完善 `ad-scripts` 配置
6. ✅ 完善 `media-post` 配置
7. ✅ 完善 `reviews` 配置
8. ✅ 完善 `voice-scripts` 配置

### 阶段三：服务层更新（1周）

1. ✅ 更新 `writing-service.ts` 使用动态参数提取
2. ✅ 替换所有硬编码的参数拼接逻辑
3. ✅ 添加参数标签映射（用于显示中文标签）

### 阶段四：API 接口扩展（1周）

1. ✅ 添加 `/api/v1/writing/getformOptions` 接口
2. ✅ 更新 API 文档

### 阶段五：测试和优化（1-2周）

1. ✅ 单元测试
2. ✅ 集成测试
3. ✅ 向后兼容性测试
4. ✅ 性能测试

## 六、向后兼容性

### 6.1 参数兼容

- 如果某个写作类型没有定义 `getParamsForType`，默认使用通用参数列表
- 现有的 `motivation`、`stance`、`tone` 等参数继续支持
- 新参数通过 `typeSpecificParams` 或直接扩展接口支持

### 6.2 API 兼容

- 所有现有 API 接口保持不变
- 新增 `/getformOptions` 接口不影响现有功能
- 如果前端不传 `writing_type`，默认使用 `articles` 类型

## 七、优势总结

1. **灵活性**：每个写作类型可以定义自己的参数
2. **可扩展性**：添加新类型只需配置，无需修改核心代码
3. **类型安全**：TypeScript 类型检查确保参数正确
4. **前端友好**：提供表单选项配置，前端可以动态生成表单
5. **向后兼容**：现有代码和 API 继续工作
6. **统一架构**：与 Graph 系统保持一致的设计模式

## 八、示例：完整的使用流程

### 8.1 前端调用

```typescript
// 1. 获取表单选项
const response = await fetch('/api/v1/writing/getformOptions?writing_type=movie-scripts&lang=zh');
const { data } = await response.json();
// data.options.fields 包含所有表单字段配置

// 2. 动态生成表单
data.options.fields.forEach(field => {
  // 根据 field.type 渲染对应的表单控件
});

// 3. 提交写作请求
const params = {
  prompt: '写一个关于人工智能的科幻电影剧本',
  writing_type: 'movie-scripts',
  sceneCount: 10,
  characterCount: 5,
  dialogueStyle: 'natural',
  genre: 'sci-fi',
  // ... 其他参数
};

await fetch('/api/v1/writing/generate', {
  method: 'POST',
  body: JSON.stringify(params),
});
```

### 8.2 后端处理

```typescript
// 1. 获取参数列表
const paramList = getWritingParamsForType('movie-scripts');
// 返回: ['sceneCount', 'characterCount', 'dialogueStyle', 'genre', 'duration', 'targetAudience']

// 2. 提取业务参数
const businessParams = extractWritingBusinessParams(params, 'movie-scripts');
// 只提取 movie-scripts 类型需要的参数，忽略其他参数

// 3. 构建 prompt
const rules = getWritingTypeRules('movie-scripts');
const outputFormat = getWritingTypeOutputFormat('movie-scripts');
// 使用 rules、businessParams、outputFormat 构建完整的 prompt
```

## 九、注意事项

1. **参数命名规范**：使用 camelCase，保持一致性
2. **配置完整性**：每个写作类型都应该有完整的 rules、outputformat、参数列表
3. **文档更新**：更新 API 文档，说明每个类型的参数
4. **测试覆盖**：确保所有类型的配置都有测试覆盖
5. **性能考虑**：参数提取逻辑应该高效，避免不必要的循环

## 十、后续优化方向

1. **参数验证**：添加参数验证逻辑，确保参数值符合要求
2. **参数默认值**：为某些参数提供默认值
3. **参数依赖**：支持参数之间的依赖关系（例如：选择了某个选项后，显示其他相关字段）
4. **国际化**：完善多语言支持
5. **参数模板**：提供参数模板，用户可以保存常用配置
