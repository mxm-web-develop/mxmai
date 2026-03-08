/**
 * 任务消费扣款客户端
 * 调用 mxmpay 进行预扣款，任务创建前执行
 */

import { uid } from 'uid';

const MXMPAY_URL = process.env.MXMPAY_URL || 'http://localhost:4002';
const ENABLE_TASK_PAYMENT = String(process.env.ENABLE_TASK_PAYMENT || 'false').toLowerCase() === 'true';
const DEFAULT_ASSET = process.env.TASK_PAYMENT_ASSET || 'CNY';

/** 任务类型与单价映射（可通过 env 覆盖，如 TASK_PRICE_GRAPH=1） */
function getPriceForTaskType(type: string): number {
  const key = `TASK_PRICE_${type.toUpperCase().replace(/-/g, '_')}`;
  const val = process.env[key];
  if (val !== undefined) {
    const n = parseFloat(val);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return parseFloat(process.env.TASK_PRICE_DEFAULT || '0');
}

export async function deductForTask(
  userId: string,
  taskType: string,
  idempotencyKey?: string
): Promise<void> {
  if (!ENABLE_TASK_PAYMENT) return;
  const price = getPriceForTaskType(taskType);
  if (price <= 0) return;

  const bizId = idempotencyKey || `pay_${uid(21)}`;
  const url = `${MXMPAY_URL}/wallets/payment`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const body = {
    asset_code: DEFAULT_ASSET,
    price: String(price),
    biz_type: 'cgi_task',
    biz_id: bizId,
    description: `任务消费: ${taskType}`,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`扣款失败: ${res.status} ${errText}`);
  }
}
