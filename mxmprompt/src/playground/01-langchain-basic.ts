/**
 * LangChain 基础演示
 * 
 * 本文件演示 LangChain 的核心概念和基本用法，适用于教学场景。
 * 
 * 学习目标：
 * 1. 理解 LangChain 的基本架构
 * 2. 掌握如何初始化和使用 LLM（大语言模型）
 * 3. 学习提示词模板的使用
 * 4. 理解链式调用（Chain）的概念
 * 5. 掌握条件判断链（Conditional Chain）的实现
 * 6. 掌握流式输出的实现
 * 
 * 前置知识：
 * - 了解 JavaScript/TypeScript 基础
 * - 了解异步编程（async/await）
 * - 了解环境变量配置
 * 
 * 环境要求：
 * - 需要配置 DEERAPI_BASE_URL 和 DEERAPI_API_KEY 环境变量
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnableBranch, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DeerAPIChatModel } from './utils/deerapi-llm';
import dotenv from 'dotenv';

dotenv.config();

// ==================== 1. 初始化 LLM ====================

/**
 * 初始化 DeerAPI LLM（大语言模型）实例
 * 
 * 功能说明：
 * - LLM（Large Language Model）是大语言模型的简称，如 GPT-4、Claude 等
 * - DeerAPI 是一个统一的 API 接口，可以调用多种大模型
 * - 通过 fromEnv() 方法从环境变量自动读取配置
 * 
 * 参数说明：
 * - modelName: 模型名称，如 'gpt-4o-mini'、'gpt-4' 等
 * 
 * 返回值：
 * - DeerAPIChatModel 实例，可以用于调用大模型
 * 
 * 使用示例：
 * ```typescript
 * const llm = initDeerAPILLM();
 * const response = await llm.invoke('你好');
 * console.log(response.content);
 * ```
 */
function initDeerAPILLM() {
  return DeerAPIChatModel.fromEnv('gpt-4o-mini');
}

/**
 * 初始化 LLM（兼容旧接口）
 * 
 * 说明：为了保持向后兼容，保留此函数名
 * 实际功能与 initDeerAPILLM() 相同
 */
function initOpenAILLM() {
  return initDeerAPILLM();
}

/**
 * 初始化 Anthropic LLM（使用 DeerAPI）
 * 
 * 功能说明：
 * - 如果 DeerAPI 支持 Anthropic 的模型（如 Claude），可以通过切换模型名称来使用
 * - 模型名称需要根据 DeerAPI 支持的模型列表来选择
 * 
 * 注意：实际使用时需要确认 DeerAPI 是否支持该模型
 */
function initAnthropicLLM() {
  // 如果 DeerAPI 支持 Anthropic 模型，可以切换模型名称
  return DeerAPIChatModel.fromEnv('claude-3-5-sonnet-20241022');
}

// ==================== 2. 基础调用 ====================

/**
 * 演示1：基础 LLM 调用
 * 
 * 功能说明：
 * - 这是最简单的 LLM 使用方式，直接传入文本提示词，获取模型响应
 * - invoke() 方法是同步调用，会等待模型返回完整结果
 * 
 * 学习要点：
 * 1. LLM 的基本调用方式
 * 2. 如何获取模型的响应内容
 * 3. 响应对象的结构（response.content）
 * 
 * 适用场景：
 * - 简单的问答
 * - 文本生成
 * - 不需要复杂处理的场景
 * 
 * 执行流程：
 * 1. 创建 LLM 实例
 * 2. 调用 invoke() 方法，传入提示词
 * 3. 等待模型处理并返回结果
 * 4. 从响应对象中提取内容
 */
async function basicCall() {
  console.log('\n=== 演示1: 基础调用（使用 DeerAPI）===\n');
  console.log('说明：这是最简单的 LLM 调用方式，直接传入提示词获取响应\n');

  // 步骤1: 初始化 LLM 实例
  const llm = initDeerAPILLM();

  // 步骤2: 调用 invoke() 方法，传入提示词
  // invoke() 是异步方法，会返回一个 Promise
  const response = await llm.invoke('请用一句话介绍什么是 LangChain');

  // 步骤3: 从响应对象中提取内容
  // response 是一个 BaseMessage 对象，content 属性包含模型的响应文本
  console.log('模型响应:', response.content);
  console.log('\n--- 演示完成 ---\n');
}

// ==================== 3. 提示词模板 ====================

/**
 * 演示2：提示词模板（Prompt Template）
 * 
 * 功能说明：
 * - 提示词模板允许我们创建可复用的提示词结构
 * - 使用占位符（如 {userPrompt}）来动态填充内容
 * - 这样可以避免重复编写相似的提示词
 * 
 * 学习要点：
 * 1. PromptTemplate 的作用和优势
 * 2. 如何使用占位符创建模板
 * 3. format() 方法如何填充模板
 * 4. 模板在实际业务中的应用场景
 * 
 * 适用场景：
 * - 需要重复使用相似提示词结构的场景
 * - 需要根据用户输入动态生成提示词的场景
 * - 提示词优化、格式化等业务场景
 * 
 * 执行流程：
 * 1. 使用 PromptTemplate.fromTemplate() 创建模板
 * 2. 使用 format() 方法填充占位符
 * 3. 将填充后的提示词传给 LLM
 * 4. 获取并展示结果
 */
async function promptTemplateDemo() {
  console.log('\n=== 演示2: 提示词模板（使用 DeerAPI）===\n');
  console.log('说明：提示词模板允许我们创建可复用的提示词结构\n');

  // 步骤1: 初始化 LLM
  const llm = initDeerAPILLM();

  // 步骤2: 创建提示词模板
  // PromptTemplate.fromTemplate() 用于创建模板
  // 使用 {变量名} 作为占位符，后续可以通过 format() 方法填充
  const template = PromptTemplate.fromTemplate(`
你是一个专业的 AI 图像生成提示词优化专家。

用户原始提示词: {userPrompt}
渲染参数: {renderParams}

请根据以上信息，生成一个精准、详细的 Flux 模型提示词。
要求：
1. 保持用户原始意图
2. 结合渲染参数
3. 使用专业摄影术语
4. 提示词长度控制在 100-200 字
5. 使用英文输出

优化后的提示词:
  `);

  // 步骤3: 填充模板
  // format() 方法接收一个对象，键名对应模板中的占位符
  // 返回填充后的完整提示词字符串
  const prompt = await template.format({
    userPrompt: 'portrait photography',  // 填充 {userPrompt} 占位符
    renderParams: '景别: 半身照, 镜头: 35mm, 光线: 自然光, 光圈: f/1.8, '  // 填充 {renderParams} 占位符
  });

  console.log('填充后的提示词:\n', prompt);
  console.log('\n--- 调用模型 ---\n');

  // 步骤4: 使用填充后的提示词调用 LLM
  const response = await llm.invoke(prompt);
  
  console.log('优化后的提示词:\n', response.content);
  console.log('\n--- 演示完成 ---\n');
}

// ==================== 4. 链式调用 ====================

/**
 * 演示3：链式调用（Chain）
 * 
 * 功能说明：
 * - Chain（链）是 LangChain 的核心概念，用于将多个步骤串联起来
 * - RunnableSequence 可以将多个组件按顺序连接
 * - 每个组件的输出作为下一个组件的输入
 * 
 * 学习要点：
 * 1. Chain 的概念和作用
 * 2. RunnableSequence 的使用方法
 * 3. 如何将提示词模板、LLM、输出解析器组合成链
 * 4. 链式调用的优势（代码复用、逻辑清晰）
 * 
 * 适用场景：
 * - 需要多步骤处理的场景
 * - 需要格式化输出的场景
 * - 复杂的业务逻辑处理
 * 
 * 执行流程：
 * 1. 创建提示词模板（第一步）
 * 2. 创建 LLM 实例（第二步）
 * 3. 创建输出解析器（第三步）
 * 4. 使用 RunnableSequence 将三者串联
 * 5. 调用链并获取结果
 * 
 * 链的结构：
 * 输入 → 提示词模板 → LLM → 输出解析器 → 最终结果
 */
async function chainDemo() {
  console.log('\n=== 演示3: 链式调用（使用 DeerAPI）===\n');
  console.log('说明：链式调用可以将多个步骤串联，实现复杂的数据处理流程\n');

  // 步骤1: 初始化 LLM
  const llm = initDeerAPILLM();
  
  // 步骤2: 创建输出解析器
  // StringOutputParser 用于将 LLM 的响应转换为纯字符串
  // 这样可以方便后续处理，而不需要手动提取 response.content
  const outputParser = new StringOutputParser();

  // 步骤3: 创建链（Chain）
  // RunnableSequence.from() 用于创建顺序执行的链
  // 数组中的每个元素按顺序执行，前一个的输出作为后一个的输入
  const chain = RunnableSequence.from([
    // 第一步：提示词模板
    // 接收输入参数，生成完整的提示词
    PromptTemplate.fromTemplate(`
将以下中文描述转换为英文的 AI 图像生成提示词。

中文描述: {chineseDescription}

要求：
1. 使用专业摄影术语
2. 描述清晰具体
3. 长度控制在 50-100 字

英文提示词:
    `),
    // 第二步：LLM
    // 接收提示词，调用大模型生成响应
    llm,
    // 第三步：输出解析器
    // 将 LLM 的响应对象转换为纯字符串
    outputParser
  ]);

  console.log('链结构: 输入 → 提示词模板 → LLM → 输出解析器 → 结果\n');

  // 步骤4: 调用链
  // invoke() 方法接收输入参数，返回最终处理结果
  // 由于使用了 StringOutputParser，结果直接是字符串，不需要再提取 content
  const result = await chain.invoke({
    chineseDescription: '一张近景人像照片，使用标准镜头，自然光线，背景虚化'
  });

  console.log('转换结果:', result);
  console.log('\n--- 演示完成 ---\n');
}

// ==================== 5. 多步骤链式调用 ====================

/**
 * 演示4：多步骤链式调用
 * 
 * 功能说明：
 * - 演示如何创建更复杂的多步骤处理链
 * - 每个步骤可以独立定义，然后组合在一起
 * - 支持在链中执行异步操作和数据处理
 * 
 * 学习要点：
 * 1. 如何定义独立的处理步骤
 * 2. 如何在链中执行自定义逻辑
 * 3. 如何将多个步骤组合成完整流程
 * 4. 异步操作在链中的处理方式
 * 
 * 适用场景：
 * - 需要分阶段处理的复杂业务
 * - 需要中间结果进行判断或处理的场景
 * - 多步骤数据转换和处理
 * 
 * 执行流程：
 * 1. 定义第一个处理步骤（分析用户意图）
 * 2. 定义第二个处理步骤（生成优化提示词）
 * 3. 创建组合链，在中间执行自定义逻辑
 * 4. 调用完整链并获取结果
 * 
 * 链的结构：
 * 输入 → 分析步骤 → [自定义逻辑：提取分析结果] → 优化步骤 → 最终结果
 */
async function multiStepChainDemo() {
  console.log('\n=== 演示4: 多步骤链式调用（使用 DeerAPI）===\n');
  console.log('说明：演示如何创建复杂的多步骤处理链，每个步骤可以独立定义\n');

  // 步骤1: 初始化 LLM
  const llm = initDeerAPILLM();

  // 步骤2: 定义第一个处理步骤 - 分析用户意图
  // 这个步骤接收用户提示词，分析并提取关键信息
  const analyzeStep = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
分析以下用户提示词，提取关键信息。

用户提示词: {userPrompt}

请提取：
1. 主体（人物/物体）
2. 场景
3. 风格
4. 技术参数

分析结果:
    `),
    llm  // 调用 LLM 进行分析
  ]);

  // 步骤3: 定义第二个处理步骤 - 生成优化提示词
  // 这个步骤基于分析结果和渲染参数，生成优化的提示词
  const optimizeStep = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
基于以下分析结果，生成优化的提示词。

分析结果: {analysis}
渲染参数: {renderParams}

优化后的提示词:
    `),
    llm  // 调用 LLM 生成优化提示词
  ]);

  // 步骤4: 组合两个步骤，创建完整链
  // 在链中可以执行自定义的异步逻辑
  const fullChain = RunnableSequence.from([
    // 第一个节点：执行分析步骤，并处理结果
    async (input: { userPrompt: string; renderParams: string }) => {
      console.log('执行步骤1: 分析用户意图...');
      
      // 调用分析步骤
      const analysis = await analyzeStep.invoke({ userPrompt: input.userPrompt });
      
      // 提取分析结果的内容，并准备传递给下一步
      return {
        analysis: analysis.content,  // 提取 LLM 响应的文本内容
        renderParams: input.renderParams
      };
    },
    // 第二个节点：执行优化步骤
    optimizeStep
  ]);

  console.log('链结构: 输入 → 分析步骤 → [提取结果] → 优化步骤 → 结果\n');

  // 步骤5: 调用完整链
  const result = await fullChain.invoke({
    userPrompt: 'portrait photography',
    renderParams: '景别: 近景, 镜头: 标准镜头, 光线: 自然光'
  });

  console.log('\n最终结果:', result.content);
  console.log('\n--- 演示完成 ---\n');
}

// ==================== 6. 条件判断链 ====================

/**
 * 演示5：条件判断链（Conditional Chain）
 * 
 * 功能说明：
 * - 条件判断链允许根据输入或中间结果选择不同的处理路径
 * - 使用 RunnableBranch 实现条件路由
 * - 类似于编程中的 if-else 语句，但用于链式处理
 * 
 * 学习要点：
 * 1. RunnableBranch 的作用和使用方法
 * 2. 如何在链中实现条件判断
 * 3. 如何根据条件选择不同的处理路径
 * 4. RunnableLambda 的使用（自定义逻辑）
 * 
 * 适用场景：
 * - 需要根据输入内容选择不同处理方式的场景
 * - 需要根据中间结果决定下一步的场景
 * - 多分支业务逻辑处理
 * 
 * 执行流程：
 * 1. 定义条件判断函数
 * 2. 定义不同分支的处理链
 * 3. 使用 RunnableBranch 组合条件分支
 * 4. 执行链并观察不同路径的执行
 * 
 * 链的结构：
 * 输入 → 条件判断 → [分支A: 处理方式1] 或 [分支B: 处理方式2] → 结果
 */
async function conditionalChainDemo() {
  console.log('\n=== 演示5: 条件判断链（使用 DeerAPI）===\n');
  console.log('说明：条件判断链可以根据输入选择不同的处理路径\n');

  // 步骤1: 初始化 LLM
  const llm = initDeerAPILLM();
  const outputParser = new StringOutputParser();

  // 步骤2: 定义条件判断函数
  // 
  // 功能说明：
  // - 这个函数接收输入数据，根据输入内容判断应该走哪个分支
  // - 返回一个字符串标识（如 'chinese'、'english'），用于匹配对应的分支
  // - 类似于编程中的 if-else 判断，但用于链式处理
  // 
  // 判断逻辑：
  // 1. 如果输入中明确指定了 language 参数，直接使用该语言
  // 2. 否则，通过正则表达式检测文本中是否包含中文字符
  // 3. 包含中文 → 返回 'chinese'，否则返回 'english'
  const routeByLanguage = (input: { text: string; language?: string }) => {
    // 如果明确指定了语言，使用指定的语言
    if (input.language) {
      return input.language;
    }
    
    // 否则根据文本内容判断语言
    // 使用正则表达式检测中文字符：[\u4e00-\u9fa5] 是中文字符的 Unicode 范围
    const hasChinese = /[\u4e00-\u9fa5]/.test(input.text);
    return hasChinese ? 'chinese' : 'english';
  };

  // 步骤3: 定义不同分支的处理链
  
  // 分支1: 处理中文输入 - 转换为英文提示词
  const chineseBranch = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
将以下中文描述转换为专业的英文 AI 图像生成提示词。

中文描述: {text}

要求：
1. 使用专业摄影术语
2. 描述清晰具体
3. 长度控制在 50-100 字
4. 使用英文输出

英文提示词:
    `),
    llm,
    outputParser
  ]);

  // 分支2: 处理英文输入 - 优化提示词
  // 适用条件：输入是英文文本
  // 特点：优化现有的英文提示词，使其更专业和详细
  const englishBranch = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
优化以下英文 AI 图像生成提示词，使其更加专业和详细。

原始提示词: {text}

要求：
1. 保持原始意图
2. 添加专业摄影术语
3. 描述更加具体
4. 长度控制在 50-100 字

优化后的提示词:
    `),
    llm,
    outputParser
  ]);

  // 分支3: 默认分支 - 处理未识别的情况
  // 适用条件：无法识别语言或不符合其他条件
  // 特点：返回提示信息，不进行实际处理
  // 
  // RunnableLambda 用于创建简单的自定义处理函数
  // 不需要 LLM 调用，直接返回结果
  const defaultBranch = RunnableLambda.from((input: { text: string }) => {
    return `未识别的语言: ${input.text}`;
  });

  // 步骤4: 使用 RunnableBranch 组合条件分支
  // 
  // RunnableBranch 是 LangChain 提供的条件路由工具
  // 功能类似于编程中的 switch-case 或 if-else if-else 语句
  // 
  // 语法结构：
  // RunnableBranch.from([
  //   [条件函数1, 分支1],
  //   [条件函数2, 分支2],
  //   默认分支
  // ])
  // 
  // 执行流程：
  // 1. 按顺序执行每个条件函数
  // 2. 如果条件函数返回 true，执行对应的分支
  // 3. 如果所有条件都不满足，执行默认分支
  // 
  // 注意事项：
  // - 条件函数必须返回布尔值（true/false）
  // - 分支可以是 RunnableSequence、RunnableLambda 或其他 Runnable 对象
  // - 默认分支放在最后，不需要条件函数
  const conditionalChain = RunnableBranch.from([
    // 分支1: 中文处理分支
    // 条件：routeByLanguage() 返回 'chinese'
    // 执行：chineseBranch（将中文转换为英文提示词）
    [
      (input: { text: string; language?: string }) => routeByLanguage(input) === 'chinese',
      chineseBranch
    ],
    // 分支2: 英文处理分支
    // 条件：routeByLanguage() 返回 'english'
    // 执行：englishBranch（优化英文提示词）
    [
      (input: { text: string; language?: string }) => routeByLanguage(input) === 'english',
      englishBranch
    ],
    // 默认分支：如果都不匹配，执行此分支
    // 使用 RunnableLambda 创建简单的处理函数
    defaultBranch
  ]);

  console.log('链结构: 输入 → 条件判断 → [中文分支/英文分支/默认分支] → 结果\n');

  // 步骤5: 测试不同输入
  console.log('--- 测试1: 中文输入 ---');
  const result1 = await conditionalChain.invoke({
    text: '一张近景人像照片，使用标准镜头，自然光线'
  });
  console.log('结果:', result1);
  console.log('');

  console.log('--- 测试2: 英文输入 ---');
  const result2 = await conditionalChain.invoke({
    text: 'portrait photography, close-up, natural light'
  });
  console.log('结果:', result2);
  console.log('');

  console.log('--- 测试3: 强制指定语言 ---');
  const result3 = await conditionalChain.invoke({
    text: 'portrait photography',
    language: 'chinese'  // 强制使用中文分支处理
  });
  console.log('结果:', result3);
  console.log('');

  console.log('--- 演示完成 ---\n');
}

/**
 * 演示6: 复杂条件判断链（多级条件）
 * 
 * 功能说明：
 * - 演示更复杂的多级条件判断
 * - 根据不同的条件组合选择不同的处理路径
 * - 展示条件链的嵌套使用
 * 
 * 学习要点：
 * 1. 如何实现多级条件判断
 * 2. 如何组合多个条件（任务类型 + 复杂度）
 * 3. 条件链的嵌套使用
 * 4. 如何根据业务规则选择不同的处理方式
 * 
 * 适用场景：
 * - 需要根据多个条件决定处理方式的场景
 * - 复杂的业务规则判断（如：任务类型 + 复杂度 + 用户等级）
 * - 多维度条件路由
 * 
 * 执行流程：
 * 1. 定义多维度条件判断函数
 * 2. 为每种条件组合定义处理分支
 * 3. 使用 RunnableBranch 组合所有分支
 * 4. 测试不同条件组合的执行路径
 * 
 * 链的结构：
 * 输入 → 多维度条件判断 → [分支1/分支2/分支3/默认分支] → 结果
 * 
 * 条件组合示例：
 * - 任务类型: portrait / fashion / landscape
 * - 复杂度: simple / complex
 * - 组合结果: simple_portrait / complex_portrait / fashion / default
 */
async function complexConditionalChainDemo() {
  console.log('\n=== 演示6: 复杂条件判断链（使用 DeerAPI）===\n');
  console.log('说明：演示多级条件判断和条件组合\n');

  const llm = initDeerAPILLM();
  const outputParser = new StringOutputParser();

  // 步骤1: 定义多维度条件判断函数
  // 
  // 功能说明：
  // - 这个函数根据多个条件（任务类型 + 复杂度）组合判断
  // - 返回一个字符串标识，用于匹配对应的处理分支
  // - 展示了如何实现复杂的业务规则判断
  // 
  // 条件组合逻辑：
  // - portrait + simple → 'simple_portrait'（简单人像）
  // - portrait + complex → 'complex_portrait'（复杂人像）
  // - fashion → 'fashion'（时尚摄影，不考虑复杂度）
  // - 其他 → 'default'（默认处理）
  // 
  // 实际应用：
  // - 可以根据任务类型、复杂度、用户等级等多个维度进行判断
  // - 每个组合可以对应不同的处理策略和提示词模板
  const routeByTaskType = (input: { taskType: string; complexity: 'simple' | 'complex' }) => {
    const { taskType, complexity } = input;
    
    // 组合条件判断：任务类型 + 复杂度
    // 这种多维度判断在实际业务中非常常见
    if (taskType === 'portrait' && complexity === 'simple') {
      return 'simple_portrait';
    } else if (taskType === 'portrait' && complexity === 'complex') {
      return 'complex_portrait';
    } else if (taskType === 'fashion') {
      // 时尚摄影不考虑复杂度，统一处理
      return 'fashion';
    } else {
      return 'default';
    }
  };

  // 步骤2: 定义不同条件分支的处理链
  // 
  // 每个分支对应一种条件组合的处理方式
  // 可以根据业务需求定义不同的提示词模板和处理逻辑
  
  // 分支1: 简单人像处理
  // 适用条件：taskType='portrait' && complexity='simple'
  // 特点：生成简洁的提示词（30-50字）
  const simplePortraitBranch = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
生成一个简单的人像摄影提示词。

要求: {requirements}

提示词（简洁版，30-50字）:
    `),
    llm,
    outputParser
  ]);

  const complexPortraitBranch = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
生成一个详细的人像摄影提示词，包含所有技术参数。

要求: {requirements}

提示词（详细版，100-150字，包含景别、镜头、光线、风格等）:
    `),
    llm,
    outputParser
  ]);

  const fashionBranch = RunnableSequence.from([
    PromptTemplate.fromTemplate(`
生成一个时尚摄影提示词。

要求: {requirements}

提示词（时尚风格，包含造型、灯光、场景等）:
    `),
    llm,
    outputParser
  ]);

  // 默认分支：处理其他任务类型
  const defaultBranch = RunnableLambda.from((input: { requirements: string }) => {
    return `默认处理: ${input.requirements}`;
  });

  // 步骤3: 使用 RunnableBranch 创建复杂条件链
  // 
  // 功能说明：
  // - 将多个条件分支组合成一个完整的条件链
  // - 每个分支对应一种条件组合的处理方式
  // - 按顺序匹配条件，第一个匹配的分支会被执行
  // 
  // 执行顺序：
  // 1. 检查 simple_portrait 条件
  // 2. 检查 complex_portrait 条件
  // 3. 检查 fashion 条件
  // 4. 如果都不匹配，执行默认分支
  const complexChain = RunnableBranch.from([
    [
      (input: { taskType: string; complexity: string; requirements: string }) => 
        routeByTaskType(input as any) === 'simple_portrait',
      simplePortraitBranch
    ],
    [
      (input: { taskType: string; complexity: string; requirements: string }) => 
        routeByTaskType(input as any) === 'complex_portrait',
      complexPortraitBranch
    ],
    [
      (input: { taskType: string; complexity: string; requirements: string }) => 
        routeByTaskType(input as any) === 'fashion',
      fashionBranch
    ],
    defaultBranch
  ]);

  console.log('链结构: 输入 → 多级条件判断 → [不同分支] → 结果\n');

  // 测试不同场景
  console.log('--- 测试1: 简单人像 ---');
  const result1 = await complexChain.invoke({
    taskType: 'portrait',
    complexity: 'simple',
    requirements: '近景，自然光，简单背景'
  });
  console.log('结果:', result1);
  console.log('');

  console.log('--- 测试2: 复杂人像 ---');
  const result2 = await complexChain.invoke({
    taskType: 'portrait',
    complexity: 'complex',
    requirements: '近景，35mm镜头，自然光，f/1.8光圈，背景虚化'
  });
  console.log('结果:', result2);
  console.log('');

  console.log('--- 测试3: 时尚摄影 ---');
  const result3 = await complexChain.invoke({
    taskType: 'fashion',
    complexity: 'simple',
    requirements: '时尚大片风格，戏剧性灯光'
  });
  console.log('结果:', result3);
  console.log('');

  console.log('--- 演示完成 ---\n');
}

// ==================== 7. 流式输出 ====================

/**
 * 演示5：流式输出（Streaming）
 * 
 * 功能说明：
 * - 流式输出允许我们实时接收模型的响应，而不是等待完整结果
 * - 适用于需要实时展示结果的场景，提升用户体验
 * - 使用 stream() 方法获取异步迭代器
 * 
 * 学习要点：
 * 1. 流式输出与普通调用的区别
 * 2. 如何使用 stream() 方法
 * 3. 如何遍历异步迭代器
 * 4. 流式输出的应用场景
 * 
 * 适用场景：
 * - 需要实时展示结果的用户界面
 * - 长文本生成场景
 * - 需要提升用户体验的场景
 * 
 * 执行流程：
 * 1. 调用 stream() 方法获取异步迭代器
 * 2. 使用 for await...of 遍历迭代器
 * 3. 实时处理每个数据块
 * 4. 展示结果
 * 
 * 技术细节：
 * - stream() 返回一个异步迭代器（AsyncIterable）
 * - 每个 chunk 是一个消息块，包含部分响应内容
 * - 需要处理 chunk.content 可能是字符串或数组的情况
 */
async function streamingDemo() {
  console.log('\n=== 演示5: 流式输出（使用 DeerAPI）===\n');
  console.log('说明：流式输出可以实时接收模型响应，提升用户体验\n');

  // 步骤1: 初始化 LLM
  const llm = initDeerAPILLM();

  // 步骤2: 调用 stream() 方法获取异步迭代器
  // stream() 方法返回一个异步迭代器，可以逐步获取模型的响应
  // 与 invoke() 不同，stream() 不会等待完整响应，而是实时返回数据块
  const stream = await llm.stream('请用一句话介绍什么是 LangChain，分5句话说明');

  console.log('流式输出（实时显示）:');
  console.log('---\n');

  // 步骤3: 遍历异步迭代器
  // for await...of 用于遍历异步迭代器
  // 每次迭代获取一个数据块（chunk），包含部分响应内容
  for await (const chunk of stream) {
    // chunk.content 可能是字符串或数组，需要统一处理
    const content = typeof chunk.content === 'string' 
      ? chunk.content 
      : String(chunk.content);
    
    // 使用 process.stdout.write() 实时输出，不换行
    // 这样可以实现打字机效果
    process.stdout.write(content);
  }
  
  // 输出完成后换行
  console.log('\n---\n');
  console.log('--- 演示完成 ---\n');
}

// ==================== 主函数 ====================

/**
 * 主函数：执行所有演示
 * 
 * 功能说明：
 * - 按顺序执行所有演示函数
 * - 统一处理错误
 * - 提供执行状态反馈
 * 
 * 执行顺序：
 * 1. 基础调用演示
 * 2. 提示词模板演示
 * 3. 链式调用演示
 * 4. 多步骤链式调用演示
 * 5. 流式输出演示
 */
async function main() {
  try {
    console.log('🚀 开始 LangChain 基础演示\n');
    console.log('='.repeat(50));
    
    // 按顺序执行所有演示
    // await basicCall();
   // await promptTemplateDemo();
    // await chainDemo();
    // await multiStepChainDemo();
   // await conditionalChainDemo();        // 新增：条件判断链演示
    // await complexConditionalChainDemo(); // 新增：复杂条件判断链演示
     await streamingDemo();

    console.log('='.repeat(50));
    console.log('\n✅ 所有演示完成！\n');
    console.log('📚 学习总结：');
    console.log('1. ✅ 掌握了 LLM 的基本调用方式');
    console.log('2. ✅ 学会了使用提示词模板');
    console.log('3. ✅ 理解了链式调用的概念');
    console.log('4. ✅ 学会了创建多步骤处理链');
    console.log('5. ✅ 掌握了条件判断链的实现');
    console.log('6. ✅ 掌握了流式输出的实现\n');
  } catch (error) {
    console.error('\n❌ 演示失败:', error);
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// ==================== 模块导出 ====================

// 如果直接运行此文件（而不是作为模块导入），执行主函数
if (require.main === module) {
  main();
}

// 导出所有函数，方便其他文件导入使用
export {
  initDeerAPILLM,
  initOpenAILLM,
  initAnthropicLLM,
  basicCall,
  promptTemplateDemo,
  chainDemo,
  multiStepChainDemo,
  conditionalChainDemo,
  complexConditionalChainDemo,
  streamingDemo
};
