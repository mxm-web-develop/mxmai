// mxmcgi/src/scripts/update-outlines-form-schema.ts
/**
 * 更新 prompt_engineering_config 中 writing/outlines 的 TaskTemplate.formSchema
 *
 * 用法（在 repo 根目录）：
 *   cd mxmcgi
 *   pnpm tsx src/scripts/update-outlines-form-schema.ts
 */

import dotenv from 'dotenv';
import { join } from 'path';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { STRUCTURE_TYPE_CONFIGS } from '../core/writing/outline-structure-types';

const MXMCGI_ROOT = process.cwd();

/** 8 种大纲结构类型的中文说明（与老逻辑 getStructurePromptTemplate 一致，供 systemTemplate 内联） */
function buildStructureTypesBlock(): string {
  const lines: string[] = [
    '',
    '【大纲结构类型说明】',
    '本次采用的结构类型为：${outline_structure_type}。请严格按照下方该类型的结构说明生成大纲。',
    '',
  ];
  const order: (keyof typeof STRUCTURE_TYPE_CONFIGS)[] = [
    'three-act', 'aida', 'pas', 'bab', 'hero-journey', 'imrad', 'hook-value-cta', 'act-scene-storyboard',
  ];
  for (const k of order) {
    const c = STRUCTURE_TYPE_CONFIGS[k];
    if (c?.promptTemplateZh) {
      lines.push(`---\n【${c.nameZh} (${k})】\n${c.promptTemplateZh}\n`);
    }
  }
  return lines.join('\n');
}
const PROJECT_ROOT = join(MXMCGI_ROOT, '..');

// 加载 env（和 seed 脚本保持一致）
dotenv.config({ path: join(MXMCGI_ROOT, '.env') });
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

async function main() {
  // 初始化数据层
  RepositoryFactory.init();
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();

  // 读取当前 writing/outlines 配置（subtype = null）
  const row: any = await repo.findByKey('writing', 'outlines', null);
  if (!row) {
    console.error('❌ 未找到 prompt_engineering_config 记录：scope=writing, type=outlines, subtype=null');
    process.exit(1);
  }

  // 现有 extra 里应该已经有 taskTemplate（来自 seed）；没有就补一个壳
  const extra = (row.extra ?? {}) as Record<string, any>;
  const taskTemplate = (extra.taskTemplate ?? {}) as Record<string, any>;

  // 按当前 Outline 业务实际字段写入 JSON Schema
  // 注意：这里只建模表单字段，不动 Prompt 模板、pipeline、storage 等
  const formSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      // 1. 提示词
      prompt: {
        type: 'string',
        title: '写作需求',
        minLength: 1,
      },


      // 3. 应用于（articles / voice-scripts / storyboard-scripts）
      applyto: {
        type: 'string',
        title: '应用于',
        enum: ['articles', 'voice-scripts', 'storyboard-scripts'],
        'x-enum-labels': ['文章', '口播稿', '分镜脚本'],
      },

      // 4. 细分类型（现有前端枚举，按 applyto 分组）
      outline_type: {
        type: 'string',
        title: '细分类型',
        enum: [
          // articles
          'tech-article',
          'story-novel',
          'academic-paper',
          // voice-scripts
          'sales-voice',
          'emotional-story-voice',
          'knowledge-sharing-voice',
          // storyboard-scripts
          'short-video-storyboard',
          'movie-storyboard',
          'animation-storyboard',
          'music-video-storyboard',
          'commercial-storyboard',
          'documentary-storyboard',
          'motion-graphics-storyboard',
          'educational-storyboard',
          'game-cg-storyboard',
        ],
        'x-enum-labels': [
          '科技文章',
          '故事小说',
          '学术论文',
          '带货口播',
          '情感故事口播',
          '知识分享口播',
          '短视频分镜',
          '电影分镜',
          '动画分镜',
          '音乐视频分镜',
          '广告分镜',
          '纪录片分镜',
          '概念动效分镜',
          '教育片分镜',
          '游戏CG分镜',
        ],
        // 额外扩展：前端可以用这个结构根据 applyto 过滤 outline_type
        'x-options-by-applyto': {
          articles: ['tech-article', 'story-novel', 'academic-paper'],
          'voice-scripts': ['sales-voice', 'emotional-story-voice', 'knowledge-sharing-voice'],
          'storyboard-scripts': [
            'short-video-storyboard',
            'movie-storyboard',
            'animation-storyboard',
            'music-video-storyboard',
            'commercial-storyboard',
            'documentary-storyboard',
            'motion-graphics-storyboard',
            'educational-storyboard',
            'game-cg-storyboard',
          ],
        },
      },

      // 5. 大纲结构类型（与 outline-structure-types.ts 对齐）
      outline_structure_type: {
        type: 'string',
        title: '大纲结构类型',
        description:
        '选择整篇内容的大纲结构：\n' +
        '- 三段式（three-act）：开头-中间-结尾的经典叙事结构，适合绝大部分文章/故事\n' +
        '- AIDA：Attention-Interest-Desire-Action，常用于营销/带货口播\n' +
        '- PAS：Problem-Agitation-Solution，强调提出问题、放大痛点、给出解决方案\n' +
        '- BAB：Before-After-Bridge，对比前后状态，通过“桥梁”说明改变\n' +
        '- 英雄之旅（hero-journey）：主角出发-试炼-回归的故事结构，适合故事/剧情类\n' +
        '- IMRaD：Introduction-Methods-Results-Discussion，标准学术论文结构\n' +
        '- 钩子-干货-CTA（hook-value-cta）：先抓注意力，再给干货，最后行动号召，适合短视频/口播\n' +
        '- 幕式分镜（act-scene-storyboard）：按幕/场景拆分内容，适合电影/动画/CG 分镜',
        enum: [
          'three-act',
          'aida',
          'pas',
          'bab',
          'hero-journey',
          'imrad',
          'hook-value-cta',
          'act-scene-storyboard',
        ],
        'x-enum-labels': [
          '三段式',
          'AIDA',
          'PAS',
          'BAB',
          '英雄之旅',
          'IMRaD',
          '钩子-干货-CTA',
          '幕式分镜',
        ],
        // 额外扩展：哪些 applyto/outline_type 组合可用哪些结构
        'x-available-when': {
          // 三段式：全部可用，前端可忽略
          'three-act': {},
          aida: {
            applyto: 'voice-scripts',
            outline_type: ['sales-voice'],
          },
          pas: {
            applyto: 'voice-scripts',
            outline_type: ['sales-voice'],
          },
          bab: {
            applyto: 'voice-scripts',
            outline_type: ['sales-voice', 'emotional-story-voice'],
          },
          'hero-journey': {
            applyto: ['articles', 'voice-scripts', 'storyboard-scripts'],
            outline_type: [
              'story-novel',
              'emotional-story-voice',
              'movie-storyboard',
              'animation-storyboard',
              'game-cg-storyboard',
            ],
          },
          imrad: {
            applyto: 'articles',
            outline_type: ['academic-paper'],
          },
          'hook-value-cta': {
            applyto: ['voice-scripts', 'storyboard-scripts'],
            outline_type: ['knowledge-sharing-voice', 'short-video-storyboard', 'commercial-storyboard'],
          },
          'act-scene-storyboard': {
            applyto: 'storyboard-scripts',
            outline_type: ['movie-storyboard', 'animation-storyboard', 'game-cg-storyboard'],
          },
        },
      },

      // 6. 大纲深度 / 节点数 / 总字数 / 总时长
      maxDepth: {
        type: 'integer',
        title: '大纲深度',
        minimum: 1,
        maximum: 6,
        default: 3,
      },
      expectedNodes: {
        type: 'integer',
        title: '期望节点数',
        minimum: 0,
      },
      total_textcount: {
        type: 'integer',
        title: '总字数（仅 articles 生效）',
        minimum: 0,
      },
      total_duration_seconds: {
        type: 'integer',
        title: '总时长（秒，仅口播/分镜脚本生效）',
        minimum: 0,
      },

      // 6.1 整体立场/语调（文章与口播可用；分镜不要求整体立场/语调）
      stance: {
        type: 'string',
        title: '整体立场',
        description: '可选。整个大纲的叙述立场，每个节点可继承或微调。',
      },
      tone: {
        type: 'string',
        title: '整体语调',
        description: '可选。整个大纲的语气风格，每个节点可继承或微调。',
      },
      // 6.2 口播稿：语速（字/分钟，CPM）
      speech_rate: {
        type: 'string',
        title: '语速（口播稿）',
        description: '可选。口播稿时使用，单位：字/分钟（CPM），用于约束各节点时长与字数。',
      },
      // 6.3 分镜脚本：节奏（镜头/分钟，SPM）
      rhythm: {
        type: 'string',
        title: '节奏（分镜脚本）',
        description: '可选。分镜脚本时使用，单位：镜头/分钟（SPM），用于约束各节点时长。',
      },

      // 7. 语言
      language: {
        type: 'string',
        title: '语言',
        enum: ['zh', 'en'],
        'x-enum-labels': ['中文', 'English'],
        default: 'zh',
      },

      // 8. 任务名称（前端目前放在 metadata.label）
      label: {
        type: 'string',
        title: '任务名称',
        description: '可选，用于任务列表展示',
      },

      // 9. uid（可以隐藏字段，前端继续自动生成）
      uid: {
        type: 'string',
        title: '任务 UID',
        description: '前端生成的唯一 ID，用于调试/追踪',
      },
    },
    required: ['prompt', 'uid'],
  };

  taskTemplate.formSchema = formSchema;

  // v2 输入管线：先敏感词，再知识库召回（可按需在 Admin 中调整）
  taskTemplate.inputPipeline = [
    { step: 'sensitiveCheck', params: { paths: ['prompt'] } },
    // 默认先不启用 KB；如果你已经有知识库 id，可在 step.params.knowledgeBaseIds 填入
    // { step: 'knowledgeRetrieve', params: { knowledgeBaseIds: ['<kbId1>', '<kbId2>'], limit: 5 } },
  ];
  taskTemplate.outputPipeline = taskTemplate.outputPipeline && Array.isArray(taskTemplate.outputPipeline)
    ? taskTemplate.outputPipeline
    : [{ step: 'noop' }];

  // 如果旧模板里引用了 ${styles}（之前临时加的字段），这里顺手移除，避免变量校验失败
  if (taskTemplate.prompt?.systemTemplate && typeof taskTemplate.prompt.systemTemplate === 'string') {
    if (taskTemplate.prompt.systemTemplate.includes('${styles}')) {
      taskTemplate.prompt.systemTemplate = String(taskTemplate.prompt.systemTemplate)
        .replace(/\n*\s*【写作风格】[^\n]*\$\{styles\}[^\n]*\n*/g, '\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() + '\n';
    }
  }

  // ---------- v2：Prompt 与 outputFormatTemplate（与老逻辑输出一致：结构类型、节点规则、口播/分镜/立场语调）----------
  const RECOMMENDED_OUTPUT_FORMAT =
    '【输出格式要求】\n\n' +
    '【重要】你的回复必须是且仅是一个合法的 JSON 对象：以 { 开头、以 } 结尾，中间不要出现 Markdown 标题（#、##）、章节说明或其它非 JSON 文字，否则系统无法解析。\n\n' +
    '具体要求：\n' +
    '1. 只输出大纲的 JSON，不要用 ```json 包裹，不要截断，不要加任何解释。不要包含 characters 字段。\n' +
    '2. 大纲深度为 ${maxDepth} 级，节点数约 ${expectedNodes}。若为文章且指定了总字数，则总字数 ${total_textcount} 字；若为口播/分镜且指定了总时长，则总时长 ${total_duration_seconds} 秒。\n' +
    '3. 每个节点必含：uid、content、children。建议同时输出 motivation、stance、tone、length、key_elements（无内容可填空字符串或空数组）。口播/分镜可增加 cast（角色，string 数组）、speech_rate、rhythm。若用户指定了整体立场/语调，则每个节点都需输出 stance 和 tone，并继承整体值：stance="${stance}", tone="${tone}"。\n' +
    '4. 口播稿：若指定了语速与总时长，则每个节点需输出 speech_rate，length 以秒为单位并附字数估算；总时长 ${total_duration_seconds} 秒，语速 ${speech_rate} 字/分钟；各节点时长之和约等于总时长（允许 2–5% 浮动）。\n' +
    '5. 分镜脚本：若指定了节奏与总时长，则每个节点需输出 rhythm，length 以秒为单位；总时长 ${total_duration_seconds} 秒，节奏 ${rhythm} 镜头/分钟；各节点时长之和约等于总时长（允许 2–5% 浮动）。\n' +
    '6. 同一层级的节点保持相同字段集合；若某节点有 tone、stance、motivation、key_elements，同级其他节点也需输出这些字段。\n' +
    '7. 根节点 uid 使用：${uid}。\n\n' +
    '示例子节点：\n{"uid":"sub_1","content":"引言：xxx 的背景与问题","tone":"学术性、引入性","stance":"客观陈述","length":80,"motivation":"引出…概述…提出…","key_elements":["要点1","要点2","要点3"],"children":[]}';

  const DEFAULT_SYSTEM_INTRO =
    '你是一位专业的大纲写作助手，擅长为科技类主题创作层次清晰、逻辑严密的大纲。\n\n【大纲设计原则】\n' +
    '1. 层次清晰：主标题、子标题、细节标题层级分明。\n' +
    '2. 逻辑严密：章节之间前后呼应、衔接自然。\n' +
    '3. 重点突出：核心内容与关键观点一目了然。\n' +
    '4. 结构完整：包含引言、正文与结论。\n' +
    '5. 可执行：具体到能直接指导后续写作。\n\n';
  const STRUCTURE_TYPES_BLOCK = buildStructureTypesBlock();

  if (!taskTemplate.prompt) {
    taskTemplate.prompt = {
      systemTemplate: DEFAULT_SYSTEM_INTRO,
      userTemplate: '【用户需求】\n${prompt}',
      outputFormatTemplate: RECOMMENDED_OUTPUT_FORMAT,
    };
  } else {
    // 已有 prompt 时也强制更新 outputFormatTemplate，避免仍是旧的「只输出 JSON」简短版导致模型返回 Markdown
    if (!taskTemplate.prompt.outputFormatTemplate || !String(taskTemplate.prompt.outputFormatTemplate).includes('【重要】')) {
      taskTemplate.prompt.outputFormatTemplate = RECOMMENDED_OUTPUT_FORMAT;
      delete (taskTemplate.prompt as Record<string, unknown>).outputFormatTemplateMarkup; // 让下面重新生成
    }
    if (!taskTemplate.prompt.userTemplate || String(taskTemplate.prompt.userTemplate).trim() === '') {
      taskTemplate.prompt.userTemplate = '【用户需求】\n${prompt}';
    }
    if (!taskTemplate.prompt.systemTemplate || String(taskTemplate.prompt.systemTemplate).trim() === '') {
      taskTemplate.prompt.systemTemplate = DEFAULT_SYSTEM_INTRO;
    }
  }

  if (!taskTemplate.prompt.systemTemplate || typeof taskTemplate.prompt.systemTemplate !== 'string') {
    taskTemplate.prompt.systemTemplate = DEFAULT_SYSTEM_INTRO;
  }

  const sysTpl = String(taskTemplate.prompt.systemTemplate);
  // 避免重复插入：如果已经包含 maxDepth / outline_type 等任一字段，则认为已人工迁移过
  const alreadyHasV2Vars =
    sysTpl.includes('${language}') ||
    sysTpl.includes('${applyto}') ||
    sysTpl.includes('${outline_type}') ||
    sysTpl.includes('${outline_structure_type}') ||
    sysTpl.includes('${maxDepth}') ||
    sysTpl.includes('${expectedNodes}') ||
    sysTpl.includes('${total_textcount}') ||
    sysTpl.includes('${total_duration_seconds}');

  if (!alreadyHasV2Vars) {
    const injected = [
      '【本次任务参数】',
      '请根据以下参数生成大纲（未填写的项可使用合理默认）：',
      '- 语言：${language}',
      '- 应用类型：${applyto}，细分类型：${outline_type}',
      '- 大纲结构类型：${outline_structure_type}',
      '- 期望层级深度：${maxDepth} 级；期望节点数：${expectedNodes}',
      '- 目标总字数（仅文章类）：${total_textcount}',
      '- 目标总时长（秒，仅口播/分镜）：${total_duration_seconds}',
      '- 整体立场：${stance}；整体语调：${tone}',
      '- 语速（口播稿，字/分钟）：${speech_rate}；节奏（分镜，镜头/分钟）：${rhythm}',
    ].join('\n');

    taskTemplate.prompt.systemTemplate = `${sysTpl.trim()}\n\n${injected}\n${STRUCTURE_TYPES_BLOCK}`;
  } else {
    // 已有 8 个基础变量时，仍要确保 stance/tone/speech_rate/rhythm 在 systemTemplate 里，否则表单填了也不会进 prompt
    const currentSys = String(taskTemplate.prompt.systemTemplate || '');
    if (!currentSys.includes('${stance}')) {
      const extraVars = '\n- 整体立场：${stance}；整体语调：${tone}\n- 语速（口播稿，字/分钟）：${speech_rate}；节奏（分镜，镜头/分钟）：${rhythm}\n';
      taskTemplate.prompt.systemTemplate = currentSys.trim() + extraVars;
      delete (taskTemplate.prompt as Record<string, unknown>).systemTemplateMarkup;
    }
  }

  // ---------- v2.1：为现有 outlines 生成 rtext Markup（*Markup 字段），方便 Admin 可视化编辑 ----------
  function escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function buildMarkupFromTemplate(template: string, schema: Record<string, any>): string {
    if (!template) return '';
    const props = (schema.properties ?? {}) as Record<string, any>;
    const requiredArr = Array.isArray(schema.required) ? schema.required.map(String) : [];
    const requiredSet = new Set<string>(requiredArr);

    const re = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    let lastIndex = 0;
    let out = '';
    let m: RegExpExecArray | null;
    while ((m = re.exec(template)) !== null) {
      const varName = m[1];
      out += template.slice(lastIndex, m.index);
      const def = props[varName] && typeof props[varName] === 'object' ? (props[varName] as Record<string, any>) : {};
      const type = typeof def.type === 'string' ? def.type : 'string';
      const label = typeof def.title === 'string' ? def.title : varName;
      const defValueRaw = def.default;
      const required = requiredSet.has(varName);
      const attrParts: string[] = [
        `name="${escapeAttr(varName)}"`,
        `type="${escapeAttr(type)}"`,
        `label="${escapeAttr(String(label))}"`,
        `required="${required ? 'true' : 'false'}"`,
      ];
      if (defValueRaw !== undefined && defValueRaw !== null && String(defValueRaw) !== '') {
        attrParts.push(`defaultValue="${escapeAttr(String(defValueRaw))}"`);
      }
      out += `<template ${attrParts.join(' ')}>${varName}</template>`;
      lastIndex = re.lastIndex;
    }
    out += template.slice(lastIndex);
    return out;
  }

  const promptCfg = (taskTemplate.prompt ?? {}) as Record<string, any>;
  if (!promptCfg.systemTemplateMarkup && typeof promptCfg.systemTemplate === 'string') {
    promptCfg.systemTemplateMarkup = buildMarkupFromTemplate(promptCfg.systemTemplate, formSchema);
  }
  if (!promptCfg.userTemplateMarkup && typeof promptCfg.userTemplate === 'string') {
    promptCfg.userTemplateMarkup = buildMarkupFromTemplate(promptCfg.userTemplate, formSchema);
  }
  if (!promptCfg.outputFormatTemplateMarkup && typeof promptCfg.outputFormatTemplate === 'string') {
    promptCfg.outputFormatTemplateMarkup = buildMarkupFromTemplate(promptCfg.outputFormatTemplate, formSchema);
  }
  taskTemplate.prompt = promptCfg;

  extra.taskTemplate = taskTemplate;

  // upsert 新配置（保持其他字段不变）
  await repo.upsert({
    scope: row.scope,
    type: row.type,
    subtype: row.subtype ?? null,
    rules_i18n: row.rules_i18n,
    output_format_i18n: row.output_format_i18n,
    extra,
    is_active: row.is_active ?? true,
  });

  console.log('✅ 已更新 writing/outlines 的 TaskTemplate.formSchema');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});