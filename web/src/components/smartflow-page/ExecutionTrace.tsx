import { useTranslation } from 'react-i18next';
import { Typography } from 'antd';
import type { SmartflowExecutionItem } from '../../api/client';
import { ExecutionDetailContent } from './ExecutionDetailContent';

export function ExecutionTrace({
  execution,
  title,
  mode = 'full',
}: {
  execution: SmartflowExecutionItem | null;
  title?: string;
  mode?: 'full' | 'summary';
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('smartflow.execution.traceTitle');

  if (!execution) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {t('smartflow.execution.traceHint')}
      </Typography.Text>
    );
  }

  if (mode === 'summary') {
    return (
      <div className="smartflow-exec-trace smartflow-exec-trace--compact">
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          {resolvedTitle} · {t('smartflow.execution.traceViewHint')}
        </Typography.Text>
        <ExecutionDetailContent execution={execution} showHeader />
      </div>
    );
  }

  return (
    <div className="smartflow-exec-trace">
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {resolvedTitle}
      </Typography.Text>
      <ExecutionDetailContent execution={execution} />
    </div>
  );
}
