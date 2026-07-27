/**
 * Agent 工具注册表：业务目录 / Task V2 / Smartflow / 知识检索 / 文件夹
 */

import { RepositoryFactory } from '@mxmai/mxmdata';
import type { RegisteredTool, AgentToolContext, AgentToolResult } from './types';
import { isBusinessAllowed, loadAgentAdminConfig } from './types';
import { waitForTaskCompletion } from '../task/wait-for-task';
import { formatBusinessDisplayName, resolveBusinessDisplayName } from './business-display';

function ok(content: string, data?: Record<string, unknown>): AgentToolResult {
  return { ok: true, content, data };
}

function fail(content: string, data?: Record<string, unknown>): AgentToolResult {
  return { ok: false, content, data };
}

function parseArgs(raw: Record<string, unknown>): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw : {};
}

export function buildToolRegistry(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'list_business_catalog',
        description:
          '列出系统当前可用的 Task V2 业务与 Smartflow。向用户介绍业务时只用返回的 displayName，勿展示 scope/taskKey/subtype 等内部标识。',
        parameters: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              description: '可选：按 scope 过滤（writing/graph/video/audio/music/text/outline）',
            },
            query: {
              type: 'string',
              description: '可选：关键词过滤业务名称',
            },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const args = parseArgs(raw);
      const { buildAgentCatalog } = await import('../agent/build-catalog');
      const catalog = await buildAgentCatalog({
        userId: ctx.userId,
        baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
      });
      let items = catalog.taskV2 || [];
      const adminCfg = await loadAgentAdminConfig();
      items = items.filter((i) => isBusinessAllowed(adminCfg, i.scope, i.taskKey, i.subtype));
      // 模块会话：硬限制只能列出当前 scope
      if (ctx.conversationScope) {
        items = items.filter((i) => i.scope === ctx.conversationScope);
      }
      const scope =
        ctx.conversationScope ||
        (typeof args.scope === 'string' ? args.scope : '');
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : '';
      if (scope) items = items.filter((i) => i.scope === scope);
      if (query) {
        items = items.filter((i) => {
          const label = `${i.taskLabel || ''} ${i.subtypeLabel || ''} ${i.taskKey} ${i.subtype || ''}`.toLowerCase();
          return label.includes(query);
        });
      }
      const slim = items.slice(0, 40).map((i) => ({
        displayName: formatBusinessDisplayName({
          taskLabel: i.taskLabel,
          subtypeLabel: i.subtypeLabel,
          taskKey: i.taskKey,
          subtype: i.subtype,
        }),
        /** 仅 run_business_task 调用用，勿写入用户可见回复 */
        scope: i.scope,
        taskKey: i.taskKey,
        subtype: i.subtype,
        required: i.required,
        fields: i.fields?.slice(0, 15),
        paramsExample: i.paramsExample,
      }));
      const sf = adminCfg.smartflow_enabled
        ? (catalog.smartflows || []).slice(0, 20).map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
          }))
        : [];
      return ok(JSON.stringify({ taskV2: slim, smartflows: sf }, null, 2), { count: slim.length });
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'run_business_task',
        description:
          '提交 Task V2 业务任务。scope/taskKey/subtype 来自 list_business_catalog 的内部字段；向用户说明进度或结果时只用 displayName。',
        parameters: {
          type: 'object',
          required: ['scope', 'taskKey', 'params'],
          properties: {
            scope: { type: 'string' },
            taskKey: { type: 'string' },
            subtype: { type: 'string' },
            params: { type: 'object', description: '业务表单参数，字段名以 catalog 为准' },
            wait: {
              type: 'boolean',
              description: '是否同步等待完成（默认 true）',
            },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const args = parseArgs(raw);
      const scope = String(args.scope || '');
      const taskKey = String(args.taskKey || '');
      const subtype = args.subtype != null ? String(args.subtype) : undefined;
      const params = (args.params && typeof args.params === 'object' ? args.params : {}) as Record<string, unknown>;
      const wait = args.wait !== false;
      if (!scope || !taskKey) return fail('scope 与 taskKey 必填');

      const displayName = await resolveBusinessDisplayName(scope, taskKey, subtype ?? null);
      if (ctx.conversationScope && scope !== ctx.conversationScope) {
        return fail(
          `当前为「${ctx.conversationScope}」模块助手，只能提交该模块业务；拒绝 scope=${scope}`
        );
      }
      const adminCfg = await loadAgentAdminConfig();
      if (!isBusinessAllowed(adminCfg, scope, taskKey, subtype ?? null)) {
        return fail(`业务「${displayName}」未授权（请联系管理员在系统管理中开放）`);
      }

      const { runTaskV2 } = await import('../tasks/task-engine');
      await ctx.emit('tool_call', { name: 'run_business_task', displayName, scope, taskKey, subtype, params });

      try {
        const result = await runTaskV2(
          { scope: scope as any, taskKey, subtype, params },
          ctx.userId
        );

        const taskId =
          (result as any)?.taskId ||
          (result as any)?.data?.taskId ||
          (result as any)?.id ||
          null;
        const text =
          (result as any)?.text ||
          (result as any)?.data?.text ||
          (result as any)?.content ||
          null;

        if (!taskId && text) {
          await ctx.emit('task_done', { displayName, scope, taskKey, subtype, sync: true, text });
          return ok(JSON.stringify({ displayName, sync: true, text, result }, null, 2));
        }

        if (!taskId) {
          return ok(JSON.stringify({ displayName, result }, null, 2));
        }

        await ctx.emit('task_created', { taskId, displayName, scope, taskKey, subtype });

        if (!wait) {
          return ok(JSON.stringify({ displayName, taskId, status: 'submitted' }));
        }

        const waitResult = await waitForTaskCompletion(taskId, {
          timeoutMs: Number(process.env.AGENT_TASK_WAIT_TIMEOUT_MS || 600_000),
          onProgress: (task) => {
            void ctx.emit('task_progress', {
              taskId,
              status: task.status,
              progress: task.progress?.progress,
            });
          },
        });

        const task = waitResult.task;
        if (waitResult.timedOut) {
          return fail(JSON.stringify({ taskId, timedOut: true, status: task?.status }));
        }
        const mediaUrls =
          (task as any)?.result?.mediaUrls ||
          (task as any)?.result?.urls ||
          (task as any)?.output?.mediaUrls ||
          [];
        await ctx.emit('task_done', {
          taskId,
          displayName,
          status: task?.status,
          mediaUrls,
          result: (task as any)?.result,
        });
        return ok(
          JSON.stringify(
            {
              displayName,
              taskId,
              status: task?.status,
              mediaUrls,
              result: (task as any)?.result,
              error: task?.progress?.error,
            },
            null,
            2
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await ctx.emit('error', { tool: 'run_business_task', error: msg });
        return fail(msg);
      }
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'get_task_status',
        description: '查询 Task V2 任务状态与结果',
        parameters: {
          type: 'object',
          required: ['taskId'],
          properties: { taskId: { type: 'string' } },
        },
      },
    },
    handler: async (raw) => {
      const taskId = String(parseArgs(raw).taskId || '');
      if (!taskId) return fail('taskId 必填');
      const { taskExecutor } = await import('../task/task-executor');
      const { task } = await taskExecutor.getTaskManager().getTask(taskId);
      if (!task) return fail(`任务不存在: ${taskId}`);
      return ok(
        JSON.stringify({
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          result: (task as any).result,
        })
      );
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'wait_for_task',
        description: '等待 Task V2 任务完成（内部 Redis/DB 等待）',
        parameters: {
          type: 'object',
          required: ['taskId'],
          properties: {
            taskId: { type: 'string' },
            timeoutMs: { type: 'number' },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const args = parseArgs(raw);
      const taskId = String(args.taskId || '');
      if (!taskId) return fail('taskId 必填');
      const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 600_000;
      const waitResult = await waitForTaskCompletion(taskId, {
        timeoutMs,
        onProgress: (task) => {
          void ctx.emit('task_progress', {
            taskId,
            status: task.status,
            progress: task.progress?.progress,
          });
        },
      });
      return ok(
        JSON.stringify({
          taskId,
          timedOut: waitResult.timedOut,
          status: waitResult.task?.status,
          result: (waitResult.task as any)?.result,
        })
      );
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'execute_smartflow',
        description: '执行一个 Smartflow 工作流',
        parameters: {
          type: 'object',
          required: ['smartflowId'],
          properties: {
            smartflowId: { type: 'string' },
            input_data: { type: 'object' },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const adminCfg = await loadAgentAdminConfig();
      if (!adminCfg.smartflow_enabled) {
        return fail('管理员已关闭 Smartflow 调用');
      }
      const args = parseArgs(raw);
      const smartflowId = String(args.smartflowId || '');
      if (!smartflowId) return fail('smartflowId 必填');
      const input_data = (args.input_data && typeof args.input_data === 'object' ? args.input_data : {}) as Record<string, unknown>;
      try {
        const { smartflowRepository } = await import('../smartflow/core/engine/repository');
        const { SmartflowEngine } = await import('../smartflow/core/engine/engine');
        const flow = await smartflowRepository.findById(smartflowId);
        if (!flow) return fail(`Smartflow 不存在: ${smartflowId}`);
        const engine = new SmartflowEngine();
        const { execution } = await engine.start(smartflowId, {
          user_id: ctx.userId,
          input_data,
          conversation_id: ctx.conversationId,
        } as any);
        return ok(JSON.stringify({ executionId: execution.id, status: execution.status || 'started' }));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'list_virtual_folders',
        description:
          '列出用户虚拟文件夹（及可选系统共享卡），含 card_tag / index_status / card_summary，用于发现可推荐的知识库或素材夹',
        parameters: {
          type: 'object',
          properties: {
            card_tag: {
              type: 'string',
              description: '可选：style（视觉风格）| writing（语感文风）| character | knowledge',
            },
            indexed_only: {
              type: 'boolean',
              description: '仅返回已向量化（indexed）的文件夹，默认 false',
            },
            include_system: {
              type: 'boolean',
              description: '是否合并系统共享卡，默认 true',
            },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const args = parseArgs(raw);
      const cardTag =
        typeof args.card_tag === 'string' && args.card_tag.trim()
          ? (args.card_tag.trim() as 'style' | 'writing' | 'character' | 'knowledge')
          : undefined;
      const indexedOnly = args.indexed_only === true;
      const includeSystem = args.include_system !== false;
      try {
        const folderRepo = RepositoryFactory.createFolderRepository();
        const userFolders = await folderRepo.getFolders(ctx.userId, {
          folder_kind: 'virtual',
          ...(cardTag ? { card_tag: cardTag } : {}),
          limit: 100,
        } as any);
        let systemFolders: typeof userFolders = [];
        if (includeSystem) {
          try {
            systemFolders = await folderRepo.getSystemFolders(
              cardTag ? { card_tag: cardTag } : undefined
            );
          } catch {
            systemFolders = [];
          }
        }
        const merged = [...userFolders, ...systemFolders];
        const slim = merged
          .filter((f) => !indexedOnly || f.index_status === 'indexed')
          .slice(0, 80)
          .map((f) => ({
            id: f.id,
            name: f.name,
            card_tag: f.card_tag ?? null,
            card_status: f.card_status ?? null,
            index_status: f.index_status ?? null,
            is_system: !!f.is_system,
            card_summary: f.card_summary ?? null,
          }));
        return ok(JSON.stringify({ folders: slim }, null, 2), { count: slim.length });
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'search_knowledge',
        description:
          '在知识库或已向量化的虚拟文件夹中检索相关内容。模块助手应先 list_virtual_folders，再对合适的 folderId 检索，并向用户推荐可用知识。',
        parameters: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            knowledgeBaseId: { type: 'string' },
            folderId: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const args = parseArgs(raw);
      const query = String(args.query || '');
      if (!query) return fail('query 必填');
      const limit = typeof args.limit === 'number' ? args.limit : 5;
      try {
        if (args.folderId) {
          const { virtualFolderIndexService } = await import('../folder-index/virtual-folder-index-service');
          const hits = await virtualFolderIndexService.search(ctx.userId, String(args.folderId), query, limit);
          return ok(JSON.stringify(hits, null, 2));
        }
        const kbId = String(args.knowledgeBaseId || ctx.references.find((r) => r.type === 'knowledge')?.id || '');
        if (!kbId) return fail('请提供 knowledgeBaseId 或 folderId，或先 @ 引用知识库');
        const { KnowledgeService } = await import('../knowledge/knowledge-service');
        const svc = new KnowledgeService();
        const hits = await svc.searchById({
          knowledgeBaseId: kbId,
          query,
          searchType: 'hybrid',
          limit,
          userId: ctx.userId,
        });
        return ok(JSON.stringify(hits, null, 2));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  });

  tools.push({
    definition: {
      type: 'function',
      function: {
        name: 'list_folder_items',
        description: '列出虚拟文件夹中的软链内容（任务/上传文件）',
        parameters: {
          type: 'object',
          required: ['folderId'],
          properties: {
            folderId: { type: 'string' },
            limit: { type: 'number' },
          },
        },
      },
    },
    handler: async (raw, ctx) => {
      const args = parseArgs(raw);
      const folderId = String(args.folderId || '');
      if (!folderId) return fail('folderId 必填');
      const limit = typeof args.limit === 'number' ? args.limit : 30;
      try {
        const folderRepo = RepositoryFactory.createFolderRepository();
        const folder = await folderRepo.getFolderById(folderId);
        if (!folder || (folder.user_id !== ctx.userId && !folder.is_system)) {
          return fail('文件夹不存在或无权访问');
        }
        const items = await folderRepo.getFolderItems(folderId, { limit } as any);
        return ok(JSON.stringify({ folder: { id: folder.id, name: folder.name }, items }, null, 2));
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },
  });

  return tools;
}

export function toolsToDefinitions(tools: RegisteredTool[]) {
  return tools.map((t) => t.definition);
}

export function findTool(tools: RegisteredTool[], name: string): RegisteredTool | undefined {
  return tools.find((t) => t.definition.function.name === name);
}
