/**
 * 人工审核通过前：预估后续调用 MXM-TOKEN，并决定是否允许通过。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  estimateTaskV2,
  type TaskEstimateResult,
  type WritingTaskItem,
} from '../../api/client';
import { formatGenerateButtonLabel } from './TaskBillingBar';

export { formatGenerateButtonLabel };

function pickEstimateData(
  res: Awaited<ReturnType<typeof estimateTaskV2>>,
): TaskEstimateResult | null {
  const raw = res.data as { success?: boolean; data?: TaskEstimateResult } | TaskEstimateResult | undefined;
  if (res.code === 'BILLING_MISCONFIGURED') {
    return {
      estimatedTokens: 0,
      currentBalance: Number(res.extras?.currentBalance ?? 0),
      allowed: false,
      hasPricing: false,
      isAdmin: false,
      code: 'BILLING_MISCONFIGURED',
      message: res.error || '该业务由于计费模块错误，暂不可用',
    };
  }
  if (!raw) return null;
  if ('estimatedTokens' in raw) return raw as TaskEstimateResult;
  if ('data' in raw && raw.data) return raw.data;
  return null;
}

function resolveTaskV2(task: WritingTaskItem | null): {
  scope: string;
  taskKey: string;
  subtype: string | null;
} | null {
  if (!task) return null;
  const fromMeta = (task.metadata as { taskV2?: { scope?: string; taskKey?: string; subtype?: string | null } } | undefined)
    ?.taskV2;
  const fromReq = (
    task.requestParams as { taskV2?: { scope?: string; taskKey?: string; subtype?: string | null } } | undefined
  )?.taskV2;
  const t = fromMeta ?? fromReq;
  if (!t?.scope || !t?.taskKey) return null;
  return { scope: t.scope, taskKey: t.taskKey, subtype: t.subtype ?? null };
}

export function useReviewBillingEstimate(opts: {
  open: boolean;
  task: WritingTaskItem | null;
  /** 审核确认的规格：图集 JSON / 时间轴 script */
  reviewPayload: Record<string, unknown> | null;
  enabled?: boolean;
}) {
  const { open, task, reviewPayload, enabled = true } = opts;
  const route = useMemo(() => resolveTaskV2(task), [task]);
  const [estimate, setEstimate] = useState<TaskEstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const payloadKey = reviewPayload ? JSON.stringify(reviewPayload) : '';
  const payloadRef = useRef(reviewPayload);
  payloadRef.current = reviewPayload;

  useEffect(() => {
    if (!open || !enabled || !route || !payloadRef.current) {
      setEstimate(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEstimate(null);
    const payload = payloadRef.current;
    const t = window.setTimeout(() => {
      void estimateTaskV2({
        scope: route.scope,
        taskKey: route.taskKey,
        subtype: route.subtype,
        estimatePhase: 'after_review',
        params: {
          album_spec: payload,
          reviewJson: payload,
        },
      })
        .then((res) => {
          if (cancelled) return;
          const data = pickEstimateData(res);
          if (data) setEstimate(data);
          else if (res.error) {
            setEstimate({
              estimatedTokens: 0,
              currentBalance: 0,
              allowed: false,
              hasPricing: false,
              isAdmin: false,
              code: res.code || 'BILLING_MISCONFIGURED',
              message: res.error,
            });
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, enabled, route, payloadKey]);

  const blockApprove =
    loading ||
    (!!estimate &&
      !estimate.isAdmin &&
      (estimate.code === 'BILLING_MISCONFIGURED' ||
        estimate.hasPricing === false ||
        !estimate.allowed));

  return { estimate, loading, blockApprove, route };
}

export function ReviewBillingBar(_props: {
  estimate: TaskEstimateResult | null;
  loading?: boolean;
  className?: string;
}) {
  // 余额 / 计费信息改写在确认按钮文案上
  return null;
}
