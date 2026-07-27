/**
 * 行业日报报道日解析（Asia/Shanghai）。
 * 支持今日 / 昨日 / 本周 / 本月 / 自定义；检索前统一成日期窗。
 */

export function shanghaiCalendarParts(base = new Date()): {
  y: number;
  m: number;
  d: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(base);
  return {
    y: Number(parts.find((p) => p.type === 'year')?.value),
    m: Number(parts.find((p) => p.type === 'month')?.value),
    d: Number(parts.find((p) => p.type === 'day')?.value),
  };
}

export function shanghaiYmd(dayOffset = 0, base = new Date()): string {
  const { y, m, d } = shanghaiCalendarParts(base);
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatYmdChinese(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

export function shiftYmd(ymd: string, dayDelta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayDelta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * 单日报道检索窗：略放宽到报告日前 1 天～次日（覆盖跨时区发稿；Tavily end_date 为 before）。
 */
export function reportDateSearchWindow(ymd: string): { startDate: string; endDate: string } {
  return {
    startDate: shiftYmd(ymd, -1),
    endDate: shiftYmd(ymd, 1),
  };
}

/** 本周一（上海日历，周一为一周起点） */
export function shanghaiWeekMonday(base = new Date()): string {
  const { y, m, d } = shanghaiCalendarParts(base);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay(); // 0=Sun … 6=Sat
  const daysFromMonday = (dow + 6) % 7;
  return shanghaiYmd(-daysFromMonday, base);
}

/** 本月 1 日 */
export function shanghaiMonthStart(base = new Date()): string {
  const { y, m } = shanghaiCalendarParts(base);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

export type IndustryDailyDateMode = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';
export type IndustryDailyTimeRange = 'day' | 'week' | 'month';

export type IndustryDailySearchBounds = {
  startDate: string;
  endDate: string;
  timeRange: IndustryDailyTimeRange;
  /** 条目 publishedAt 相对锚点日允许偏差（天） */
  maxDaySkew: number;
};

/** 按模式计算检索绝对日期窗 + 引擎 timeRange */
export function industryDailySearchBounds(
  mode: IndustryDailyDateMode,
  ymd: string,
  base = new Date()
): IndustryDailySearchBounds {
  const today = shanghaiYmd(0, base);
  if (mode === 'this_week') {
    return {
      startDate: shanghaiWeekMonday(base),
      endDate: shiftYmd(today, 1),
      timeRange: 'week',
      maxDaySkew: 7,
    };
  }
  if (mode === 'this_month') {
    return {
      startDate: shanghaiMonthStart(base),
      endDate: shiftYmd(today, 1),
      timeRange: 'month',
      maxDaySkew: 31,
    };
  }
  const w = reportDateSearchWindow(ymd);
  return { ...w, timeRange: 'day', maxDaySkew: 2 };
}

/** 写入多语种检索 query 的日期片段 */
export function queryDatePartForMode(
  mode: IndustryDailyDateMode,
  ymd: string,
  locale: 'zh' | 'en' | 'ja'
): string {
  if (mode === 'this_week') {
    return locale === 'en' ? 'this week' : locale === 'ja' ? '今週' : '本周';
  }
  if (mode === 'this_month') {
    return locale === 'en' ? 'this month' : locale === 'ja' ? '今月' : '本月';
  }
  if (locale === 'zh') return formatYmdChinese(ymd);
  return ymd;
}

function padYmd(y: number, m: number, d: number): string | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 把自然语言/相对词解析为 YYYY-MM-DD（上海日历）。
 * 解析失败返回 null。
 */
export function parseNaturalReportDate(raw: string, base = new Date()): string | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return padYmd(y!, m!, d!);
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('/').map(Number);
    return padYmd(y!, m!, d!);
  }

  const { y: cy, m: cm, d: cd } = shanghaiCalendarParts(base);
  if (/^(今天|今日|today)$/i.test(s)) return shanghaiYmd(0, base);
  if (/^(昨天|昨日|yesterday)$/i.test(s)) return shanghaiYmd(-1, base);
  if (/^(前天|前日)$/i.test(s)) return shanghaiYmd(-2, base);
  if (/^(明天|明日|tomorrow)$/i.test(s)) return shanghaiYmd(1, base);

  let m = /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/.exec(s);
  if (m) return padYmd(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})月(\d{1,2})[日号]?$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let ymd = padYmd(cy, month, day);
    if (ymd) {
      const candidate = Date.UTC(cy, month - 1, day);
      const today = Date.UTC(cy, cm - 1, cd);
      if (candidate - today > 60 * 24 * 60 * 60 * 1000) {
        ymd = padYmd(cy - 1, month, day);
      }
    }
    return ymd;
  }

  m = /^(\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let ymd = padYmd(cy, month, day);
    if (ymd) {
      const candidate = Date.UTC(cy, month - 1, day);
      const today = Date.UTC(cy, cm - 1, cd);
      if (candidate - today > 60 * 24 * 60 * 60 * 1000) {
        ymd = padYmd(cy - 1, month, day);
      }
    }
    return ymd;
  }

  const weekMap: Record<string, number> = {
    日: 0,
    天: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
  };
  m = /^上周([日天一二三四五六])$/.exec(s);
  if (m) {
    const target = weekMap[m[1]!];
    if (target == null) return null;
    const todayUtc = new Date(Date.UTC(cy, cm - 1, cd));
    const dow = todayUtc.getUTCDay();
    const daysBack = ((dow + 7 - target) % 7) + 7;
    return shanghaiYmd(-daysBack, base);
  }

  return null;
}

const MODE_ALIASES: Record<string, IndustryDailyDateMode> = {
  today: 'today',
  今日: 'today',
  yesterday: 'yesterday',
  昨日: 'yesterday',
  this_week: 'this_week',
  week: 'this_week',
  本周: 'this_week',
  this_month: 'this_month',
  month: 'this_month',
  本月: 'this_month',
  custom: 'custom',
  指定日期: 'custom',
};

/**
 * 将 date_mode + report_date（可自然语言）解析为标准报道日 / 周期。
 * 本周/本月：ymd 锚在「今日」，检索窗另走 industryDailySearchBounds。
 */
export function resolveIndustryDailyDateLabel(
  params: Record<string, unknown>,
  base = new Date()
): {
  dateLabel: string;
  ymd: string;
  mode: IndustryDailyDateMode;
  rawCustom?: string;
} {
  const rawMode = String(params.date_mode ?? 'today').trim();
  const customRaw = String(params.report_date ?? params.reportDate ?? '').trim();

  const modeAsDate = parseNaturalReportDate(rawMode, base);
  if (
    modeAsDate &&
    !/^(today|yesterday|this_week|this_month|custom|今日|昨日|本周|本月|指定日期)$/i.test(rawMode)
  ) {
    return { dateLabel: modeAsDate, ymd: modeAsDate, mode: 'custom', rawCustom: rawMode };
  }

  const aliased = MODE_ALIASES[rawMode] ?? MODE_ALIASES[rawMode.toLowerCase()];
  let mode: IndustryDailyDateMode = aliased ?? (customRaw ? 'custom' : 'today');
  if (!aliased && customRaw) mode = 'custom';

  if (mode === 'custom') {
    const parsed = parseNaturalReportDate(customRaw || rawMode, base);
    if (parsed) {
      return {
        dateLabel: customRaw || parsed,
        ymd: parsed,
        mode: 'custom',
        rawCustom: customRaw || rawMode,
      };
    }
    const fallback = shanghaiYmd(-1, base);
    return {
      dateLabel: customRaw || fallback,
      ymd: fallback,
      mode: 'custom',
      rawCustom: customRaw,
    };
  }

  if (mode === 'yesterday') {
    const ymd = shanghaiYmd(-1, base);
    return { dateLabel: '昨日', ymd, mode };
  }

  if (mode === 'this_week') {
    const ymd = shanghaiYmd(0, base);
    return { dateLabel: '本周', ymd, mode };
  }

  if (mode === 'this_month') {
    const ymd = shanghaiYmd(0, base);
    return { dateLabel: '本月', ymd, mode };
  }

  const ymd = shanghaiYmd(0, base);
  return { dateLabel: '今日', ymd, mode };
}
