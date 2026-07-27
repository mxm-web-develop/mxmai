/**
 * 行业日报检索赛道分类：枚举行业直映射；自定义行业走 text 业务（模型）。
 */
import type { TaskRunV2Request } from '../types';
import {
  escapeRawControlsInJsonStrings,
  extractJsonObject,
  stripOuterMarkdownFence,
} from '../parse-llm-json';
import { MXM_WARP_CONTRACT_VERSION, emptyContract } from './contract-types';

export type IndustrySearchTrack = 'finance' | 'tech' | 'entertainment' | 'sports' | 'general';


function parseNestedTextTaskKey(nestedTextTaskKey: string): {
  taskKey: string;
  subtype: string | null;
} {
  const parts = nestedTextTaskKey.trim().split('/').filter(Boolean);
  // text/expert/industry-search-track → taskKey=expert, subtype=industry-search-track
  if (parts[0] === 'text' && parts.length >= 2) {
    return {
      taskKey: parts[1]!,
      subtype: parts.length >= 3 ? parts.slice(2).join('/') : null,
    };
  }
  return { taskKey: parts[0] || 'expert', subtype: parts[1] ?? null };
}

export const DEFAULT_TRACK_CLASSIFY_TEXT_KEY = 'text/expert/industry-search-track';

const TRACKS: IndustrySearchTrack[] = [
  'finance',
  'tech',
  'entertainment',
  'sports',
  'general',
];

export function isIndustrySearchTrack(v: unknown): v is IndustrySearchTrack {
  return typeof v === 'string' && (TRACKS as string[]).includes(v);
}

/** 表单枚举行业 → track（不走模型）；兼容旧四大类与细拆子类 */
export function mapEnumIndustryToTrack(industry: string): IndustrySearchTrack | null {
  const s = industry.trim();
  // 旧四大类
  if (s === '金融') return 'finance';
  if (s === '科技') return 'tech';
  if (s === '娱乐') return 'entertainment';
  if (s === '体育') return 'sports';
  // 金融细拆
  if (
    s === '股票' ||
    s === '基金' ||
    s === '银行保险' ||
    s === '加密货币' ||
    s === '证券' ||
    s === '银行' ||
    s === '保险'
  ) {
    return 'finance';
  }
  // 科技细拆
  if (
    s === '人工智能' ||
    s === '半导体' ||
    s === '消费电子' ||
    s === '互联网' ||
    s === '云计算' ||
    s === '芯片'
  ) {
    return 'tech';
  }
  // 娱乐细拆
  if (s === '影视综' || s === '音乐' || s === '游戏' || s === '明星') {
    return 'entertainment';
  }
  // 体育细拆
  if (
    s === '足球' ||
    s === '篮球' ||
    s === '网球' ||
    s === '赛车' ||
    s === 'F1' ||
    s === '电竞'
  ) {
    return 'sports';
  }
  return null;
}

export function resolveSectorLabel(params: Record<string, unknown>): string {
  const industry = String(params.industry ?? '').trim();
  const custom = String(params.industry_custom ?? '').trim();
  if (industry === '其他' || industry === '其它') return custom || '综合';
  if (custom && (industry === custom || !industry)) return custom;
  return industry || custom || '综合';
}

/**
 * 从 params / basic 读取已有 search_track；无效则 null。
 */
export function readExistingSearchTrack(
  params: Record<string, unknown>
): IndustrySearchTrack | null {
  for (const key of ['search_track', 'searchTrack']) {
    const v = params[key];
    if (isIndustrySearchTrack(v)) return v;
  }
  return null;
}

/** 解析模型 JSON：{ track, sector_label?, reason? } */
export function parseTrackClassifyOutput(raw: string): {
  track: IndustrySearchTrack;
  sector_label?: string;
  reason?: string;
} | null {
  const body = stripOuterMarkdownFence(String(raw ?? '').trim());
  if (!body) return null;
  const attempts = [body, extractJsonObject(body) ?? ''].filter(Boolean);
  for (const cand of attempts) {
    for (const variant of [cand, escapeRawControlsInJsonStrings(cand)]) {
      try {
        const parsed = JSON.parse(variant) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
        const o = parsed as Record<string, unknown>;
        const trackRaw = String(o.track ?? o.search_track ?? '').trim().toLowerCase();
        if (!isIndustrySearchTrack(trackRaw)) continue;
        return {
          track: trackRaw,
          sector_label:
            typeof o.sector_label === 'string' ? o.sector_label.trim() : undefined,
          reason: typeof o.reason === 'string' ? o.reason.trim() : undefined,
        };
      } catch {
        /* next */
      }
    }
  }
  // 宽松：正文里直接出现 track 词
  const lower = body.toLowerCase();
  for (const t of TRACKS) {
    if (new RegExp(`"track"\\s*:\\s*"${t}"`).test(lower) || lower.includes(`track":"${t}"`)) {
      return { track: t };
    }
  }
  return null;
}

/**
 * 自定义赛道无模型时的保守启发式（仅作模型失败兜底，禁止作为主路径）。
 * 含 F1 / 赛车等，避免再落到 general「行业新闻」。
 */
export function inferTrackHeuristicFallback(sector: string): IndustrySearchTrack {
  const s = sector.toLowerCase();
  if (/金融|财经|证券|银行|保险|股票|基金|加密|fund|finance|bank|fintech|stock|crypto/.test(s))
    return 'finance';
  if (
    /科技|互联网|人工智能|ai|芯片|半导体|云计算|软件|消费电子|tech|digital|数码/.test(s)
  )
    return 'tech';
  if (/娱乐|影视|综艺|明星|文娱|音乐|游戏|entertainment|movie|tv|music|game/.test(s))
    return 'entertainment';
  if (
    /体育|足球|篮球|网球|奥运|体育赛事|sports|nba|fifa|f1|formula\s*1|一级方程|赛车|赛道|大奖赛|grand\s*prix|motogp|亨格罗林|hungaroring|tennis/.test(
      s
    )
  ) {
    return 'sports';
  }
  return 'general';
}

function buildTrackClassifyRequest(args: {
  taskKey: string;
  subtype: string | null;
  industry: string;
  industryCustom?: string;
  sector: string;
  parentTaskId?: string;
  /** 宿主业务身份；缺省不伪造 writing/editorial/industry-daily */
  hostScope?: string;
  hostTaskKey?: string;
  hostSubtype?: string | null;
}): TaskRunV2Request {
  const hostScope = String(args.hostScope ?? 'writing').trim() || 'writing';
  const hostTaskKey = String(args.hostTaskKey ?? 'editorial').trim() || 'editorial';
  const hostSubtype =
    args.hostSubtype === undefined || args.hostSubtype === null
      ? null
      : String(args.hostSubtype).trim() || null;
  const contract = emptyContract({
    version: MXM_WARP_CONTRACT_VERSION,
    scope: hostScope,
    taskKey: hostTaskKey,
    subtype: hostSubtype,
    taskId: args.parentTaskId || '',
  });
  contract.basic = {
    industry: args.industry,
    ...(args.industryCustom ? { industry_custom: args.industryCustom } : {}),
    sector_label: args.sector,
  };
  return {
    scope: 'text',
    taskKey: args.taskKey,
    subtype: args.subtype,
    params: {
      contract,
      field_specs: [
        {
          name: 'track',
          type: 'string',
          description: 'Must be one of: finance | tech | entertainment | sports | general',
        },
        {
          name: 'sector_label',
          type: 'string',
          description: 'Normalized sector display name',
        },
        {
          name: 'reason',
          type: 'string',
          description: 'One short reason',
        },
      ],
    },
  };
}

/**
 * 调用 text/expert/industry-search-track 分类自定义赛道。
 * 失败时抛错（调用方可 catch 后走启发式兜底）。
 */
export async function classifyIndustrySearchTrackViaTextBusiness(args: {
  textKey?: string;
  userId: string;
  industry: string;
  industryCustom?: string;
  parentTaskId?: string;
  hostScope?: string;
  hostTaskKey?: string;
  hostSubtype?: string | null;
}): Promise<{ track: IndustrySearchTrack; sector_label: string; reason?: string; textTaskId: string }> {
  const sector = resolveSectorLabel({
    industry: args.industry,
    industry_custom: args.industryCustom,
  });
  const textKey = (args.textKey || DEFAULT_TRACK_CLASSIFY_TEXT_KEY).trim();
  if (!textKey.startsWith('text/')) {
    throw new Error('未配置赛道分类 text 业务');
  }
  const { taskKey, subtype } = parseNestedTextTaskKey(textKey);
  const { runTaskV2 } = await import('../task-engine');

  const req = buildTrackClassifyRequest({
    taskKey,
    subtype,
    industry: args.industry,
    industryCustom: args.industryCustom,
    sector,
    parentTaskId: args.parentTaskId,
    hostScope: args.hostScope,
    hostTaskKey: args.hostTaskKey,
    hostSubtype: args.hostSubtype,
  });

  const result = await runTaskV2(req, args.userId);
  if (!result.success || !result.syncResult) {
    throw new Error(
      `赛道分类 text 业务失败：${textKey} status=${result.status} taskId=${result.taskId ?? ''}`
    );
  }

  const rawText = result.syncResult.text ?? '';
  const parsed = parseTrackClassifyOutput(rawText);
  if (!parsed) {
    throw new Error(
      `赛道分类未返回合法 track（taskId=${result.taskId}，预览：${rawText.replace(/\s+/g, ' ').slice(0, 160)}）`
    );
  }
  return {
    track: parsed.track,
    sector_label: parsed.sector_label || sector,
    reason: parsed.reason,
    textTaskId: result.taskId!,
  };
}

/**
 * 解析最终 search_track：已有值 > 枚举映射 >（可选）模型 > 启发式兜底。
 */
export async function resolveSearchTrackForParams(
  params: Record<string, unknown>,
  opts?: {
    userId?: string;
    textKey?: string;
    parentTaskId?: string;
    /** 自定义行业是否强制走模型；默认 true */
    requireModelForCustom?: boolean;
    hostScope?: string;
    hostTaskKey?: string;
    hostSubtype?: string | null;
  }
): Promise<{
  track: IndustrySearchTrack;
  sector: string;
  source: 'param' | 'enum' | 'model' | 'heuristic';
  textTaskId?: string;
}> {
  const sector = resolveSectorLabel(params);
  const existing = readExistingSearchTrack(params);
  if (existing) {
    return { track: existing, sector, source: 'param' };
  }

  const industry = String(params.industry ?? '').trim();
  const enumTrack = mapEnumIndustryToTrack(industry);
  if (enumTrack && industry !== '其他' && industry !== '其它') {
    return { track: enumTrack, sector, source: 'enum' };
  }

  const requireModel = opts?.requireModelForCustom !== false;
  const userId = String(opts?.userId ?? '').trim();
  if (requireModel && userId) {
    try {
      const classified = await classifyIndustrySearchTrackViaTextBusiness({
        textKey: opts?.textKey,
        userId,
        industry: industry || '其他',
        industryCustom: String(params.industry_custom ?? '').trim() || sector,
        parentTaskId: opts?.parentTaskId,
        hostScope: opts?.hostScope,
        hostTaskKey: opts?.hostTaskKey,
        hostSubtype: opts?.hostSubtype,
      });
      return {
        track: classified.track,
        sector: classified.sector_label || sector,
        source: 'model',
        textTaskId: classified.textTaskId,
      };
    } catch (e) {
      console.warn(
        '[industry-search-track] model classify failed, heuristic fallback:',
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    track: inferTrackHeuristicFallback(sector),
    sector,
    source: 'heuristic',
  };
}
