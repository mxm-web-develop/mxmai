/**
 * @ 引用解析：folder / knowledge / business → 注入 system 上下文
 */

import type { AgentReference } from '@mxmai/mxmdata';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { formatBusinessDisplayName, resolveBusinessDisplayName } from './business-display';

export interface ResolvedReferences {
  systemExtra: string;
  pinnedBusiness: Array<{
    scope: string;
    taskKey: string;
    subtype?: string | null;
    label?: string;
    formSchemaSummary?: string;
  }>;
  knowledgeBaseIds: string[];
  folderIds: string[];
}

export async function resolveReferences(
  userId: string,
  references: AgentReference[]
): Promise<ResolvedReferences> {
  const result: ResolvedReferences = {
    systemExtra: '',
    pinnedBusiness: [],
    knowledgeBaseIds: [],
    folderIds: [],
  };
  if (!references || references.length === 0) return result;

  const chunks: string[] = ['用户在本条消息中 @ 引用了以下资源，请优先围绕它们回答或调用：'];

  for (const ref of references) {
    if (ref.type === 'folder') {
      result.folderIds.push(ref.id);
      try {
        const folderRepo = RepositoryFactory.createFolderRepository();
        const folder = await folderRepo.getFolderById(ref.id);
        const label = ref.label || folder?.name || ref.id;
        let preview = '';
        try {
          const { virtualFolderIndexService } = await import('../folder-index/virtual-folder-index-service');
          const hits = await virtualFolderIndexService.search(userId, ref.id, label, 5);
          if (Array.isArray(hits) && hits.length > 0) {
            preview = hits
              .map((h: any) => `- ${h.title || h.content?.slice?.(0, 80) || h.id}`)
              .join('\n');
          }
        } catch {
          /* index optional */
        }
        chunks.push(`## 虚拟文件夹: ${label} (id=${ref.id})\n${preview || '(暂无索引摘要)'}`);
      } catch {
        chunks.push(`## 虚拟文件夹: ${ref.label || ref.id}`);
      }
    } else if (ref.type === 'file') {
      const label = ref.label || ref.id;
      const folderHint = ref.folderId ? ` folderId=${ref.folderId}` : '';
      const refHint = ref.refType ? ` refType=${ref.refType}` : '';
      const ctHint = ref.contentType ? ` contentType=${ref.contentType}` : '';
      if (ref.folderId && !result.folderIds.includes(ref.folderId)) {
        result.folderIds.push(ref.folderId);
      }
      let preview = '';
      try {
        if (ref.folderId) {
          const { virtualFolderIndexService } = await import('../folder-index/virtual-folder-index-service');
          const hits = await virtualFolderIndexService.search(userId, ref.folderId, label, 3);
          if (Array.isArray(hits) && hits.length > 0) {
            preview = hits
              .map((h: any) => `- ${h.title || h.content?.slice?.(0, 120) || h.id}`)
              .join('\n');
          }
        }
      } catch {
        /* index optional */
      }
      chunks.push(
        `## 文件: ${label} (id=${ref.id}${folderHint}${refHint}${ctHint})\n` +
          `用户点名引用了该文件，请优先围绕它回答或检索。\n` +
          (preview || '')
      );
    } else if (ref.type === 'knowledge') {
      result.knowledgeBaseIds.push(ref.id);
      try {
        const kbRepo = RepositoryFactory.createKnowledgeBaseRepository();
        const kb = await kbRepo.findKnowledgeBaseById(ref.id);
        chunks.push(`## 知识库: ${ref.label || kb?.name || ref.id} (id=${ref.id})`);
      } catch {
        chunks.push(`## 知识库: ${ref.label || ref.id}`);
      }
    } else if (ref.type === 'business') {
      const scope = ref.scope || '';
      const taskKey = ref.taskKey || ref.id;
      const subtype = ref.subtype ?? null;
      let schemaSummary = '';
      let displayName = ref.label || '';
      try {
        if (scope && taskKey) {
          const pec = RepositoryFactory.createPromptEngineeringConfigRepository();
          const row = await pec.findByKey(scope, taskKey, subtype);
          displayName = ref.label || (await resolveBusinessDisplayName(scope, taskKey, subtype));
          const extra = row?.extra && typeof row.extra === 'object' ? (row.extra as Record<string, unknown>) : null;
          const tpl = extra?.taskTemplate;
          const formSchema =
            tpl && typeof tpl === 'object' ? (tpl as { formSchema?: unknown }).formSchema : null;
          if (formSchema && typeof formSchema === 'object' && (formSchema as { properties?: unknown }).properties) {
            const keys = Object.keys((formSchema as { properties: Record<string, unknown> }).properties).slice(0, 20);
            schemaSummary = `参数字段: ${keys.join(', ')}`;
          }
          result.pinnedBusiness.push({
            scope,
            taskKey,
            subtype,
            label: displayName,
            formSchemaSummary: schemaSummary,
          });
          chunks.push(
            `## 业务: ${displayName}\n` +
              `用户 @ 引用了该业务，请优先围绕它回答或调用 run_business_task（内部 scope=${scope}, taskKey=${taskKey}${subtype ? `, subtype=${subtype}` : ''}，勿向用户展示）。\n` +
              (schemaSummary || '')
          );
        } else {
          chunks.push(`## 业务: ${ref.label || ref.id}`);
        }
      } catch {
        chunks.push(`## 业务: ${displayName || ref.label || ref.id}`);
      }
    }
  }

  result.systemExtra = chunks.join('\n\n');
  return result;
}
