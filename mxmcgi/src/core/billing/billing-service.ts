/**
 * @deprecated 请直接使用 `statistics/billing-service`。
 * 保留此路径仅为兼容旧 import，避免 graph/writing 漏掉开放 API 用量回写。
 */
export {
  BillingService,
  BillingMisconfiguredError,
  BILLING_MISCONFIGURED_CODE,
  BILLING_MISCONFIGURED_MESSAGE,
  type CheckBalanceParams,
  type CheckBalanceResult,
  type ConsumeForTaskParams,
} from '../../statistics/billing-service';
