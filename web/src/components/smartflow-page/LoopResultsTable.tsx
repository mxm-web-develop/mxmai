import { useTranslation } from 'react-i18next';
import { Table, Tag, Typography } from 'antd';

export type LoopIterationResultRow = {
  index: number;
  success: boolean;
  taskId?: string;
  mediaUrls?: string[];
  error?: string;
  output?: unknown;
};

export function isStructuredLoopResults(value: unknown): value is LoopIterationResultRow[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (row) =>
      row != null &&
      typeof row === 'object' &&
      typeof (row as LoopIterationResultRow).index === 'number' &&
      typeof (row as LoopIterationResultRow).success === 'boolean'
  );
}

function pickResultsArray(output: unknown): LoopIterationResultRow[] | null {
  if (isStructuredLoopResults(output)) return output;
  if (output != null && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (isStructuredLoopResults(o.results)) return o.results;
  }
  return null;
}

export function LoopResultsTable({
  output,
  compact = false,
}: {
  output: unknown;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const rows = pickResultsArray(output);
  if (!rows) return null;

  const successCount = rows.filter((r) => r.success).length;
  const failedCount = rows.length - successCount;

  return (
    <div style={{ marginTop: compact ? 4 : 8, marginBottom: compact ? 0 : 8 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
        {t('smartflow.execution.successCount', {
          success: successCount,
          failed: failedCount,
          total: rows.length,
        })}
      </Typography.Text>
      <Table
        size="small"
        pagination={false}
        rowKey={(r) => String(r.index)}
        dataSource={rows}
        columns={[
          { title: '#', dataIndex: 'index', width: 48 },
          {
            title: t('smartflow.execution.status'),
            dataIndex: 'success',
            width: 72,
            render: (ok: boolean) =>
              ok ? (
                <Tag color="success">{t('smartflow.execution.success')}</Tag>
              ) : (
                <Tag color="error">{t('smartflow.execution.fail')}</Tag>
              ),
          },
          {
            title: t('smartflow.execution.resourceUrl'),
            dataIndex: 'mediaUrls',
            ellipsis: true,
            render: (_: unknown, row: LoopIterationResultRow) => {
              const urls =
                row.mediaUrls ??
                (row.output != null &&
                typeof row.output === 'object' &&
                Array.isArray((row.output as { mediaUrls?: string[] }).mediaUrls)
                  ? (row.output as { mediaUrls: string[] }).mediaUrls
                  : undefined);
              if (!urls?.length) return '—';
              const first = urls[0];
              return (
                <Typography.Text copyable={{ text: urls.join('\n') }} style={{ fontSize: 12 }}>
                  {first}
                  {urls.length > 1 ? ` (+${urls.length - 1})` : ''}
                </Typography.Text>
              );
            },
          },
          {
            title: 'taskId',
            dataIndex: 'taskId',
            ellipsis: true,
            render: (v: string | undefined) =>
              v ? (
                <Typography.Text copyable={{ text: v }} style={{ fontSize: 12 }}>
                  {v}
                </Typography.Text>
              ) : (
                '—'
              ),
          },
          {
            title: 'error',
            dataIndex: 'error',
            ellipsis: true,
            render: (v: string | undefined) =>
              v ? (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                  {v}
                </Typography.Text>
              ) : (
                '—'
              ),
          },
        ]}
      />
    </div>
  );
}
