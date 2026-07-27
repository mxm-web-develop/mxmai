import { describe, expect, it } from 'vitest';
import {
  industryDailySearchBounds,
  parseNaturalReportDate,
  resolveIndustryDailyDateLabel,
  shanghaiWeekMonday,
  shanghaiMonthStart,
  shanghaiYmd,
} from './industry-daily-date';

describe('parseNaturalReportDate', () => {
  const base = new Date('2026-07-23T12:00:00+08:00');

  it('parses ISO and Chinese calendar forms', () => {
    expect(parseNaturalReportDate('2026-07-22', base)).toBe('2026-07-22');
    expect(parseNaturalReportDate('2026年7月22日', base)).toBe('2026-07-22');
    expect(parseNaturalReportDate('7月22日', base)).toBe('2026-07-22');
  });

  it('parses relative words', () => {
    expect(parseNaturalReportDate('昨天', base)).toBe(shanghaiYmd(-1, base));
    expect(parseNaturalReportDate('今日', base)).toBe(shanghaiYmd(0, base));
    expect(parseNaturalReportDate('前天', base)).toBe(shanghaiYmd(-2, base));
  });
});

describe('resolveIndustryDailyDateLabel', () => {
  const base = new Date('2026-07-23T16:00:00+08:00'); // Thursday

  it('maps yesterday chip to Shanghai calendar day', () => {
    const r = resolveIndustryDailyDateLabel({ date_mode: 'yesterday' }, base);
    expect(r.ymd).toBe('2026-07-22');
    expect(r.mode).toBe('yesterday');
  });

  it('normalizes natural language custom date', () => {
    const r = resolveIndustryDailyDateLabel(
      { date_mode: 'custom', report_date: '7月22日' },
      base
    );
    expect(r.ymd).toBe('2026-07-22');
    expect(r.mode).toBe('custom');
  });

  it('maps 本周 / this_week', () => {
    const r = resolveIndustryDailyDateLabel({ date_mode: '本周' }, base);
    expect(r.mode).toBe('this_week');
    expect(r.dateLabel).toBe('本周');
    expect(r.ymd).toBe('2026-07-23');
  });

  it('maps 本月 / this_month', () => {
    const r = resolveIndustryDailyDateLabel({ date_mode: 'this_month' }, base);
    expect(r.mode).toBe('this_month');
    expect(r.dateLabel).toBe('本月');
  });
});

describe('industryDailySearchBounds', () => {
  const base = new Date('2026-07-23T16:00:00+08:00'); // Thursday

  it('this_week spans Monday through tomorrow', () => {
    const b = industryDailySearchBounds('this_week', '2026-07-23', base);
    expect(b.timeRange).toBe('week');
    expect(b.startDate).toBe(shanghaiWeekMonday(base));
    expect(b.startDate).toBe('2026-07-20');
    expect(b.endDate).toBe('2026-07-24');
    expect(b.maxDaySkew).toBe(7);
  });

  it('this_month spans month start through tomorrow', () => {
    const b = industryDailySearchBounds('this_month', '2026-07-23', base);
    expect(b.timeRange).toBe('month');
    expect(b.startDate).toBe(shanghaiMonthStart(base));
    expect(b.startDate).toBe('2026-07-01');
    expect(b.endDate).toBe('2026-07-24');
    expect(b.maxDaySkew).toBe(31);
  });
});
