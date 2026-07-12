import { Button, message } from 'antd';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { retryTask } from '../api/client';

type TaskCardRetryButtonProps = {
  taskId: string;
  disabled?: boolean;
  /** 断点重试说明（可选） */
  title?: string;
  onRetried?: () => void;
};

/** 失败任务断点重试（保留前置/后置管线进度） */
export function TaskCardRetryButton({
  taskId,
  disabled,
  title,
  onRetried,
}: TaskCardRetryButtonProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const retryTitle = title ?? t('common.task.retry.resumeHint');

  const handleRetry = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (loading || disabled) return;
      setLoading(true);
      // 立即弹 loading 提示，避免"点击无反应"的错觉
      const loadingKey = `retry-${taskId}`;
      message.loading({
        content: t('common.task.retry.submitting'),
        key: loadingKey,
        duration: 0,
      });
      try {
        const res = await retryTask(taskId);
        if (res.error) throw new Error(res.error);
        message.success({ content: t('common.task.retry.submitted'), key: loadingKey, duration: 2 });
        onRetried?.();
      } catch (err) {
        message.error({
          content: err instanceof Error ? err.message : t('common.task.retry.failed'),
          key: loadingKey,
          duration: 4,
        });
      } finally {
        setLoading(false);
      }
    },
    [taskId, disabled, loading, onRetried, t]
  );

  return (
    <Button
      type="link"
      size="small"
      loading={loading}
      disabled={disabled}
      title={retryTitle}
      onClick={(e) => void handleRetry(e)}
      className="task-card-retry-btn"
    >
      {t('common.task.actions.retry')}
    </Button>
  );
}

export function isTaskRetryable(status: string, error?: string | null): boolean {
  if (status === 'failed' || status === 'cancelled' || status === 'network_error') return true;
  if (status === 'processing' && error) return true;
  return false;
}
