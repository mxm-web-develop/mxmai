import type { SmartflowExecutionItem } from '../../api/client';

export type FlowStep = {
  node_id?: string;
  node_name?: string;
  node_type?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
  timestamp?: number;
};

export function formatExecutionJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function executionStatusTagColor(status: string): string {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'processing';
  if (status === 'paused') return 'warning';
  if (status === 'cancelled') return 'default';
  return 'default';
}

export function isActiveExecutionStatus(status: string): boolean {
  return status === 'pending' || status === 'running' || status === 'paused';
}

export function getFlowChain(execution: SmartflowExecutionItem): FlowStep[] {
  return (execution.flow_chain as FlowStep[] | undefined) ?? [];
}

export function formatTimeLabel(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}
