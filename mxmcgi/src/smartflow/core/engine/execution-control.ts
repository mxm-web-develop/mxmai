/**
 * 内存中的执行控制信号（单进程 api 内有效）
 * 用于暂停 / 取消正在运行的 Smartflow execution
 */

export type ExecutionStopSignal = 'pause' | 'cancel';

const signals = new Map<string, ExecutionStopSignal>();

export function registerRunningExecution(executionId: string): void {
  signals.delete(executionId);
}

export function unregisterRunningExecution(executionId: string): void {
  signals.delete(executionId);
}

export function requestPauseExecution(executionId: string): void {
  signals.set(executionId, 'pause');
}

export function requestCancelExecution(executionId: string): void {
  signals.set(executionId, 'cancel');
}

export function getStopSignal(executionId: string): ExecutionStopSignal | null {
  return signals.get(executionId) ?? null;
}

export function clearStopSignal(executionId: string): void {
  signals.delete(executionId);
}
