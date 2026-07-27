/**
 * 任务生成：MXM-TOKEN 预估 / 余额不足简写挂在按钮文案上（不再单独 Alert）。
 *
 * 防死循环要点：
 * - effect 只依赖稳定 requestKey（scope/taskKey/subtype/params 序列化）
 * - 同一 requestKey 成功后不重复请求（实例内 + 模块短缓存）
 * - onStateChange 用 ref，且父级应做相等跳过
 * - 禁止把 params 对象引用放进 deps
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Typography } from 'antd';
import { estimateTaskV2, type TaskEstimateResult } from '../../api/client';
import type { AppLocale } from '../../i18n/appLocale';

const BILLING_MSG = '该业务由于计费模块错误，暂不可用';

/** 短缓存，避免 confirm 重挂载反复刷 estimate */
const ESTIMATE_OK_CACHE = new Map<string, { at: number; data: TaskEstimateResult }>();
const ESTIMATE_CACHE_TTL_MS = 60_000;
const ESTIMATE_INFLIGHT = new Map<string, Promise<TaskEstimateResult | null>>();

export type BillingBlockReason = 'billing_misconfigured' | 'insufficient_balance' | null;

export type TaskBillingBarProps = {
  scope: string;
  taskKey: string;
  subtype?: string | null;
  /** 已整理的提交参数（与 run 一致最佳；未准备好时可传 formValues） */
  params: Record<string, unknown>;
  enabled?: boolean;
  /** 参数变化防抖 ms */
  debounceMs?: number;
};

export type TaskBillingState = {
  canSubmit: boolean;
  blockReason: BillingBlockReason;
  estimate: TaskEstimateResult | null;
  loading: boolean;
};

function pickEstimateData(
  res: Awaited<ReturnType<typeof estimateTaskV2>>
): TaskEstimateResult | null {
  if (res.code === 'BILLING_MISCONFIGURED') {
    return {
      estimatedTokens: 0,
      currentBalance: Number(res.extras?.currentBalance ?? 0),
      allowed: false,
      hasPricing: false,
      isAdmin: false,
      code: 'BILLING_MISCONFIGURED',
      message: res.error || BILLING_MSG,
    };
  }
  const raw = res.data as
    | { success?: boolean; data?: TaskEstimateResult }
    | TaskEstimateResult
    | undefined;
  if (!raw) return null;
  if ('estimatedTokens' in raw) return raw as TaskEstimateResult;
  if ('data' in raw && raw.data) return raw.data;
  return null;
}

function stableParamsKey(params: Record<string, unknown>): string {
  try {
    return JSON.stringify(params ?? {});
  } catch {
    return '"[unserializable]"';
  }
}

function buildRequestKey(
  scope: string,
  taskKey: string,
  subtype: string | null,
  paramsKey: string
): string {
  return `${scope}::${taskKey}::${subtype ?? ''}::${paramsKey}`;
}

async function fetchEstimateOnce(opts: {
  requestKey: string;
  scope: string;
  taskKey: string;
  subtype: string | null;
  params: Record<string, unknown>;
}): Promise<TaskEstimateResult | null> {
  const cached = ESTIMATE_OK_CACHE.get(opts.requestKey);
  if (cached && Date.now() - cached.at < ESTIMATE_CACHE_TTL_MS) {
    return cached.data;
  }

  const existing = ESTIMATE_INFLIGHT.get(opts.requestKey);
  if (existing) return existing;

  const p = estimateTaskV2({
    scope: opts.scope,
    taskKey: opts.taskKey,
    subtype: opts.subtype,
    params: opts.params,
  })
    .then((res) => {
      const data = pickEstimateData(res);
      if (data) {
        ESTIMATE_OK_CACHE.set(opts.requestKey, { at: Date.now(), data });
        return data;
      }
      if (res.error) {
        const errData: TaskEstimateResult = {
          estimatedTokens: 0,
          currentBalance: 0,
          allowed: false,
          hasPricing: false,
          isAdmin: false,
          code: res.code || 'BILLING_MISCONFIGURED',
          message: res.error,
        };
        return errData;
      }
      return null;
    })
    .finally(() => {
      ESTIMATE_INFLIGHT.delete(opts.requestKey);
    });

  ESTIMATE_INFLIGHT.set(opts.requestKey, p);
  return p;
}

/** 生成按钮统一文案：≈12 MXM-TOKEN · 生成；余额不足时简写到按钮上 */
export function formatGenerateButtonLabel(
  generateLabel: string,
  estimate: TaskEstimateResult | null | undefined,
  loading?: boolean,
  options?: { insufficientBalance?: boolean; locale?: AppLocale }
): string {
  const locale = options?.locale ?? 'zh';
  const copy = {
    estimating: {
      zh: `估价中… · ${generateLabel}`,
      'zh-TW': `估價中… · ${generateLabel}`,
      en: `Estimating… · ${generateLabel}`,
      ja: `見積もり中… · ${generateLabel}`,
    },
    billingError: {
      zh: `计费异常 · ${generateLabel}`,
      'zh-TW': `計費異常 · ${generateLabel}`,
      en: `Billing error · ${generateLabel}`,
      ja: `課金エラー · ${generateLabel}`,
    },
  } as const;
  if (loading) return copy.estimating[locale];
  if (!estimate) return generateLabel;
  if (estimate.code === 'BILLING_MISCONFIGURED' || estimate.hasPricing === false) {
    return copy.billingError[locale];
  }
  const n = estimate.estimatedTokens;
  const cost = Number.isFinite(n) && n > 0 ? `≈${formatToken(n)} MXM-TOKEN` : null;
  if (options?.insufficientBalance) {
    const bal = formatToken(estimate.currentBalance);
    if (locale === 'en') {
      return cost
        ? `Low balance · need ${cost} · have ${bal} · ${generateLabel}`
        : `Low balance · have ${bal} · ${generateLabel}`;
    }
    if (locale === 'ja') {
      return cost
        ? `残高不足 · 必要 ${cost} · 残高 ${bal} · ${generateLabel}`
        : `残高不足 · 残高 ${bal} · ${generateLabel}`;
    }
    if (locale === 'zh-TW') {
      return cost
        ? `餘額不足 · 需 ${cost} · 現 ${bal} · ${generateLabel}`
        : `餘額不足 · 現 ${bal} · ${generateLabel}`;
    }
    return cost
      ? `余额不足 · 需 ${cost} · 现 ${bal} · ${generateLabel}`
      : `余额不足 · 现 ${bal} · ${generateLabel}`;
  }
  if (!cost) return generateLabel;
  return `${cost} · ${generateLabel}`;
}

export function useTaskBillingEstimate(props: TaskBillingBarProps) {
  const { scope, taskKey, subtype, params, enabled = true, debounceMs = 450 } = props;
  const [estimate, setEstimate] = useState<TaskEstimateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const subtypeNorm = subtype ?? null;
  const paramsKey = stableParamsKey(params ?? {});
  const requestKey =
    enabled && taskKey && scope ? buildRequestKey(scope, taskKey, subtypeNorm, paramsKey) : '';

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const appliedKeyRef = useRef<string>('');

  useEffect(() => {
    if (!requestKey) {
      appliedKeyRef.current = '';
      setEstimate(null);
      setLoading(false);
      return;
    }

    // 已对本实例落地过该 key
    if (appliedKeyRef.current === requestKey) {
      const cachedHit = ESTIMATE_OK_CACHE.get(requestKey);
      if (cachedHit) setEstimate(cachedHit.data);
      setLoading(false);
      return;
    }

    const cached = ESTIMATE_OK_CACHE.get(requestKey);
    if (cached && Date.now() - cached.at < ESTIMATE_CACHE_TTL_MS) {
      appliedKeyRef.current = requestKey;
      setEstimate(cached.data);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const t = window.setTimeout(() => {
      void fetchEstimateOnce({
        requestKey,
        scope,
        taskKey,
        subtype: subtypeNorm,
        params: paramsRef.current ?? {},
      }).then((data) => {
        if (cancelled) return;
        if (data) {
          appliedKeyRef.current = requestKey;
          setEstimate(data);
        }
        setLoading(false);
      });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [requestKey, scope, taskKey, subtypeNorm, debounceMs]);

  const blockReason: BillingBlockReason = loading
    ? null
    : !estimate
      ? null
      : estimate.code === 'BILLING_MISCONFIGURED' || estimate.hasPricing === false
        ? 'billing_misconfigured'
        : !estimate.allowed && !estimate.isAdmin
          ? 'insufficient_balance'
          : null;

  const canSubmit =
    !loading &&
    !!estimate &&
    blockReason == null &&
    (estimate.allowed || estimate.isAdmin) &&
    estimate.hasPricing !== false;

  return { estimate, loading, blockReason, canSubmit };
}

function billingStateEqual(a: TaskBillingState, b: TaskBillingState): boolean {
  return (
    a.canSubmit === b.canSubmit &&
    a.blockReason === b.blockReason &&
    a.loading === b.loading &&
    a.estimate === b.estimate
  );
}

export function TaskBillingBar(
  props: TaskBillingBarProps & {
    className?: string;
    onStateChange?: (state: TaskBillingState) => void;
  }
) {
  const { estimate, loading, blockReason, canSubmit } = useTaskBillingEstimate(props);
  const onStateChangeRef = useRef(props.onStateChange);
  onStateChangeRef.current = props.onStateChange;
  const lastSentRef = useRef<TaskBillingState | null>(null);

  useEffect(() => {
    const next: TaskBillingState = { canSubmit, blockReason, estimate, loading };
    if (lastSentRef.current && billingStateEqual(lastSentRef.current, next)) return;
    lastSentRef.current = next;
    onStateChangeRef.current?.(next);
  }, [canSubmit, blockReason, estimate, loading]);

  // 估价 / 余额不足均写在生成按钮上，此处只驱动 onStateChange
  if (!props.taskKey) return null;
  return null;
}

function formatToken(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 10) return String(Math.round(n * 100) / 100);
  return String(Math.round(n * 1000) / 1000);
}

/** 提交失败时弹窗（计费错误 / 余额不足） */
export function showBillingErrorModal(opts: {
  code?: string;
  message?: string;
  estimatedTokens?: number;
  currentBalance?: number;
}): boolean {
  if (opts.code === 'BILLING_MISCONFIGURED') {
    Modal.error({
      title: '计费模块错误',
      content: opts.message || BILLING_MSG,
    });
    return true;
  }
  if (opts.code === 'INSUFFICIENT_BALANCE') {
    Modal.warning({
      title: '余额不足',
      content: (
        <div>
          <p>
            {opts.message ||
              `余额不足，预计需要 ${formatToken(opts.estimatedTokens)} MXM-TOKEN，当前 ${formatToken(opts.currentBalance)}。`}
          </p>
          <p>
            请联系管理员发放 MXM-TOKEN。
            <Typography.Link href="/account">前往账号钱包</Typography.Link>
          </p>
        </div>
      ),
    });
    return true;
  }
  return false;
}

/** 从 runTaskV2 / estimate 响应提取计费错误并弹窗 */
export function handleTaskBillingResponseError(res: {
  error?: string;
  code?: string;
  status?: number;
  extras?: Record<string, unknown>;
}): boolean {
  const code =
    res.code ||
    (res.status === 402
      ? 'INSUFFICIENT_BALANCE'
      : res.status === 503
        ? 'BILLING_MISCONFIGURED'
        : undefined);
  return showBillingErrorModal({
    code,
    message: res.error,
    estimatedTokens:
      typeof res.extras?.estimatedTokens === 'number' ? res.extras.estimatedTokens : undefined,
    currentBalance:
      typeof res.extras?.currentBalance === 'number' ? res.extras.currentBalance : undefined,
  });
}
