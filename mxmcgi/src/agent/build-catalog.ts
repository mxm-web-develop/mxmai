import { RepositoryFactory, pickDisplayLocalizedString, type AppLocale } from '@mxmai/mxmdata';
import type { PromptEngineeringConfig } from '@mxmai/mxmdata';
import type { Smartflow } from '../smartflow/core/models/types';
import { smartflowRepository } from '../smartflow/core/engine/repository';
import { mergePlatformFieldsIntoFormSchema } from '../tasks/platform-fields';
import type { JsonSchemaV2, TaskScope } from '../tasks/types';
import {
  AGENT_CATALOG_SCHEMA_VERSION,
  AGENT_TASK_SCOPES,
  type AgentCatalog,
  type AgentCatalogSmartflowItem,
  type AgentCatalogTaskV2Item,
} from './catalog-types';
import { buildSnapshotForSmartflowStart, findSmartflowStartNode } from '../open-api/schema-builder';
import { summarizeInputSchema } from './schema-summary';

function displayLabels(
  row: PromptEngineeringConfig,
  locale: AppLocale = 'zh'
): {
  taskLabel: string | null;
  subtypeLabel: string | null;
} {
  const extra = row.extra && typeof row.extra === 'object' ? row.extra : null;
  const display = extra && typeof (extra as { display?: unknown }).display === 'object'
    ? ((extra as { display: Record<string, unknown> }).display)
    : null;
  const taskPrimary =
    display && typeof display.taskLabel === 'string' ? display.taskLabel : null;
  const subtypePrimary =
    display && typeof display.subtypeLabel === 'string' ? display.subtypeLabel : null;
  const taskI18n =
    display?.taskLabelI18n && typeof display.taskLabelI18n === 'object'
      ? (display.taskLabelI18n as Record<string, string>)
      : undefined;
  const subtypeI18n =
    display?.subtypeLabelI18n && typeof display.subtypeLabelI18n === 'object'
      ? (display.subtypeLabelI18n as Record<string, string>)
      : undefined;
  return {
    taskLabel: pickDisplayLocalizedString(taskPrimary, taskI18n, locale) || null,
    subtypeLabel: pickDisplayLocalizedString(subtypePrimary, subtypeI18n, locale) || null,
  };
}

function formSchemaFromRow(row: PromptEngineeringConfig, scope: TaskScope): JsonSchemaV2 | null {
  const extra = row.extra && typeof row.extra === 'object' ? row.extra : null;
  const tpl = extra?.taskTemplate;
  if (!tpl || typeof tpl !== 'object') return null;
  const formSchema = (tpl as { formSchema?: unknown }).formSchema;
  if (!formSchema || typeof formSchema !== 'object') return null;
  return mergePlatformFieldsIntoFormSchema(formSchema as JsonSchemaV2, scope);
}

async function buildTaskV2Catalog(locale: AppLocale = 'zh'): Promise<AgentCatalogTaskV2Item[]> {
  const repo = RepositoryFactory.createPromptEngineeringConfigRepository();
  const items: AgentCatalogTaskV2Item[] = [];

  for (const scope of AGENT_TASK_SCOPES) {
    const list = await repo.list({ scope, limit: 500, offset: 0 });
    for (const row of list.items) {
      if (row.is_active === false) continue;
      const formSchema = formSchemaFromRow(row, scope as TaskScope);
      if (!formSchema) continue;

      const { taskLabel, subtypeLabel } = displayLabels(row, locale);
      const summary = summarizeInputSchema(formSchema);
      const taskKey = String(row.type);
      const subtype = row.subtype ?? null;
      const qs = new URLSearchParams({ scope, taskKey });
      if (subtype) qs.set('subtype', subtype);

      items.push({
        scope,
        taskKey,
        subtype,
        taskLabel,
        subtypeLabel,
        required: summary.required,
        fields: summary.fields,
        ...(summary.referenceImageSlots.length > 0
          ? { referenceImageSlots: summary.referenceImageSlots }
          : {}),
        paramsExample: summary.paramsExample,
        formConfigUrl: `/api/v2/tasks/form-config?${qs.toString()}`,
        run: {
          method: 'POST',
          path: '/api/v2/tasks/run',
          bodyShape: { scope, taskKey, subtype, params: summary.paramsExample },
        },
        poll: { method: 'GET', pathTemplate: '/api/v2/tasks/{taskId}' },
      });
    }
  }

  return items;
}

function mergeAccessibleSmartflows(userId: string, userFlows: Smartflow[], publicFlows: Smartflow[]): Smartflow[] {
  const map = new Map<string, Smartflow>();
  for (const sf of userFlows) map.set(sf.id, sf);
  for (const sf of publicFlows) {
    if (!map.has(sf.id)) map.set(sf.id, sf);
  }
  return [...map.values()].filter((sf) => {
    const status = sf.status ?? 'active';
    if (status === 'active') return true;
    return sf.author_id === userId;
  });
}

async function buildSmartflowCatalog(userId: string): Promise<AgentCatalogSmartflowItem[]> {
  const [userFlows, publicFlows] = await Promise.all([
    smartflowRepository.findByUserId(userId, 200, 0),
    smartflowRepository.findPublic(200, 0),
  ]);
  const flows = mergeAccessibleSmartflows(userId, userFlows, publicFlows);

  return flows.map((sf) => {
    const start = findSmartflowStartNode(sf.schema as { nodes?: unknown[] });
    const { schema } = buildSnapshotForSmartflowStart(start);
    const summary = summarizeInputSchema(schema);

    return {
      id: sf.id,
      name: sf.name,
      description: sf.description ?? null,
      status: sf.status ?? 'active',
      category: sf.category ?? null,
      isPublic: !!sf.is_public,
      isOwner: sf.author_id === userId,
      required: summary.required,
      fields: summary.fields,
      ...(summary.referenceImageSlots.length > 0
        ? { referenceImageSlots: summary.referenceImageSlots }
        : {}),
      paramsExample: summary.paramsExample,
      execute: {
        method: 'POST',
        pathTemplate: '/api/v1/smartflows/{id}/execute',
        bodyShape: { input_data: summary.paramsExample },
      },
      poll: { method: 'GET', pathTemplate: '/api/v1/smartflow-tasks/{executionId}' },
    };
  });
}

export async function buildAgentCatalog(params: {
  userId: string;
  baseUrl: string;
  locale?: AppLocale;
}): Promise<AgentCatalog> {
  const base = params.baseUrl.replace(/\/$/, '');
  const locale = params.locale ?? 'zh';
  const [taskV2, smartflows] = await Promise.all([
    buildTaskV2Catalog(locale),
    buildSmartflowCatalog(params.userId),
  ]);

  return {
    schemaVersion: AGENT_CATALOG_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    audience: 'personal',
    authentication: {
      type: 'bearer',
      header: 'Authorization',
      prefix: 'mxm_',
    },
    discovery: {
      catalog: `${base}/api/v1/agent/catalog`,
      refreshHint:
        '个人访问凭证专用目录：Task V2 与 Smartflow 直连，计费扣 Key 所属用户。不含第三方 Open API slug；第三方集成请用 integration Key 与 /api/v1/open/*。',
    },
    endpoints: {
      taskRun: `${base}/api/v2/tasks/run`,
      taskFormConfigList: `${base}/api/v2/tasks/form-config/list?scope={scope}`,
      taskFormConfig: `${base}/api/v2/tasks/form-config?scope={scope}&taskKey={taskKey}`,
      smartflowList: `${base}/api/v1/smartflows/`,
      smartflowExecute: `${base}/api/v1/smartflows/{id}/execute`,
      upload: `${base}/api/v1/cgi/upload/assets?storageMode=temp`,
    },
    taskV2,
    smartflows,
  };
}
