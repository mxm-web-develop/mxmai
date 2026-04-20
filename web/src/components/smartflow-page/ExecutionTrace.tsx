import { Collapse, Tag, Typography } from 'antd';
import type { SmartflowExecutionItem } from '../../api/client';

type FlowStep = {
  node_id?: string;
  node_name?: string;
  node_type?: string;
  state?: string;
  output?: unknown;
  error?: string;
  duration?: number;
};

function formatOut(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function ExecutionTrace({
  execution,
  title = '本次运行轨迹',
  mode = 'full', // 'full' | 'summary'
}: {
  execution: SmartflowExecutionItem | null;
  title?: string;
  mode?: 'full' | 'summary';
}) {
  if (!execution) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        执行一次工作流后，将在此展示各节点输出（类似 Dify 的运行详情）。
      </Typography.Text>
    );
  }

  const formattedOutput = (output: unknown): string => {
    const str = formatOut(output);
    if (mode === 'summary' && str.length > 200) {
      return str.substring(0, 200) + '...';
    }
    return str;
  };

  const chain = (execution.flow_chain as FlowStep[] | undefined) ?? [];
  const status = execution.status;
  const finalOut = execution.output_data;

  return (
    <div className="smartflow-exec-trace">
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Typography.Text strong>{title}</Typography.Text>
        <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'blue'}>
          {status}
        </Tag>
        <Typography.Text type="secondary" copyable style={{ fontSize: 12 }}>
          {execution.id}
        </Typography.Text>
      </div>
      {execution.error_message && (
        <Typography.Paragraph type="danger" style={{ marginBottom: 12, fontSize: 13 }}>
          {String(execution.error_message)}
        </Typography.Paragraph>
      )}
      {chain.length === 0 ? (
        <Typography.Text type="secondary">本次执行未返回 flow_chain（可能为旧数据）。</Typography.Text>
      ) : (
        <Collapse
          size="small"
          defaultActiveKey={mode === 'summary' ? [] : undefined}
          items={chain.map((step, idx) => ({
            key: String(idx),
            label: (
              <span>
                <Tag>{step.node_type ?? 'node'}</Tag>
                <strong>{step.node_name ?? step.node_id}</strong>
                {step.duration != null && (
                  <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    {step.duration}ms
                  </Typography.Text>
                )}
              </span>
            ),
            children: (
              <div>
                {step.error && (
                  <Typography.Paragraph type="danger" style={{ marginBottom: 8 }}>
                    {step.error}
                  </Typography.Paragraph>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                  节点输出 output
                </Typography.Text>
                <pre
                  style={{
                    margin: 0,
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 11,
                    maxHeight: 280,
                    overflow: 'auto',
                    background: 'var(--surface-1, rgba(0,0,0,0.25))',
                  }}
                >
                  {step.output !== undefined ? formattedOutput(step.output) : '（无）'}
                </pre>
              </div>
            ),
          }))}
        />
      )}
      {finalOut && Object.keys(finalOut as object).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong style={{ fontSize: 13 }}>
            结束节点汇总 output_data
          </Typography.Text>
          <pre
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 8,
              fontSize: 11,
              maxHeight: 200,
              overflow: 'auto',
              background: 'var(--surface-1, rgba(0,0,0,0.25))',
            }}
          >
            {formatOut(finalOut)}
          </pre>
        </div>
      )}
    </div>
  );
}
