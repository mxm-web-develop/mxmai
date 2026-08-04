/**
 * 免费 A 股/港股常用指数快照（新浪财经公开行情串，无需 API Key）
 * 用于行业日报「股票/财经」时段大势数字锚点，避免只靠新闻二次转述。
 */
import type { DataSourceProvider } from './base';
import type { DataSourceRequest, DataSourceResult } from '../types';
import { getDataSourceProviderConfig } from '../data-source-config';

const SINA_HQ = 'https://hq.sinajs.cn/list=';

/** 代码 → 展示名（新浪简码） */
const INDEX_PRESETS: Array<{ code: string; label: string }> = [
  { code: 's_sh000001', label: '上证指数' },
  { code: 's_sz399001', label: '深证成指' },
  { code: 's_sz399006', label: '创业板指' },
  { code: 's_sh000688', label: '科创50' },
  { code: 's_sh000016', label: '上证50' },
  { code: 's_sh000300', label: '沪深300' },
  { code: 's_hkHSI', label: '恒生指数' },
];

type IndexRow = {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  amount: number | null;
};

function parseSinaLine(code: string, body: string): IndexRow | null {
  // var hq_str_s_sh000001="上证指数,3200.12,12.34,0.39,123456789,123456";
  const re = new RegExp(`hq_str_${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}="([^"]*)"`);
  const m = body.match(re);
  if (!m) return null;
  const parts = m[1].split(',');
  if (parts.length < 4) return null;
  const num = (i: number) => {
    const v = Number(parts[i]);
    return Number.isFinite(v) ? v : null;
  };
  return {
    code,
    name: parts[0] || code,
    price: num(1),
    change: num(2),
    changePct: num(3),
    volume: num(4),
    amount: num(5),
  };
}

function wantsUsOrHk(query: string): boolean {
  return /美股|港股|恒生|nasdaq|道指|标普|nyse/i.test(query);
}

function selectCodes(query: string): string[] {
  if (wantsUsOrHk(query) && /港股|恒生/i.test(query)) {
    return ['s_hkHSI', 's_sh000001', 's_sz399001'];
  }
  // 默认 A 股核心指数
  return INDEX_PRESETS.slice(0, 6).map((x) => x.code);
}

export class CnMarketProvider implements DataSourceProvider {
  readonly name = 'cn-market';
  readonly domain = 'stock' as const;

  async query(request: DataSourceRequest): Promise<DataSourceResult> {
    const { query } = request;
    await getDataSourceProviderConfig(this.name);
    const codes = selectCodes(query);
    try {
      const res = await fetch(`${SINA_HQ}${codes.join(',')}`, {
        signal: AbortSignal.timeout(10000),
        headers: {
          Referer: 'https://finance.sina.com.cn',
          'User-Agent':
            'Mozilla/5.0 (compatible; SuperMXMai/1.0; +https://github.com/mxmai)',
        },
      });
      if (!res.ok) {
        return this.emptyResult(query, `新浪行情请求失败: ${res.status}`);
      }
      // 新浪返回 GBK；Node fetch 常按 latin1 解码，中文名可能乱码，数字仍可用
      const buf = Buffer.from(await res.arrayBuffer());
      // 新浪 HQ 为 GBK；优先用预设中文名，避免乱码影响写作
      let text = buf.toString('latin1');
      try {
        // Node 部分环境支持 gbk
        text = new TextDecoder('gbk' as BufferEncoding).decode(buf);
      } catch {
        /* keep latin1 for numeric parse */
      }

      const rows: IndexRow[] = [];
      for (const code of codes) {
        const row = parseSinaLine(code, text);
        if (row && row.price != null) {
          const preset = INDEX_PRESETS.find((x) => x.code === code);
          if (preset) row.name = preset.label;
          rows.push(row);
        }
      }
      if (rows.length === 0) {
        return this.emptyResult(query, '未解析到可用指数行情');
      }

      const summary = rows
        .map((r) => {
          const pct =
            r.changePct != null
              ? `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%`
              : '?';
          const ch =
            r.change != null ? `${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)}` : '?';
          return `${r.name}: ${r.price?.toFixed(2) ?? '?'}（${ch} / ${pct}）`;
        })
        .join('\n');

      return {
        domain: 'stock',
        provider: this.name,
        query,
        summary: `A股/相关指数快照（实时或最近成交）\n${summary}`,
        structuredData: { indices: rows, fetchedVia: 'sina-hq' },
        provenance: {
          provider: this.name,
          domain: 'stock',
          fetchedAt: new Date().toISOString(),
          confidence: 'high',
          sourceUrl: 'https://finance.sina.com.cn',
        },
      };
    } catch (error) {
      console.error('[cn-market] query failed:', error);
      return this.emptyResult(query, '新浪行情请求失败');
    }
  }

  async healthCheck(): Promise<boolean> {
    await getDataSourceProviderConfig(this.name);
    try {
      const res = await fetch(`${SINA_HQ}s_sh000001`, {
        signal: AbortSignal.timeout(8000),
        headers: { Referer: 'https://finance.sina.com.cn' },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private emptyResult(query: string, summary: string): DataSourceResult {
    return {
      domain: 'stock',
      provider: this.name,
      query,
      summary,
      structuredData: null,
      provenance: {
        provider: this.name,
        domain: 'stock',
        fetchedAt: new Date().toISOString(),
        confidence: 'low',
      },
    };
  }
}
