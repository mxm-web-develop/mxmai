/**
 * 创建 text/think 和 text/plan 子类型业务配置
 *
 * think subtypes:
 *  - reasoning: 深度推理（Chain-of-Thought）
 *  - analysis: 问题分析
 *  - critique: 批判性分析
 *
 * plan subtypes:
 *  - task-breakdown: 任务拆解
 *  - strategy: 策略规划
 *  - roadmap: 路线图规划
 *
 * 用法：npx tsx src/scripts/create-text-think-plan.ts
 */

import dotenv from 'dotenv';
import { join } from 'path';

const MXMCGI_ROOT = process.cwd();
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

import { RepositoryFactory } from '@mxmai/mxmdata';

interface PromptEngineeringConfig {
  id?: string;
  scope: string;
  type: string;
  subtype: string | null;
  rules_i18n: Record<string, string>;
  output_format_i18n: Record<string, string>;
  form_options_i18n?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

async function upsertConfig(repo: any, config: PromptEngineeringConfig): Promise<void> {
  try {
    await repo.upsert(config);
    console.log(`  ✓ ${config.scope}/${config.type}/${config.subtype} upserted`);
  } catch (e) {
    console.log(`  ✗ ${config.scope}/${config.type}/${config.subtype} error:`, e);
  }
}

// Think subtypes configuration
const thinkConfigs: Omit<PromptEngineeringConfig, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    scope: 'text',
    type: 'think',
    subtype: 'reasoning',
    rules_i18n: {
      zh: `你是一个深度推理引擎，擅长通过逐步思考来分析和解决问题。

你的思维框架：
1. 理解问题：明确要解决的核心问题是什么
2. 分解问题：将复杂问题拆分为可处理的子问题
3. 探索路径：对每个子问题探索多种解决路径
4. 评估选项：比较不同路径的优劣
5. 逐步推导：展示完整的推理链条
6. 得出结论：基于推理给出最终答案

重要：
- 展示思考过程，而不是直接给出答案
- 识别问题中的假设和不确定性
- 考虑边缘情况和反例`,
    },
    output_format_i18n: {
      zh: `# 深度推理分析

## 理解的问题
[简洁描述核心问题]

## 问题分解
- 子问题1: ...
- 子问题2: ...

## 推理过程
[详细的逐步思考过程]

## 评估与选择
[对不同方案的评估]

## 最终结论
[基于推理的答案]

## 不确定性与假设
[列出未确定的假设]`,
    },
    extra: {
      taskTemplate: {
        formSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              title: '主题/问题',
              description: '需要深度思考的主题或问题',
            },
            context: {
              type: 'string',
              title: '背景上下文',
              description: '相关的背景信息（可选）',
            },
            depth_level: {
              type: 'string',
              title: '思考深度',
              enum: ['surface', 'moderate', 'deep', 'exhaustive'],
              default: 'moderate',
            },
          },
          required: ['topic'],
        },
        prompt: {
          systemTemplate: '',
          userTemplate: '主题：{{topic}}\n\n背景：{{context}}\n\n思考深度：{{depth_level}}',
          outputFormatTemplate: '',
        },
      },
    },
    is_active: true,
  },
  {
    scope: 'text',
    type: 'think',
    subtype: 'analysis',
    rules_i18n: {
      zh: `你是一个结构化分析专家，擅长对事物进行全面深入的分析。

分析维度：
1. 本质定义：这是什么，本质特征是什么
2. 结构拆解：组成部分及其关系
3. 因果分析：产生原因和可能影响
4. 关联分析：与其它事物的联系
5. 价值评估：优劣、意义、影响
6. 趋势判断：发展方向和演变

输出要求：
- 结构化呈现分析结果
- 使用清晰的分层标题
- 关键发现突出显示`,
    },
    output_format_i18n: {
      zh: `# 结构化分析报告

## 本质定义
[事物质的定义和核心特征]

## 结构拆解
[组成部分及相互关系]

## 因果分析
### 产生原因
[主要因素]
### 可能影响
[直接/间接影响]

## 关联分析
[与其它事物的联系]

## 价值评估
[优劣分析]

## 关键发现
[最重要的3-5个发现]

## 趋势判断
[发展方向预测]`,
    },
    extra: {
      taskTemplate: {
        formSchema: {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              title: '分析对象',
              description: '需要分析的主体',
            },
            focus_areas: {
              type: 'array',
              items: { type: 'string' },
              title: '重点分析方向',
              description: '指定要重点关注的方面（可选）',
            },
            perspective: {
              type: 'string',
              title: '分析视角',
              enum: ['客观中立', '优势视角', '问题视角', '发展视角'],
              default: '客观中立',
            },
          },
          required: ['subject'],
        },
        prompt: {
          systemTemplate: '',
          userTemplate: '分析对象：{{subject}}\n\n重点方向：{{focus_areas}}\n\n分析视角：{{perspective}}',
          outputFormatTemplate: '',
        },
      },
    },
    is_active: true,
  },
  {
    scope: 'text',
    type: 'think',
    subtype: 'critique',
    rules_i18n: {
      zh: `你是一个批判性思维专家，擅长对观点、方案或论证进行深度审视。

审视维度：
1. 论点清晰度：核心主张是否明确
2. 证据质量：支撑论点的证据是否充分、可靠
3. 逻辑一致性：论证过程是否有逻辑漏洞
4. 假设检验：隐含假设是否合理
5. 反驳考虑：有哪些可能的反对意见
6. 改进建议：如何加强论证

态度要求：
- 客观公正，不预设立场
- 建设性批评，提供改进方向
- 区分事实与观点`,
    },
    output_format_i18n: {
      zh: `# 批判性审视报告

## 核心主张
[要审视的主要观点或方案]

## 论点分析
### 清晰度评估
[论点是否明确]
### 证据评估
[证据的充分性和可靠性]

## 逻辑审查
[论证过程的逻辑性，有无漏洞]

## 假设检验
[隐含假设及合理性评估]

## 反驳与争议
[可能的反对意见]

## 改进建议
[如何加强论证或方案]

## 总体评价
[平衡的最终判断]`,
    },
    extra: {
      taskTemplate: {
        formSchema: {
          type: 'object',
          properties: {
            claim: {
              type: 'string',
              title: '待审视观点/方案',
              description: '需要批判性分析的观点、论证或方案',
            },
            claim_type: {
              type: 'string',
              title: '类型',
              enum: ['论证', '方案', '计划', '理论', '其它'],
              default: '论证',
            },
            scrutiny_focus: {
              type: 'array',
              items: { type: 'string' },
              title: '重点审视点',
              description: '指定要重点审视的方面（可选）',
            },
          },
          required: ['claim'],
        },
        prompt: {
          systemTemplate: '',
          userTemplate: '待审视内容：{{claim}}\n\n类型：{{claim_type}}\n\n重点审视：{{scrutiny_focus}}',
          outputFormatTemplate: '',
        },
      },
    },
    is_active: true,
  },
];

// Plan subtypes configuration
const planConfigs: Omit<PromptEngineeringConfig, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    scope: 'text',
    type: 'plan',
    subtype: 'task-breakdown',
    rules_i18n: {
      zh: `你是一个任务规划专家，擅长将复杂目标拆解为可执行的步骤。

拆解原则：
1. 完整性：覆盖目标的所有方面
2. 层次性：由粗到细，层层展开
3. 可执行性：每个步骤可独立执行
4. 依赖关系：明确步骤间的先后顺序
5. 时间估计：为每个步骤提供时间估计
6. 资源需求：标注所需资源和条件

输出格式：
- 使用清晰的编号和缩进
- 关键里程碑单独标注
- 风险点提示`,
    },
    output_format_i18n: {
      zh: `# 任务拆解方案

## 目标
[要实现的总体目标]

## 拆解结构
### 阶段1: [阶段名称]
- 步骤1.1: [具体任务]
  - 时间: [估计时长]
  - 依赖: [前置条件]
  - 产出: [交付物]
- 步骤1.2: ...

### 阶段2: ...

## 关键里程碑
| 里程碑 | 时间 | 验收标准 |
|--------|------|----------|
| ...    | ...  | ...      |

## 资源需求
[人力、技术、资金等]

## 风险提示
[可能遇到的问题及应对]`,
    },
    extra: {
      taskTemplate: {
        formSchema: {
          type: 'object',
          properties: {
            goal: {
              type: 'string',
              title: '目标',
              description: '要实现的最终目标',
            },
            constraint: {
              type: 'string',
              title: '约束条件',
              description: '时间、资源、预算等限制',
            },
            granularity: {
              type: 'string',
              title: '拆解粒度',
              enum: ['粗略', '中等', '详细'],
              default: '中等',
            },
          },
          required: ['goal'],
        },
        prompt: {
          systemTemplate: '',
          userTemplate: '目标：{{goal}}\n\n约束条件：{{constraint}}\n\n拆解粒度：{{granularity}}',
          outputFormatTemplate: '',
        },
      },
    },
    is_active: true,
  },
  {
    scope: 'text',
    type: 'plan',
    subtype: 'strategy',
    rules_i18n: {
      zh: `你是一个战略规划专家，擅长分析形势并制定策略。

战略分析框架：
1. 形势评估：当前状态、机会与威胁
2. 目标明确：短期、中期、长期目标
3. 路径设计：达成目标的多种可能路径
4. 资源分配：有限资源的最优配置
5. 风险对冲：潜在风险的应对策略
6. 敏捷调整：如何根据变化调整策略

核心原则：
- 差异化竞争，找到独特优势
- 可持续性，考虑长期影响
- 可执行性，策略需可落地`,
    },
    output_format_i18n: {
      zh: `# 战略规划报告

## 战略背景
[当前形势和挑战]

## 战略目标
### 愿景
[长期愿景]
### 中期目标
[3-5年目标]
### 短期目标
[1年内目标]

## 战略选项
### 选项A
[方案描述，优劣势分析]
### 选项B
...

## 推荐战略
[综合分析后的建议]

## 战略举措
[具体行动项]

## 资源规划
[所需投入]

## 风险与对冲
[主要风险及应对]

## 里程碑
[关键时间节点]`,
    },
    extra: {
      taskTemplate: {
        formSchema: {
          type: 'object',
          properties: {
            situation: {
              type: 'string',
              title: '当前形势',
              description: '面临的形势和挑战',
            },
            ambition: {
              type: 'string',
              title: '战略愿景',
              description: '希望达成的愿景',
            },
            timeframe: {
              type: 'string',
              title: '规划周期',
              enum: ['1年以内', '1-3年', '3-5年', '5年以上'],
              default: '1-3年',
            },
            competitive_advantage: {
              type: 'string',
              title: '竞争优势',
              description: '现有的或计划建立的竞争优势',
            },
          },
          required: ['situation', 'ambition'],
        },
        prompt: {
          systemTemplate: '',
          userTemplate: '当前形势：{{situation}}\n\n战略愿景：{{ambition}}\n\n规划周期：{{timeframe}}\n\n竞争优势：{{competitive_advantage}}',
          outputFormatTemplate: '',
        },
      },
    },
    is_active: true,
  },
  {
    scope: 'text',
    type: 'plan',
    subtype: 'roadmap',
    rules_i18n: {
      zh: `你是一个路线图规划专家，擅长制定长期演进路线图。

路线图要素：
1. 现状定位：起点在哪里
2. 目标状态：要去向何方
3. 发展阶段：划分合理的演进阶段
4. 关键节点：每个阶段的里程碑
5. 依赖关系：阶段间的逻辑关系
6. 演进指标：如何衡量进展

可视化：
- 使用时间轴结构
- 阶段分明，节点清晰
- 标注当前所处位置`,
    },
    output_format_i18n: {
      zh: `# 演进路线图

## 现状定位
[当前状态和基础条件]

## 目标状态
[最终要达到的状态]

## 发展阶段

### 阶段一：奠基期 (0-6个月)
**目标**: [阶段目标]
**关键任务**:
- [ ] 任务1
- [ ] 任务2
**里程碑**: [可验证的成果]
**验收标准**: [如何判断阶段完成]

### 阶段二：发展期 (6-18个月)
...

### 阶段三：成熟期 (18个月以后)
...

## 路线图总览
[时间轴可视化]
起点 ----里程碑A----里程碑B----里程碑C---- 终点
       |           |           |
      阶段一      阶段二      阶段三

## 关键依赖
[跨阶段的依赖关系]

## 演进指标
[衡量进展的关键指标]`,
    },
    extra: {
      taskTemplate: {
        formSchema: {
          type: 'object',
          properties: {
            current_state: {
              type: 'string',
              title: '现状',
              description: '当前的状态和基础',
            },
            target_state: {
              type: 'string',
              title: '目标状态',
              description: '最终要达到的状态',
            },
            horizon: {
              type: 'string',
              title: '规划视野',
              enum: ['半年', '1年', '2年', '3年', '5年'],
              default: '2年',
            },
            phase_count: {
              type: 'string',
              title: '阶段数量',
              enum: ['2阶段', '3阶段', '4阶段', '5阶段'],
              default: '3阶段',
            },
          },
          required: ['current_state', 'target_state'],
        },
        prompt: {
          systemTemplate: '',
          userTemplate: '现状：{{current_state}}\n\n目标状态：{{target_state}}\n\n规划视野：{{horizon}}\n\n阶段数量：{{phase_count}}',
          outputFormatTemplate: '',
        },
      },
    },
    is_active: true,
  },
];

async function main() {
  console.log('Initializing repository...\n');
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  console.log('Creating think subtypes...');
  for (const config of thinkConfigs) {
    try {
      await upsertConfig(repo, config);
    } catch (e) {
      console.log(`  ✗ ${config.scope}/${config.type}/${config.subtype} error:`, e);
    }
  }

  console.log('\nCreating plan subtypes...');
  for (const config of planConfigs) {
    try {
      await upsertConfig(repo, config);
    } catch (e) {
      console.log(`  ✗ ${config.scope}/${config.type}/${config.subtype} error:`, e);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
