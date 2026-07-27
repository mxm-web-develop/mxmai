import { useTranslation } from 'react-i18next';
import { Collapse, Descriptions, Progress, Tag, Timeline, Typography } from 'antd';
import type { SmartflowExecutionItem } from '../../api/client';
import {
  executionStatusTagColor,
  formatExecutionJson,
  formatTimeLabel,
  getFlowChain,
  type FlowStep,
} from './execution-detail-utils';
import { LoopResultsTable, isStructuredLoopResults } from './LoopResultsTable';

function stepStateColor(state?: string): string {
  if (state === 'completed') return 'green';
  if (state === 'failed') return 'red';
  if (state === 'processing') return 'blue';
  return 'default';
}

function JsonBlock({ label, value, emptyLabel }: { label: string; value: unknown; emptyLabel: string }) {
  const text = value !== undefined && value !== null ? formatExecutionJson(value) : emptyLabel;
  return (
    <div className="sf-exec-json-block">
      {label ? (
        <Typography.Text type="secondary" className="sf-exec-json-label">
          {label}
        </Typography.Text>
      ) : null}
      <pre className="sf-exec-json-pre">{text}</pre>
    </div>
  );
}

function StepPanel({ step }: { step: FlowStep }) {
  const { t } = useTranslation();
  const hasInput = step.input !== undefined && step.input !== null;
  const hasOutput = step.output !== undefined && step.output !== null;
  const isLoopStep = step.node_type === 'loop';
  const showLoopTable = isLoopStep && hasOutput;
  const trace =
    step.output &&
    typeof step.output === 'object' &&
    Array.isArray((step.output as { trace?: unknown[] }).trace)
      ? (step.output as { trace: unknown[] }).trace
      : null;
  const emptyLabel = t('smartflow.execution.none');

  return (
    <div className="sf-exec-step-body">
      {step.error && (
        <Typography.Paragraph type="danger" style={{ marginBottom: 8, fontSize: 13 }}>
          {step.error}
        </Typography.Paragraph>
      )}
      {hasInput && <JsonBlock label={t('smartflow.execution.input')} value={step.input} emptyLabel={emptyLabel} />}
      {showLoopTable && <LoopResultsTable output={step.output} />}
      {hasOutput && !showLoopTable && (
        <JsonBlock label={t('smartflow.execution.output')} value={step.output} emptyLabel={emptyLabel} />
      )}
      {hasOutput &&
        showLoopTable &&
        !isStructuredLoopResults((step.output as { results?: unknown })?.results ?? step.output) && (
          <JsonBlock label={t('smartflow.execution.output')} value={step.output} emptyLabel={emptyLabel} />
        )}
      {!hasInput && !hasOutput && !step.error && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('smartflow.execution.noIoRecord')}
        </Typography.Text>
      )}
      {trace && trace.length > 0 && (
        <JsonBlock label={t('smartflow.execution.compositeTrace')} value={trace} emptyLabel={emptyLabel} />
      )}
    </div>
  );
}

export function ExecutionDetailContent({
  execution,
  showHeader = true,
}: {
  execution: SmartflowExecutionItem;
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const chain = getFlowChain(execution);
  const progress = Math.max(0, Math.min(100, Number(execution.progress ?? 0)));
  const status = String(execution.status ?? 'pending');

  const timelineItems = chain.map((step, idx) => ({
    key: `${step.node_id ?? 'node'}-${idx}-${step.state ?? ''}`,
    color: stepStateColor(step.state),
    children: (
      <div className="sf-exec-timeline-item">
        <div className="sf-exec-timeline-head">
          <Tag>{step.node_type ?? 'node'}</Tag>
          <Typography.Text strong>
            {step.node_name ?? step.node_id ?? t('smartflow.execution.step', { index: idx + 1 })}
          </Typography.Text>
          <Tag color={stepStateColor(step.state)}>{step.state ?? 'unknown'}</Tag>
          {step.duration != null && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {step.duration} ms
            </Typography.Text>
          )}
        </div>
        <StepPanel step={step} />
      </div>
    ),
  }));

  return (
    <div className="sf-exec-detail">
      {showHeader && (
        <div className="sf-exec-detail-header">
          <div className="sf-exec-detail-header-row">
            <Tag color={executionStatusTagColor(status)}>{status}</Tag>
            <Typography.Text type="secondary" copyable style={{ fontSize: 12 }}>
              {execution.id}
            </Typography.Text>
          </div>
          <div className="sf-exec-progress-wrap">
            <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
              {t('smartflow.execution.progress', { pct: progress })}
            </Typography.Text>
            <Progress
              percent={progress}
              status={
                status === 'failed'
                  ? 'exception'
                  : status === 'completed'
                    ? 'success'
                    : status === 'running' || status === 'pending'
                      ? 'active'
                      : 'normal'
              }
              size="small"
            />
          </div>
          <Descriptions size="small" column={2} className="sf-exec-meta">
            <Descriptions.Item label={t('smartflow.execution.created')}>
              {formatTimeLabel(execution.created_at as string)}
            </Descriptions.Item>
            <Descriptions.Item label={t('smartflow.execution.started')}>
              {formatTimeLabel(execution.started_at as string)}
            </Descriptions.Item>
            <Descriptions.Item label={t('smartflow.execution.ended')}>
              {formatTimeLabel(execution.completed_at as string)}
            </Descriptions.Item>
            <Descriptions.Item label={t('smartflow.execution.updated')}>
              {formatTimeLabel(execution.updated_at as string)}
            </Descriptions.Item>
          </Descriptions>
          {execution.error_message && (
            <Typography.Paragraph type="danger" style={{ marginBottom: 0, fontSize: 13 }}>
              {String(execution.error_message)}
            </Typography.Paragraph>
          )}
        </div>
      )}

      {execution.input_data && Object.keys(execution.input_data as object).length > 0 && (
        <Collapse
          size="small"
          className="sf-exec-section"
          defaultActiveKey={['input']}
          items={[
            {
              key: 'input',
              label: t('smartflow.execution.inputData'),
              children: (
                <JsonBlock label="" value={execution.input_data} emptyLabel={t('smartflow.execution.none')} />
              ),
            },
          ]}
        />
      )}

      <div className="sf-exec-section">
        <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
          {t('smartflow.execution.nodeTrace', { count: chain.length })}
        </Typography.Text>
        {chain.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t('smartflow.execution.noNodeRecord')}
          </Typography.Text>
        ) : (
          <Timeline mode="left" items={timelineItems} className="sf-exec-timeline" />
        )}
      </div>

      {execution.output_data && Object.keys(execution.output_data as object).length > 0 && (
        <Collapse
          size="small"
          className="sf-exec-section"
          items={[
            {
              key: 'out',
              label: t('smartflow.execution.finalOutput'),
              children: (
                <>
                  <LoopResultsTable output={execution.output_data} compact />
                  {!isStructuredLoopResults(
                    (execution.output_data as { results?: unknown })?.results ?? execution.output_data
                  ) && (
                    <JsonBlock
                      label=""
                      value={execution.output_data}
                      emptyLabel={t('smartflow.execution.none')}
                    />
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
