import { describe, expect, it } from 'vitest';
import { runEntityDiveStep } from './entity-dive-step';
import { withContract } from './input-stage';
import { emptyContract, MXM_WARP_CONTRACT_VERSION } from './contract-types';
import type { TaskContext, PipelineStep } from '../types';

function baseCtx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    scope: 'writing',
    taskKey: 'generator',
    subtype: 'company-deep-dive',
    taskId: 't1',
    params: { language: 'zh' },
    state: {},
    ...overrides,
  };
}

function makeSeedContract(opts: {
  wsItems?: Array<{ title: string; snippet?: string }>;
  business?: Record<string, unknown>;
} = {}): TaskContext {
  let ctx = baseCtx();
  ctx = withContract(
    ctx,
    emptyContract({
      version: MXM_WARP_CONTRACT_VERSION,
      scope: 'writing',
      taskKey: 'generator',
      subtype: null,
      taskId: 't1',
    })
  );
  const c = ctx.state.contract as any;
  if (opts.wsItems) {
    c.sources = { websource: { query: '初始话题', items: opts.wsItems } };
  }
  if (opts.business) {
    c.business = opts.business;
  }
  return { ...ctx, state: { ...ctx.state, contract: c } };
}

describe('mxm-warp entityDive step', () => {
  it('uses LLM to extract entities + second-layer queries from retrieved web text', async () => {
    const ctx = makeSeedContract({
      wsItems: [
        {
          title: '某 AI 公司创始人张一鸣宣布新产品',
          snippet: '该公司近期发布了旗舰产品 ByteDance AI。',
        },
        {
          title: '某 AI 公司获得新一轮融资',
          snippet: '估值达到 X 亿元，由红杉资本领投。',
        },
      ],
    });
    const seenQueries: string[] = [];
    const out = await runEntityDiveStep(
      ctx,
      {
        step: 'entityDive',
        params: { maxEntities: 3, queriesPerEntity: 2, extractContent: false },
      },
      {
        llm: async () =>
          JSON.stringify({
            entities: [
              {
                name: '张一鸣',
                kind: 'person',
                queries: ['张一鸣 履历 背景 学历', '张一鸣 争议 评价'],
              },
              {
                name: '某 AI 公司',
                kind: 'company',
                queries: ['某 AI 公司 产品 财务 客户'],
              },
            ],
          }),
        search: async (args) => {
          seenQueries.push(args.query);
          return {
            providers: [args.query.includes('争议') ? 'tavily' : 'brave'],
            items: [
              {
                title: `${args.query}-hit`,
                url: `https://e.example/${encodeURIComponent(args.query)}`,
                snippet: `snippet ${args.query}`,
                domain: 'e.example',
              },
            ],
          };
        },
      }
    );
    const c = out.state.contract as {
      enrich_search: {
        entity_dive: {
          entities: Array<{ name: string; kind: string }>;
          records: Array<{
            entity: { name: string; kind: string };
            status: string;
            evidences: Array<{ query: string; hits: unknown[] }>;
          }>;
        };
      };
    };
    expect(c.enrich_search.entity_dive.entities.length).toBe(2);
    expect(c.enrich_search.entity_dive.entities[0]?.name).toBe('张一鸣');
    expect(c.enrich_search.entity_dive.entities[0]?.kind).toBe('person');
    const founder = c.enrich_search.entity_dive.records.find(
      (r) => r.entity.name === '张一鸣'
    );
    expect(founder).toBeDefined();
    expect(founder!.status).toBe('ok');
    expect(founder!.evidences.length).toBe(2);
    expect(founder!.evidences[0]!.query).toContain('张一鸣');
    expect(seenQueries.some((q) => q.includes('张一鸣'))).toBe(true);
    expect(seenQueries.some((q) => q.includes('某 AI 公司'))).toBe(true);
  });

  it('does NOT depend on business.founder / business.subject_company keys', async () => {
    // 同样的业务字段命名在另一话题可能完全无意义；entityDive 必须只依赖已检索内容
    const ctx = makeSeedContract({
      wsItems: [
        {
          title: '某导演的新电影上映',
          snippet: '讲述了一段关于气候变化的故事。',
        },
      ],
      business: { some_random_field: '不可预测的字段' }, // 不应被读取
    });
    const out = await runEntityDiveStep(
      ctx,
      {
        step: 'entityDive',
        params: { maxEntities: 2, queriesPerEntity: 1, extractContent: false },
      },
      {
        llm: async () =>
          JSON.stringify({
            entities: [
              { name: '某导演', kind: 'person', queries: ['某导演 作品 风格'] },
            ],
          }),
        search: async () => ({
          providers: ['brave'],
          items: [{ title: 't', url: 'u', snippet: 's', domain: 'd' }],
        }),
      }
    );
    const c = out.state.contract as {
      enrich_search: { entity_dive: { entities: Array<{ name: string }> } };
    };
    expect(c.enrich_search.entity_dive.entities[0]?.name).toBe('某导演');
  });

  it('writes empty entity_dive when no retrieved text', async () => {
    const ctx = makeSeedContract({});
    const out = await runEntityDiveStep(ctx, {
      step: 'entityDive',
      params: { maxEntities: 2, extractContent: false },
    });
    const c = out.state.contract as {
      enrich_search: { entity_dive: { entities: unknown[]; records: unknown[] } };
    };
    expect(c.enrich_search.entity_dive.entities.length).toBe(0);
    expect(c.enrich_search.entity_dive.records.length).toBe(0);
  });

  it('records status when search returns empty', async () => {
    const ctx = makeSeedContract({
      wsItems: [
        {
          title: '某科技公司昨天在港交所正式发布了旗舰产品 AlphaGo-2',
          snippet: '据公告，该公司表示新产品将在多个垂直行业落地。',
        },
        {
          title: '某科技公司获得新融资，红杉资本领投',
          snippet: '本轮融资规模约为 5 亿美元，估值显著上升。',
        },
      ],
    });
    const out = await runEntityDiveStep(
      ctx,
      {
        step: 'entityDive',
        params: { maxEntities: 1, queriesPerEntity: 1, extractContent: false },
      },
      {
        llm: async () =>
          JSON.stringify({
            entities: [
              { name: '某公司', kind: 'company', queries: ['某公司 产品 财务'] },
            ],
          }),
        search: async () => ({ providers: ['brave'], items: [] }),
      }
    );
    const c = out.state.contract as {
      enrich_search: {
        entity_dive: {
          entities: Array<{ name: string }>;
          records: Array<{ status: string; entity: { name: string } }>;
        };
      };
    };
    expect(c.enrich_search.entity_dive.entities[0]?.name).toBe('某公司');
    // items=0 + provider 仍在 → low_quality（区别于搜索完全失败的 no_result）
    expect(c.enrich_search.entity_dive.records[0]?.entity.name).toBe('某公司');
    expect(c.enrich_search.entity_dive.records[0]?.status).toBe('low_quality');
  });

  it('records no_result status when ALL searches fail', async () => {
    const ctx = makeSeedContract({
      wsItems: [
        {
          title: '某科技公司昨天在港交所正式发布了旗舰产品 AlphaGo-2',
          snippet: '据公告，该公司表示新产品将在多个垂直行业落地。',
        },
        {
          title: '某科技公司获得新融资，红杉资本领投',
          snippet: '本轮融资规模约为 5 亿美元，估值显著上升。',
        },
      ],
    });
    const out = await runEntityDiveStep(
      ctx,
      {
        step: 'entityDive',
        params: { maxEntities: 1, queriesPerEntity: 1, extractContent: false },
      },
      {
        llm: async () =>
          JSON.stringify({
            entities: [
              { name: '某公司', kind: 'company', queries: ['某公司 产品 财务'] },
            ],
          }),
        search: async () => {
          throw new Error('网络故障');
        },
      }
    );
    const c = out.state.contract as {
      enrich_search: {
        entity_dive: { records: Array<{ status: string }> };
      };
    };
    expect(c.enrich_search.entity_dive.records[0]?.status).toBe('no_result');
  });

  it('falls back gracefully when LLM is not available', async () => {
    const ctx = makeSeedContract({
      wsItems: [{ title: '某事件', snippet: '详情' }],
    });
    // 不注入 llm：应返回空 records 且不抛错
    const out = await runEntityDiveStep(
      ctx,
      { step: 'entityDive', params: { maxEntities: 1 } },
      {
        search: async () => ({ providers: ['brave'], items: [] }),
      }
    );
    const c = out.state.contract as {
      enrich_search: { entity_dive: { entities: unknown[]; records: unknown[] } };
    };
    expect(c.enrich_search.entity_dive.entities.length).toBe(0);
  });
});