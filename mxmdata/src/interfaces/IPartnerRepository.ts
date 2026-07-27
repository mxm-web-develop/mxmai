export type PartnerAppStatus = 'active' | 'disabled';
export type PartnerEndUserKind = 'anonymous' | 'external';
export type PartnerEndUserStatus = 'active' | 'blocked';
export type PartnerAssetKind = 'app_shared' | 'end_user';
export type PartnerEndUserAccessMode = 'open' | 'whitelist';
export type PartnerSlugAccessMode = 'all_owner' | 'restricted';
export type PartnerAllowlistProvider = 'sms' | 'wechat' | 'external';
export type PartnerAllowlistSource = 'manual' | 'invite';
export type PartnerInviteStatus = 'pending' | 'used' | 'revoked';

export interface PartnerAppInviteRecord {
  id: string;
  partner_app_id: string;
  token_hash: string;
  status: PartnerInviteStatus;
  used_subject: string | null;
  used_end_user_id: string | null;
  created_by: string | null;
  created_at: string;
  used_at: string | null;
}

export interface PartnerAppRecord {
  id: string;
  owner_user_id: string;
  api_key_id: string;
  name: string;
  secret_hash: string;
  secret_prefix: string;
  allowed_slugs: string[];
  status: PartnerAppStatus;
  end_user_access_mode: PartnerEndUserAccessMode;
  slug_access_mode: PartnerSlugAccessMode;
  invite_token_hash: string | null;
  h5_login_base_url: string | null;
  daily_end_user_quota: number | null;
  qps_limit: number | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerAllowlistRecord {
  id: string;
  partner_app_id: string;
  provider: PartnerAllowlistProvider;
  subject: string;
  source: PartnerAllowlistSource;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PartnerEndUserIdentity {
  end_user_id: string;
  provider: PartnerAllowlistProvider;
  subject: string;
}

export interface UpdatePartnerAppAccessSettingsDto {
  endUserAccessMode?: PartnerEndUserAccessMode;
  slugAccessMode?: PartnerSlugAccessMode;
  allowedSlugs?: string[];
  h5LoginBaseUrl?: string | null;
}

export interface CreatePartnerAppDto {
  ownerUserId: string;
  apiKeyId: string;
  name: string;
  secretHash: string;
  secretPrefix: string;
  allowedSlugs: string[];
}

export interface PartnerEndUserRecord {
  id: string;
  partner_app_id: string;
  kind: PartnerEndUserKind;
  external_id: string | null;
  device_fingerprint: string | null;
  display_name: string | null;
  metadata: Record<string, unknown>;
  status: PartnerEndUserStatus;
  created_at: string;
  updated_at: string;
}

export interface PartnerSessionRecord {
  id: string;
  end_user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface PartnerAssetRecord {
  id: string;
  partner_app_id: string;
  end_user_id: string | null;
  kind: PartnerAssetKind;
  storage_bucket: string;
  storage_key: string;
  mime_type: string | null;
  label: string | null;
  created_at: string;
}

export interface PartnerAuditLogDto {
  partnerAppId: string;
  action: string;
  actorUserId?: string;
  endUserId?: string;
  detail?: Record<string, unknown>;
}

export interface PartnerEndUserListItem extends PartnerEndUserRecord {
  phone?: string | null;
  phone_masked?: string | null;
  identities?: Array<{ provider: PartnerAllowlistProvider; subject: string; subject_masked: string }>;
  call_count?: number;
  tokens_charged?: number;
  last_called_at?: string | null;
}

export interface IPartnerRepository {
  createApp(data: CreatePartnerAppDto): Promise<PartnerAppRecord>;
  findAppById(id: string): Promise<PartnerAppRecord | null>;
  findAppByApiKeyId(apiKeyId: string): Promise<PartnerAppRecord | null>;
  listAppsByOwner(ownerUserId: string): Promise<PartnerAppRecord[]>;
  updateAppSlugs(id: string, ownerUserId: string, allowedSlugs: string[]): Promise<PartnerAppRecord | null>;
  updateAppAccessSettings(
    id: string,
    ownerUserId: string,
    data: UpdatePartnerAppAccessSettingsDto
  ): Promise<PartnerAppRecord | null>;
  findAppByInviteTokenHash(tokenHash: string): Promise<PartnerAppRecord | null>;
  setInviteTokenHash(id: string, ownerUserId: string, tokenHash: string): Promise<PartnerAppRecord | null>;

  createAppInvite(
    partnerAppId: string,
    tokenHash: string,
    createdBy?: string
  ): Promise<PartnerAppInviteRecord>;
  findPendingInviteByTokenHash(
    partnerAppId: string,
    tokenHash: string
  ): Promise<PartnerAppInviteRecord | null>;
  consumeAppInvite(
    partnerAppId: string,
    inviteId: string,
    usedSubject: string,
    usedEndUserId: string
  ): Promise<boolean>;
  listAppInvites(partnerAppId: string, limit?: number, offset?: number): Promise<PartnerAppInviteRecord[]>;
  revokeAppInvite(partnerAppId: string, inviteId: string): Promise<boolean>;

  listAllowlist(partnerAppId: string, limit?: number, offset?: number): Promise<PartnerAllowlistRecord[]>;
  isInAllowlist(
    partnerAppId: string,
    provider: PartnerAllowlistProvider,
    subject: string
  ): Promise<boolean>;
  upsertAllowlist(data: {
    partnerAppId: string;
    provider: PartnerAllowlistProvider;
    subject: string;
    source: PartnerAllowlistSource;
    note?: string;
    createdBy?: string;
  }): Promise<PartnerAllowlistRecord>;
  removeAllowlist(partnerAppId: string, allowlistId: string): Promise<boolean>;

  rotateAppSecret(
    id: string,
    ownerUserId: string,
    secretHash: string,
    secretPrefix: string
  ): Promise<PartnerAppRecord | null>;

  findOrCreateAnonymousUser(
    partnerAppId: string,
    deviceFingerprint: string
  ): Promise<PartnerEndUserRecord>;
  findAnonymousUserByDevice(
    partnerAppId: string,
    deviceFingerprint: string
  ): Promise<PartnerEndUserRecord | null>;
  upsertExternalUser(
    partnerAppId: string,
    externalId: string,
    displayName?: string
  ): Promise<PartnerEndUserRecord>;
  findEndUserById(id: string): Promise<PartnerEndUserRecord | null>;
  listEndUsers(partnerAppId: string, limit?: number, offset?: number): Promise<PartnerEndUserRecord[]>;
  listSmsPhonesByEndUserIds(
    partnerAppId: string,
    endUserIds: string[]
  ): Promise<Map<string, string>>;
  listIdentitiesByEndUserIds(
    partnerAppId: string,
    endUserIds: string[]
  ): Promise<PartnerEndUserIdentity[]>;
  findEndUsersByIds(ids: string[]): Promise<PartnerEndUserRecord[]>;
  blockEndUser(partnerAppId: string, endUserId: string): Promise<boolean>;
  unblockEndUser(partnerAppId: string, endUserId: string): Promise<boolean>;
  revokeSessionsByEndUserId(endUserId: string): Promise<void>;
  findEndUserBySmsPhone(partnerAppId: string, phone: string): Promise<PartnerEndUserRecord | null>;

  bindIdentity(
    partnerAppId: string,
    provider: 'sms' | 'wechat',
    providerSubject: string,
    endUserId: string
  ): Promise<void>;

  mergeEndUsers(partnerAppId: string, fromEndUserId: string, toEndUserId: string): Promise<void>;

  createSession(endUserId: string, tokenHash: string, expiresAt: string): Promise<PartnerSessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<PartnerSessionRecord | null>;
  revokeSession(id: string): Promise<void>;

  createAsset(data: Omit<PartnerAssetRecord, 'id' | 'created_at'>): Promise<PartnerAssetRecord>;
  findAssetById(id: string): Promise<PartnerAssetRecord | null>;
  listAssets(partnerAppId: string, endUserId?: string): Promise<PartnerAssetRecord[]>;

  appendAuditLog(data: PartnerAuditLogDto): Promise<void>;
}
