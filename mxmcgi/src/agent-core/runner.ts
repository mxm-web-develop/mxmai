/**
 * AgentRunner — function-calling agent loop（全异步，在 worker 中执行）
 */

import { RepositoryFactory, type AgentReference } from '@mxmai/mxmdata';
import {
  loadAgentAdminConfig,
  partsToPlainText,
  type AgentChatMessage,
  type AgentToolContext,
} from './types';
import { appendAndPublishEvent } from './event-bus';
import { chatCompletion, streamChatText } from './llm-client';
import { buildToolRegistry, findTool, toolsToDefinitions } from './tools';
import { resolveReferences } from './reference-resolver';
import { formatBusinessCatalogSummaryLine, normalizeAgentLocale } from './business-display';
import type { AppLocale } from '@mxmai/mxmdata';
import { localeOutputInstruction } from '@mxmai/mxmdata';

function buildDefaultSystem(locale: AppLocale): string {
  const langLine = localeOutputInstruction(locale);
  if (locale === 'en') {
    return `You are the SuperMXMai platform AI assistant (Harness Agent).
You understand the platform's available capabilities and can use tools to query the business catalog, submit Task V2 jobs, run Smartflow, and search knowledge / virtual folders.
Principles:
1. When the user needs creative/generated content, prefer calling the right business tools instead of inventing results.
2. Complex requests may combine multiple businesses (e.g. writing then images).
3. If parameters are unclear, ask; once clear, execute.
4. ${langLine} Prefer Markdown for structured content (headings, lists, tables, code blocks).
5. When introducing or recommending businesses to the user, **only use display names** (e.g. "Writing · Tech briefing article"). **Never** expose scope/taskKey/subtype, API routes, or internal ids. Internal ids are for tool calls only.
6. If a "Global rules" section exists, it overrides the above and must be followed.`;
  }
  if (locale === 'ja') {
    return `あなたは SuperMXMai プラットフォームの AI アシスタント（Harness Agent）です。
プラットフォームの業務能力を理解し、ツールで業務カタログ照会、Task V2 提出、Smartflow 実行、知識庫・仮想フォルダ検索ができます。
原則：
1. 創作・生成が必要なときは、空想せず適切な業務ツールを優先して呼び出します。
2. 複雑な要望は複数業務を組み合わせてよい（例：先に執筆、次に配図）。
3. パラメータが不明なときは確認し、明確になったら実行します。
4. ${langLine} 構造化内容は Markdown（見出し・リスト・表・コード）を優先。
5. 業務を紹介・推奨するときは**表示名のみ**を使い、scope/taskKey/subtype や内部 ID をユーザーに見せない。
6. 「グローバルルール」がある場合は上記より優先し厳守する。`;
  }
  if (locale === 'zh-TW') {
    return `你是 SuperMXMai 平台的 AI 助手（Harness Agent）。
你理解平台當前可用的業務能力，可以透過工具查詢業務目錄、提交 Task V2 任務、執行 Smartflow、檢索知識庫與虛擬資料夾。
原則：
1. 需要創作/生成內容時，優先呼叫合適的業務工具，而不是空想結果。
2. 複雜需求可以組合呼叫多個業務（例如先寫作再配圖）。
3. 參數不確定時，向使用者澄清；確定後直接執行。
4. ${langLine} 結構化內容優先使用 Markdown（標題、列表、表格、程式碼區塊）。
5. 向使用者介紹、推薦或說明平台業務時，**只使用顯示名**，**禁止**出現 scope/taskKey/subtype、API 路由或內部標識。
6. 若存在「全域規則」段落，其優先級高於以上原則，必須嚴格遵守。`;
  }
  return `你是 SuperMXMai 平台的 AI 助手（Harness Agent）。
你理解平台当前可用的业务能力，可以通过工具查询业务目录、提交 Task V2 任务、执行 Smartflow、检索知识库与虚拟文件夹。
原则：
1. 需要创作/生成内容时，优先调用合适的业务工具，而不是空想结果。
2. 复杂需求可以组合调用多个业务（例如先写作再配图）。
3. 参数不确定时，向用户澄清；确定后直接执行。
4. ${langLine} 结构化内容优先使用 Markdown（标题、列表、表格、代码块）。
5. 向用户介绍、推荐或说明平台业务时，**只使用显示名**（如「写作 · 选题长文」「设计 · 品牌 Logo」），**禁止**在回复中出现 scope/taskKey/subtype、API 路由、代码标识或类似 writing/generator/topic-article 的内部命名。内部标识仅用于工具调用，不得展示给用户。
6. 若存在「全局规则」段落，其优先级高于以上原则，必须严格遵守。`;
}

export async function runAgentLoop(args: {
  runId: string;
  conversationId: string;
  userId: string;
  workerId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { runId, conversationId, userId, workerId, signal } = args;
  const repo = RepositoryFactory.createAgentConversationRepository();
  const config = await loadAgentAdminConfig();
  const tools = config.tools_enabled ? buildToolRegistry() : [];

  const emit = async (type: string, payload: Record<string, unknown> = {}) => {
    await appendAndPublishEvent({ runId, conversationId, type, payload });
  };

  const heartbeat = async () => {
    await repo.updateRun(runId, {
      heartbeat_at: new Date().toISOString(),
      claimed_by: workerId,
    });
  };

  const heartbeatTimer = setInterval(() => {
    void heartbeat();
  }, 15_000);

  let assistantText = '';
  let loopRounds = 0;
  let toolCallCount = 0;
  let usageAcc = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  try {
    const run = await repo.findRunById(runId);
    if (!run) throw new Error(`run not found: ${runId}`);
    if (run.status === 'cancelled') {
      await emit('run_cancelled', {});
      return;
    }

    await repo.updateRun(runId, {
      status: 'running',
      heartbeat_at: new Date().toISOString(),
      claimed_by: workerId,
      started_at: run.started_at || new Date().toISOString(),
    });
    await emit('run_started', { model_key: config.model_key, provider: config.provider });

    const conversation = await repo.findById(conversationId, userId);
    if (!conversation) throw new Error('conversation not found');
    const conversationScope =
      typeof conversation.scope === 'string' && conversation.scope.trim()
        ? conversation.scope.trim()
        : null;
    const replyLocale = normalizeAgentLocale(conversation.locale);

    const messages = await repo.listMessages(conversationId, userId, 40);
    const latestUser = [...messages].reverse().find((m) => m.role === 'user');
    const references: AgentReference[] = latestUser?.references || [];
    const resolved = await resolveReferences(userId, references);

    // 长期记忆召回（主助手）；模块一次性对话跳过
    let memoryBlock = '';
    if (!conversationScope) {
      try {
        const { AgentMemoryService } = await import('../agents/memory');
        const memoryService = new AgentMemoryService();
        const queryText = latestUser ? partsToPlainText(latestUser.content) : '';
        if (queryText) {
          const memories = await memoryService.recall({
            user_id: userId,
            query: queryText,
            limit: 3,
            threshold: 0.6,
          });
          if (memories.length > 0) {
            memoryBlock =
              (replyLocale === 'en'
                ? '\n\n## Related long-term memory\n'
                : '\n\n## 相关长期记忆\n') + memories.map((m) => `- ${m.content}`).join('\n');
          }
        }
      } catch (err) {
        console.warn('[AgentRunner] memory recall failed:', err);
      }
    }

    // 业务目录摘要（模块会话附带关键字段，便于推荐方案）
    let catalogHint = '';
    try {
      const { buildAgentCatalog } = await import('../agent/build-catalog');
      const { isBusinessAllowed } = await import('./types');
      const catalog = await buildAgentCatalog({
        userId,
        baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
        locale: replyLocale,
      });
      const scoped = (catalog.taskV2 || [])
        .filter((i) => !conversationScope || i.scope === conversationScope)
        .filter((i) => isBusinessAllowed(config, i.scope, i.taskKey, i.subtype));
      if (conversationScope) {
        const detailLines = scoped.slice(0, 40).map((i) => {
          const name = formatBusinessCatalogSummaryLine({
            taskLabel: i.taskLabel,
            subtypeLabel: i.subtypeLabel,
            taskKey: i.taskKey,
            subtype: i.subtype,
            locale: replyLocale,
          });
          const fields = Array.isArray(i.fields)
            ? i.fields
                .slice(0, 12)
                .map((f: any) => {
                  const n = f?.name || f?.key || '';
                  const title = f?.title || f?.label || '';
                  return title ? `${n}(${title})` : n;
                })
                .filter(Boolean)
                .join(', ')
            : '';
          const req =
            Array.isArray(i.required) && i.required.length
              ? replyLocale === 'en'
                ? `required:${i.required.join(',')}`
                : `必填:${i.required.join(',')}`
              : '';
          const fieldLabel = replyLocale === 'en' ? 'fields' : '字段';
          return `${name}${fields ? `\n  ${fieldLabel}: ${fields}` : ''}${req ? `\n  ${req}` : ''}`;
        });
        catalogHint = detailLines.length
          ? replyLocale === 'en'
            ? `\n\n## Available businesses in this module (use display names with the user)\n${detailLines.join('\n')}\nBefore calling tools, use list_business_catalog for internal scope/taskKey/subtype (never show those to the user). Call list_business_catalog again when you need full parameter docs.`
            : `\n\n## 本模块可用业务（向用户只用显示名）\n${detailLines.join('\n')}\n调用前用 list_business_catalog 取内部 scope/taskKey/subtype（勿向用户展示）。需要完整参数说明时再调 list_business_catalog。`
          : replyLocale === 'en'
            ? '\n\n## Available businesses in this module\n(None open yet — you may still chat and search knowledge.)'
            : '\n\n## 本模块可用业务\n（暂无开放业务，仅可对话与检索知识）';
      } else {
        const lines = scoped.slice(0, 30).map((i) =>
          formatBusinessCatalogSummaryLine({
            taskLabel: i.taskLabel,
            subtypeLabel: i.subtypeLabel,
            taskKey: i.taskKey,
            subtype: i.subtype,
            locale: replyLocale,
          })
        );
        catalogHint = lines.length
          ? replyLocale === 'en'
            ? `\n\n## Available businesses (summary — use display names with the user)\n${lines.join('\n')}\nBefore calling tools, use list_business_catalog for internal scope/taskKey/subtype (never show those to the user).`
            : `\n\n## 当前可用业务（摘要，向用户介绍时只用下列显示名）\n${lines.join('\n')}\n调用前用 list_business_catalog 获取内部 scope/taskKey/subtype（勿向用户展示）。`
          : replyLocale === 'en'
            ? '\n\n## Available businesses\n(Admin has not opened any businesses — chat and knowledge search only.)'
            : '\n\n## 当前可用业务\n（管理员未开放任何业务，仅可对话与检索）';
      }
    } catch {
      /* optional */
    }

    const globalRules = (config.system_prompt_extra || '').trim();
    const moduleGuide = conversationScope
      ? replyLocale === 'en'
        ? `\n## Module creation assistant (one-shot session · hard-limited to scope=${conversationScope})
You are the generation guide for the "${conversationScope}" module. Help the user **finish this creation task** — you are not a long-term chat buddy.
Duties:
1. After understanding the request, compare against this module's dynamic business catalog (display names + fields/required), **recommend 1–2 best options**, explain why, and list key parameters to fill.
2. If the business has template/form conventions, use list_business_catalog field docs to guide the user; when parameters are ready, call run_business_task — don't idle chat.
3. **Proactively search virtual-folder knowledge**: use list_virtual_folders for vectorized / tagged folders (especially card_tag=knowledge). When a folder fits, **recommend it by display name**, then after consent or @ mention, search_knowledge(folderId=…) and feed results into task params.
4. Only run_business_task for scope=${conversationScope}; never recommend or call other modules.
5. Speak to the user with display names only — never expose scope/taskKey/subtype.`
        : `\n## 模块生成助手（一次性会话 · 硬限制 scope=${conversationScope}）
你是「${conversationScope}」模块的生成向导，帮助用户**完成本次生成任务**，不是长期聊天助理。
职责：
1. 理解用户需求后，对照本模块动态业务目录（显示名 + 参数字段/必填），**推荐 1～2 个最优业务方案**，说明为何适合，并列出关键参数该怎么填。
2. 若业务有模板/表单约定，结合 list_business_catalog 的字段说明引导用户补齐；参数够了就直接 run_business_task，不要空聊。
3. **主动检索虚拟文件夹知识**：用 list_virtual_folders 查看用户已向量化/打标（尤其 card_tag=knowledge）的文件夹；有符合场景的知识库时，**向用户推荐使用**（说明文件夹显示名与用途），征得同意或用户已 @ 后，用 search_knowledge(folderId=…) 召回再写入任务参数。
4. 仅可 run_business_task 提交 scope=${conversationScope} 的业务；禁止推荐或调用其他模块。
5. 对用户只用业务显示名，禁止暴露 scope/taskKey/subtype。`
      : '';
    const systemParts = [
      conversationScope
        ? replyLocale === 'en'
          ? `You are the SuperMXMai "${conversationScope}" module creation assistant. Reply in concise English; when generation is needed, prefer calling tools to complete the task.`
          : `你是 SuperMXMai「${conversationScope}」模块生成助手。用简洁中文回复；需要生成时优先调用工具完成任务。`
        : buildDefaultSystem(replyLocale),
      moduleGuide,
      globalRules
        ? replyLocale === 'en'
          ? `\n## Global rules (must follow)\n${globalRules}`
          : `\n## 全局规则（必须遵守）\n${globalRules}`
        : '',
      !conversationScope && conversation.summary
        ? replyLocale === 'en'
          ? `\n## Conversation summary\n${conversation.summary}`
          : `\n## 会话摘要\n${conversation.summary}`
        : '',
      resolved.systemExtra,
      memoryBlock,
      catalogHint,
    ].filter(Boolean);

    const chatMessages: AgentChatMessage[] = [
      { role: 'system', content: systemParts.join('\n') },
    ];

    for (const m of messages) {
      if (m.role === 'system') continue;
      const text = partsToPlainText(m.content);
      if (!text) continue;
      if (m.role === 'user' || m.role === 'assistant') {
        chatMessages.push({ role: m.role, content: text });
      }
    }

    const toolCtxBase: Omit<AgentToolContext, 'emit'> = {
      userId,
      conversationId,
      runId,
      references,
      conversationScope,
      signal,
    };

    // 无工具：纯流式回复
    if (!config.tools_enabled || tools.length === 0) {
      await emit('thinking', { phase: 'generating' });
      const streamed = await streamChatText({
        config,
        messages: chatMessages,
        signal,
        onDelta: async (delta) => {
          assistantText += delta;
          await emit('text_delta', { content: delta });
        },
      });
      assistantText = streamed.content || assistantText;
    } else {
      // function-calling loop
      const maxRounds = Math.max(1, Math.min(config.max_loop_rounds || 12, 30));
      const deadline = Date.now() + (config.run_timeout_ms || 600_000);

      while (loopRounds < maxRounds) {
        if (signal?.aborted) throw new Error('run aborted');
        if (Date.now() > deadline) throw new Error('run timeout');

        const fresh = await repo.findRunById(runId);
        if (fresh?.status === 'cancelled') {
          await emit('run_cancelled', {});
          return;
        }

        loopRounds += 1;
        await heartbeat();
        await emit('thinking', { round: loopRounds, phase: 'llm' });

        const completion = await chatCompletion({
          config,
          messages: chatMessages,
          tools: toolsToDefinitions(tools),
          signal,
        });

        if (completion.usage) {
          usageAcc.prompt_tokens += completion.usage.prompt_tokens || 0;
          usageAcc.completion_tokens += completion.usage.completion_tokens || 0;
          usageAcc.total_tokens += completion.usage.total_tokens || 0;
        }

        // 思维链：分片下发，前端可打字机展示
        if (completion.reasoning) {
          const reason = completion.reasoning;
          const chunkSize = 48;
          for (let i = 0; i < reason.length; i += chunkSize) {
            await emit('thinking_delta', { content: reason.slice(i, i + chunkSize), round: loopRounds });
          }
          await emit('thinking_done', { round: loopRounds });
        }

        if (completion.tool_calls.length > 0) {
          chatMessages.push({
            role: 'assistant',
            content: completion.content,
            tool_calls: completion.tool_calls,
          });

          for (const tc of completion.tool_calls) {
            toolCallCount += 1;
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || '{}');
            } catch {
              parsedArgs = {};
            }

            await emit('tool_call', {
              id: tc.id,
              name: tc.function.name,
              arguments: parsedArgs,
            });

            if (tc.function.name === 'run_business_task' || tc.function.name === 'wait_for_task') {
              await repo.updateRun(runId, { status: 'waiting_task', heartbeat_at: new Date().toISOString() });
            }

            const tool = findTool(tools, tc.function.name);
            let resultContent = '';
            if (!tool) {
              resultContent = `未知工具: ${tc.function.name}`;
            } else {
              const result = await tool.handler(parsedArgs, {
                ...toolCtxBase,
                emit,
              });
              resultContent = result.content;
            }

            await emit('tool_result', {
              id: tc.id,
              name: tc.function.name,
              content: resultContent.slice(0, 4000),
            });

            chatMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: resultContent.slice(0, 12000),
            });

            await repo.updateRun(runId, { status: 'running', heartbeat_at: new Date().toISOString() });
          }
          continue;
        }

        // 最终文本回答
        if (completion.content) {
          assistantText = completion.content;
          const chunkSize = 40;
          for (let i = 0; i < assistantText.length; i += chunkSize) {
            await emit('text_delta', { content: assistantText.slice(i, i + chunkSize) });
          }
        } else if (completion.reasoning && !assistantText) {
          // 仅有思维链无正文时，给一句可见回退，避免前端空泡
          assistantText = '（模型仅返回了思考过程，未生成最终回答。请重试或换一种问法。）';
          await emit('text_delta', { content: assistantText });
        }
        break;
      }

      if (!assistantText && loopRounds >= (config.max_loop_rounds || 12)) {
        assistantText = '已达到最大工具调用轮数，请补充信息或拆分需求后再试。';
        await emit('text_delta', { content: assistantText });
      }
    }

    // 持久化 assistant 消息
    if (assistantText) {
      await repo.createMessage({
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        content: [{ type: 'text', text: assistantText }],
        run_id: runId,
      });
      await emit('message', {
        role: 'assistant',
        content: assistantText,
      });
    }

    // 滚动摘要（简单截断）
    try {
      if (assistantText && messages.length > 12) {
        const summary = `最近讨论：${partsToPlainText(latestUser?.content || [])}\n助手：${assistantText.slice(0, 300)}`;
        await repo.update(conversationId, userId, { summary });
      }
      // 首条消息自动标题
      if (!conversation.title && latestUser) {
        const title = partsToPlainText(latestUser.content).slice(0, 40) || '新对话';
        await repo.update(conversationId, userId, { title });
      }
    } catch {
      /* ignore */
    }

    await repo.updateRun(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      usage: {
        ...usageAcc,
        loop_rounds: loopRounds,
        tool_calls: toolCallCount,
      },
    });
    await emit('run_completed', {
      usage: usageAcc,
      loop_rounds: loopRounds,
      tool_calls: toolCallCount,
    });

    // 通知离线用户
    try {
      await notifyAgentRunCompleted({
        userId,
        conversationId,
        runId,
        title: conversation.title || 'AI 助手',
        preview: assistantText.slice(0, 120),
      });
    } catch (err) {
      console.warn('[AgentRunner] notify failed:', err);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[AgentRunner] failed:', msg);
    try {
      await appendAndPublishEvent({
        runId,
        conversationId,
        type: 'error',
        payload: { error: msg },
      });
      await appendAndPublishEvent({
        runId,
        conversationId,
        type: 'run_failed',
        payload: { error: msg },
      });
      await repo.updateRun(runId, {
        status: 'failed',
        error: msg,
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  } finally {
    clearInterval(heartbeatTimer);
  }
}

async function notifyAgentRunCompleted(args: {
  userId: string;
  conversationId: string;
  runId: string;
  title: string;
  preview: string;
}): Promise<void> {
  try {
    const { buildTaskStatusChangedEvent, enqueueOutboxEvent, deliverToMxmnotify } = await import(
      '../task/notification-outbox'
    );
    const event = buildTaskStatusChangedEvent({
      taskId: args.runId,
      userId: args.userId,
      status: 'completed',
      statusMessage: args.preview || '对话助手已完成回复',
      taskType: 'agent_run' as any,
      modelName: 'agent-v2',
      modelProvider: 'agent',
      progress: 100,
      notification_config: {
        notification_type: 'reminder',
        title: args.title,
        conversation_id: args.conversationId,
      },
    });
    try {
      await enqueueOutboxEvent(event);
    } catch {
      await deliverToMxmnotify(event);
    }
  } catch (e) {
    console.warn('[AgentRunner] notification failed:', e);
  }
}
