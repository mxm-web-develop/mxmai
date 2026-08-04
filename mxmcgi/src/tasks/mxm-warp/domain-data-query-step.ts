/**
 * enrich/pre 确定性步：domainDataQuery — 专业数据源（CoinGecko / Finnhub / DefiLlama…）
 * 与 webSearch（新闻）互补；业务用 whenDomains / industry 映射决定是否跑。
 *
 * params：
 * - domain?: DataDomain | 'auto'  显式领域；缺省从 industry/query 推断
 * - industryFrom?: 路径，默认 contract.basic.industry（兼读 params.industry）
 * - queryTemplate?: 插值查询；缺省用「行业 + 大盘/行情」
 * - queryFrom?: 路径优先于 template
 * - target?: enrich_search.<key>，默认 enrich_search.market_snapshot
 * - whenDomains?: string[]  仅当推断 domain ∈ 此列表时执行（如 ["stock","crypto","finance"]）
 * - skipIfEmpty?: boolean 默认 true — 无可用 provider/摘要时不写空包
 */
import type { PipelineStep, TaskContext } from '../types';
import { registerInputStep, registerOutputStep } from '../pipeline-registry';
import { getContract, withContract } from './input-stage';
import { putEvidence, slimWebSearchForContract, targetToEvidenceKey } from './evidence';
import type { DataDomain } from '../../core/data-sources/types';

function readPath(ctx: TaskContext, path: string): unknown {
  const p = path.trim();
  if (!p) return undefined;
  if (p.startsWith('params.')) {
    return (ctx.params as Record<string, unknown>)?.[p.slice('params.'.length)];
  }
  if (p.startsWith('contract.')) {
    const c = getContract(ctx) as Record<string, unknown> | null;
    if (!c) return undefined;
    const parts = p.slice('contract.'.length).split('.');
    let cur: unknown = c;
    for (const part of parts) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
  }
  return (ctx.params as Record<string, unknown>)?.[p];
}

function interpolate(template: string, ctx: TaskContext): string {
  return template.replace(/\$\{([^}]+)\}/g, (_m, raw: string) => {
    const v = readPath(ctx, String(raw || '').trim());
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }).replace(/\s+/g, ' ').trim();
}

/** 行业显示名 → 专业数据领域（平台通用，非 taskKey 硬编码） */
export function mapIndustryLabelToDataDomain(industry: string): DataDomain | null {
  const s = String(industry || '').trim();
  if (!s) return null;
  if (/加密|区块链|币圈|web3|crypto|bitcoin|btc|eth|代币|数字货币/i.test(s)) return 'crypto';
  if (/股票|证券|a股|美股|港股|股市|equity|nasdaq|nyse|上证|深证|创业板|科创/i.test(s)) {
    return 'stock';
  }
  if (/财经|金融|基金|债券|外汇|期货|银行|保险|macro|fund|bond/i.test(s)) return 'finance';
  if (/法律|司法|法规|合规/i.test(s)) return 'legal';
  if (/工商|企查|企业尽调/i.test(s)) return 'business';
  return null;
}

async function resolveDomain(
  params: Record<string, unknown>,
  ctx: TaskContext,
  query: string
): Promise<DataDomain | null> {
  const explicit = String(params.domain ?? '').trim();
  if (explicit && explicit !== 'auto') return explicit as DataDomain;

  const industryPath = String(params.industryFrom ?? 'contract.basic.industry').trim();
  let industry = String(readPath(ctx, industryPath) ?? '').trim();
  if (!industry) {
    industry = String((ctx.params as Record<string, unknown>)?.industry ?? '').trim();
  }
  const fromIndustry = mapIndustryLabelToDataDomain(industry);
  if (fromIndustry) return fromIndustry;

  const { inferDataDomain } = await import('../../core/data-sources/domain-router');
  return inferDataDomain(query) || mapIndustryLabelToDataDomain(query);
}

export async function runDomainDataQueryStep(
  ctx: TaskContext,
  step: PipelineStep
): Promise<TaskContext> {
  const params = (step.params ?? {}) as Record<string, unknown>;
  const target = String(params.target ?? 'enrich_search.market_snapshot').trim();
  const skipIfEmpty = params.skipIfEmpty !== false;

  const queryFrom = String(params.queryFrom ?? '').trim();
  let query = queryFrom ? String(readPath(ctx, queryFrom) ?? '').trim() : '';
  if (!query) {
    const tmpl = String(
      params.queryTemplate ??
        '${contract.basic.industry} ${contract.basic.date_label} 大盘 行情 指数'
    ).trim();
    query = interpolate(tmpl, ctx);
  }
  if (!query) {
    const industry = String((ctx.params as Record<string, unknown>)?.industry ?? '').trim();
    query = industry ? `${industry} 大盘行情` : '';
  }
  if (!query) return ctx;

  const domain = await resolveDomain(params, ctx, query);
  const whenDomains = Array.isArray(params.whenDomains)
    ? params.whenDomains.map((d) => String(d).trim()).filter(Boolean)
    : [];
  if (whenDomains.length > 0) {
    if (!domain || !whenDomains.includes(domain)) return ctx;
  }
  if (!domain) return ctx;

  const { DataSourceService } = await import('../../core/data-sources/data-source-service');
  const service = new DataSourceService();
  const result = await service.query({ query, domain });

  const summary = String(result.summary || '').trim();
  const hasData =
    summary.length > 0 &&
    result.provider !== 'none' &&
    !/未配置|无可用|无法解析|未找到匹配|失败/.test(summary);

  if (!hasData && skipIfEmpty) {
    console.warn(
      `[domainDataQuery] skip empty domain=${domain} provider=${result.provider} q=${query.slice(0, 80)}`
    );
    return ctx;
  }

  const fetchedAt = result.provenance?.fetchedAt || new Date().toISOString();
  const text = [
    `【高保真行情 · ${result.provider} · ${domain}】`,
    `查询: ${query}`,
    `抓取: ${fetchedAt}`,
    result.provenance?.sourceUrl ? `来源: ${result.provenance.sourceUrl}` : '',
    '',
    summary || '（无摘要）',
  ]
    .filter(Boolean)
    .join('\n');

  const payload: Record<string, unknown> = {
    query,
    domain,
    provider: result.provider,
    hitCount: hasData ? 1 : 0,
    text,
    summary,
    structuredData: result.structuredData,
    provenance: result.provenance,
    items: hasData
      ? [
          {
            title: `${result.provider} ${domain} snapshot`,
            snippet: summary.slice(0, 400),
            url: result.provenance?.sourceUrl,
            domain: result.provider,
          },
        ]
      : [],
  };

  const evidenceKey = targetToEvidenceKey(target);
  let next = putEvidence(ctx, evidenceKey, payload);
  const contract = getContract(next);
  if (contract && target.startsWith('enrich_search.')) {
    const key = target.slice('enrich_search.'.length);
    next = withContract(next, {
      ...contract,
      enrich_search: {
        ...contract.enrich_search,
        [key]: slimWebSearchForContract(payload, evidenceKey),
      },
    });
  }
  return next;
}

export function registerDomainDataQueryStep(): void {
  registerInputStep('domainDataQuery', runDomainDataQueryStep);
  registerOutputStep('domainDataQuery', runDomainDataQueryStep);
}

registerDomainDataQueryStep();
