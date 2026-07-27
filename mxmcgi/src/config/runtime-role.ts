/**
 * mxmcgi 进程角色（api / worker / scheduler / all）
 * - api: HTTP + runTaskV2 仅建任务，不 executeTask
 * - worker: 消费 pending 任务 + 可选后台任务
 * - scheduler: outbox + recovery（单实例）
 * - all: 开发默认，与旧行为一致（同进程 executeTask）
 */

export type MxmcgiRole = 'api' | 'worker' | 'scheduler' | 'all';

export function getMxmcgiRole(): MxmcgiRole {
  const raw = String(process.env.MXMCGI_ROLE || 'all').trim().toLowerCase();
  if (raw === 'api' || raw === 'worker' || raw === 'scheduler' || raw === 'all') {
    return raw;
  }
  console.warn(`[mxmcgi] Unknown MXMCGI_ROLE="${raw}", fallback to "all"`);
  return 'all';
}

/** API 模式：runTaskV2 创建任务后不在本进程执行 */
export function shouldDeferTaskExecution(): boolean {
  return getMxmcgiRole() === 'api';
}

/** 是否启动 Express 业务路由 */
export function shouldStartHttpApi(): boolean {
  const role = getMxmcgiRole();
  return role === 'all' || role === 'api';
}

/** 是否运行 pending 任务轮询 */
export function shouldRunWorkerPoller(): boolean {
  const role = getMxmcgiRole();
  return role === 'worker' || role === 'all';
}

/** outbox + task recovery（仅 scheduler / all；worker 不跑，避免多副本重复扫库） */
export function shouldRunSchedulerJobs(): boolean {
  const role = getMxmcgiRole();
  if (role === 'api' || role === 'worker') return false;
  return role === 'all' || role === 'scheduler';
}

/** 同进程 execute（开发 all 模式） */
export function shouldExecuteTasksInline(): boolean {
  const role = getMxmcgiRole();
  return role === 'all';
}
