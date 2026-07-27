export type PublishedApiUsageKind = 'task_v2' | 'smartflow';
export type PublishedApiUsageStatus = 'pending' | 'completed' | 'failed';

export interface PublishedApiUsageEvent {
  id: string;
  published_api_id: string;
  slug: string;
  owner_user_id: string;
  caller_user_id: string | null;
  partner_app_id: string | null;
  end_user_id: string | null;
  job_id: string;
  kind: PublishedApiUsageKind;
  status: PublishedApiUsageStatus;
  title: string | null;
  tokens_charged: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreatePublishedApiUsageDto {
  publishedApiId: string;
  slug: string;
  ownerUserId: string;
  callerUserId?: string | null;
  partnerAppId?: string | null;
  endUserId?: string | null;
  jobId: string;
  kind: PublishedApiUsageKind;
  title?: string | null;
}

export interface PublishedApiUsageStatsQuery {
  /** 发布者维度；admin 全站统计时可省略 */
  ownerUserId?: string;
  publishedApiId?: string;
  slug?: string;
  days?: number;
  /** true 且无 ownerUserId：全表聚合（Admin） */
  admin?: boolean;
  recentLimit?: number;
}

export interface PublishedApiUsageDailyRow {
  date: string;
  call_count: number;
  tokens_charged: number;
}

export interface PublishedApiUsageBySlugRow {
  published_api_id: string;
  slug: string;
  title?: string;
  call_count: number;
  tokens_charged: number;
  last_called_at: string | null;
}

export interface PublishedApiUsageByOwnerRow {
  owner_user_id: string;
  username?: string;
  call_count: number;
  tokens_charged: number;
  last_called_at: string | null;
}

export interface PublishedApiUsageByCallerRow {
  caller_user_id: string;
  username?: string;
  call_count: number;
  tokens_charged: number;
  last_called_at: string | null;
}

export interface PublishedApiUsageByEndUserRow {
  end_user_id: string;
  call_count: number;
  tokens_charged: number;
  last_called_at: string | null;
  phone?: string | null;
  phone_masked?: string | null;
  display_name?: string | null;
  user_kind?: string | null;
}

export interface OpenApiJobListItem {
  job_id: string;
  slug: string;
  status: PublishedApiUsageStatus;
  kind: PublishedApiUsageKind;
  title: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PublishedApiUsageRecentEvent {
  job_id: string;
  slug: string;
  published_api_id: string;
  caller_user_id: string | null;
  owner_user_id: string;
  end_user_id?: string | null;
  end_user_phone?: string | null;
  status: PublishedApiUsageStatus;
  tokens_charged: number;
  created_at: string;
  kind: PublishedApiUsageKind;
  task_v2_scope?: string | null;
  title?: string;
}

export interface PublishedApiUsageStats {
  days: number;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  pendingCalls: number;
  totalTokensCharged: number;
  daily: PublishedApiUsageDailyRow[];
  byApi: PublishedApiUsageBySlugRow[];
  byOwner?: PublishedApiUsageByOwnerRow[];
  byCaller?: PublishedApiUsageByCallerRow[];
  byEndUser?: PublishedApiUsageByEndUserRow[];
  recentEvents?: PublishedApiUsageRecentEvent[];
}

export interface IPublishedApiUsageRepository {
  create(data: CreatePublishedApiUsageDto): Promise<PublishedApiUsageEvent>;
  findByJobId(jobId: string): Promise<PublishedApiUsageEvent | null>;
  markCompleted(jobId: string, tokensCharged: number): Promise<PublishedApiUsageEvent | null>;
  markFailed(jobId: string, errorMessage?: string): Promise<PublishedApiUsageEvent | null>;
  getStats(query: PublishedApiUsageStatsQuery): Promise<PublishedApiUsageStats>;
  listJobsByEndUser(query: {
    partnerAppId: string;
    endUserId: string;
    slug?: string;
    /** 仅返回这些 slug（Partner H5 rootOnly 列表） */
    slugIn?: string[];
    limit?: number;
    offset?: number;
  }): Promise<OpenApiJobListItem[]>;
  countCallsByEndUserToday(partnerAppId: string, endUserId: string): Promise<number>;
}
