/**
 * Partner 开放平台 Supabase 仓库
 */

import type {
  CreatePartnerAppDto,
  IPartnerRepository,
  PartnerAllowlistRecord,
  PartnerAppInviteRecord,
  PartnerAppRecord,
  PartnerAssetRecord,
  PartnerEndUserIdentity,
  PartnerEndUserRecord,
  PartnerSessionRecord,
  UpdatePartnerAppAccessSettingsDto,
} from '../../interfaces/IPartnerRepository';
import { DataAccessError } from '../../interfaces/errors';
import { getSupabaseClient } from './SupabaseClient';

const APPS = 'partner_apps';
const END_USERS = 'partner_end_users';
const SESSIONS = 'partner_sessions';
const ASSETS = 'partner_assets';
const AUDIT = 'partner_audit_logs';
const IDENTITIES = 'partner_end_user_identities';
const MERGES = 'partner_end_user_merges';
const ALLOWLIST = 'partner_app_allowlist';
const INVITES = 'partner_app_invites';

function mapApp(row: Record<string, unknown>): PartnerAppRecord {
  return {
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    api_key_id: String(row.api_key_id),
    name: String(row.name),
    secret_hash: String(row.secret_hash),
    secret_prefix: String(row.secret_prefix),
    allowed_slugs: Array.isArray(row.allowed_slugs) ? (row.allowed_slugs as string[]) : [],
    status: row.status === 'disabled' ? 'disabled' : 'active',
    end_user_access_mode: row.end_user_access_mode === 'whitelist' ? 'whitelist' : 'open',
    slug_access_mode: row.slug_access_mode === 'restricted' ? 'restricted' : 'all_owner',
    invite_token_hash: row.invite_token_hash != null ? String(row.invite_token_hash) : null,
    h5_login_base_url: row.h5_login_base_url != null ? String(row.h5_login_base_url) : null,
    daily_end_user_quota:
      row.daily_end_user_quota != null ? Number(row.daily_end_user_quota) : null,
    qps_limit: row.qps_limit != null ? Number(row.qps_limit) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapInvite(row: Record<string, unknown>): PartnerAppInviteRecord {
  const status = String(row.status);
  return {
    id: String(row.id),
    partner_app_id: String(row.partner_app_id),
    token_hash: String(row.token_hash),
    status: status === 'used' ? 'used' : status === 'revoked' ? 'revoked' : 'pending',
    used_subject: row.used_subject != null ? String(row.used_subject) : null,
    used_end_user_id: row.used_end_user_id != null ? String(row.used_end_user_id) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
    used_at: row.used_at != null ? String(row.used_at) : null,
  };
}

function mapAllowlist(row: Record<string, unknown>): PartnerAllowlistRecord {
  const provider = String(row.provider);
  return {
    id: String(row.id),
    partner_app_id: String(row.partner_app_id),
    provider:
      provider === 'wechat' ? 'wechat' : provider === 'external' ? 'external' : 'sms',
    subject: String(row.subject),
    source: row.source === 'invite' ? 'invite' : 'manual',
    note: row.note != null ? String(row.note) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    created_at: String(row.created_at),
  };
}

function mapEndUser(row: Record<string, unknown>): PartnerEndUserRecord {
  return {
    id: String(row.id),
    partner_app_id: String(row.partner_app_id),
    kind: row.kind === 'external' ? 'external' : 'anonymous',
    external_id: row.external_id != null ? String(row.external_id) : null,
    device_fingerprint:
      row.device_fingerprint != null ? String(row.device_fingerprint) : null,
    display_name: row.display_name != null ? String(row.display_name) : null,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
    status: row.status === 'blocked' ? 'blocked' : 'active',
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSession(row: Record<string, unknown>): PartnerSessionRecord {
  return {
    id: String(row.id),
    end_user_id: String(row.end_user_id),
    token_hash: String(row.token_hash),
    expires_at: String(row.expires_at),
    revoked_at: row.revoked_at != null ? String(row.revoked_at) : null,
    created_at: String(row.created_at),
  };
}

function mapAsset(row: Record<string, unknown>): PartnerAssetRecord {
  return {
    id: String(row.id),
    partner_app_id: String(row.partner_app_id),
    end_user_id: row.end_user_id != null ? String(row.end_user_id) : null,
    kind: row.kind === 'end_user' ? 'end_user' : 'app_shared',
    storage_bucket: String(row.storage_bucket),
    storage_key: String(row.storage_key),
    mime_type: row.mime_type != null ? String(row.mime_type) : null,
    label: row.label != null ? String(row.label) : null,
    created_at: String(row.created_at),
  };
}

export class SupabasePartnerRepository implements IPartnerRepository {
  private client = getSupabaseClient();

  async createApp(data: CreatePartnerAppDto): Promise<PartnerAppRecord> {
    const now = new Date().toISOString();
    const row = {
      owner_user_id: data.ownerUserId,
      api_key_id: data.apiKeyId,
      name: data.name,
      secret_hash: data.secretHash,
      secret_prefix: data.secretPrefix,
      allowed_slugs: data.allowedSlugs,
      updated_at: now,
    };
    const { data: inserted, error } = await this.client.from(APPS).insert(row).select().single();
    if (error) throw new DataAccessError(`partner_apps create: ${error.message}`, 'INSERT_ERROR', error);
    return mapApp(inserted as Record<string, unknown>);
  }

  async findAppById(id: string): Promise<PartnerAppRecord | null> {
    const { data, error } = await this.client.from(APPS).select('*').eq('id', id).maybeSingle();
    if (error) throw new DataAccessError(`partner_apps find: ${error.message}`, 'QUERY_ERROR', error);
    return data ? mapApp(data as Record<string, unknown>) : null;
  }

  async findAppByApiKeyId(apiKeyId: string): Promise<PartnerAppRecord | null> {
    const { data, error } = await this.client
      .from(APPS)
      .select('*')
      .eq('api_key_id', apiKeyId)
      .maybeSingle();
    if (error) throw new DataAccessError(`partner_apps by key: ${error.message}`, 'QUERY_ERROR', error);
    return data ? mapApp(data as Record<string, unknown>) : null;
  }

  async listAppsByOwner(ownerUserId: string): Promise<PartnerAppRecord[]> {
    const { data, error } = await this.client
      .from(APPS)
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: false });
    if (error) throw new DataAccessError(`partner_apps list: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map((r) => mapApp(r as Record<string, unknown>));
  }

  async updateAppSlugs(
    id: string,
    ownerUserId: string,
    allowedSlugs: string[]
  ): Promise<PartnerAppRecord | null> {
    const { data, error } = await this.client
      .from(APPS)
      .update({ allowed_slugs: allowedSlugs, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_user_id', ownerUserId)
      .select()
      .maybeSingle();
    if (error) throw new DataAccessError(`partner_apps update slugs: ${error.message}`, 'UPDATE_ERROR', error);
    return data ? mapApp(data as Record<string, unknown>) : null;
  }

  async updateAppAccessSettings(
    id: string,
    ownerUserId: string,
    data: UpdatePartnerAppAccessSettingsDto
  ): Promise<PartnerAppRecord | null> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.endUserAccessMode != null) patch.end_user_access_mode = data.endUserAccessMode;
    if (data.slugAccessMode != null) patch.slug_access_mode = data.slugAccessMode;
    if (data.allowedSlugs != null) patch.allowed_slugs = data.allowedSlugs;
    if (data.h5LoginBaseUrl !== undefined) {
      patch.h5_login_base_url = data.h5LoginBaseUrl;
    }
    const { data: updated, error } = await this.client
      .from(APPS)
      .update(patch)
      .eq('id', id)
      .eq('owner_user_id', ownerUserId)
      .select()
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`partner_apps update settings: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return updated ? mapApp(updated as Record<string, unknown>) : null;
  }

  async findAppByInviteTokenHash(tokenHash: string): Promise<PartnerAppRecord | null> {
    const { data, error } = await this.client
      .from(APPS)
      .select('*')
      .eq('invite_token_hash', tokenHash)
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`partner_apps by invite: ${error.message}`, 'QUERY_ERROR', error);
    }
    return data ? mapApp(data as Record<string, unknown>) : null;
  }

  async setInviteTokenHash(
    id: string,
    ownerUserId: string,
    tokenHash: string
  ): Promise<PartnerAppRecord | null> {
    const { data, error } = await this.client
      .from(APPS)
      .update({
        invite_token_hash: tokenHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_user_id', ownerUserId)
      .select()
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`partner_apps set invite: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return data ? mapApp(data as Record<string, unknown>) : null;
  }

  async createAppInvite(
    partnerAppId: string,
    tokenHash: string,
    createdBy?: string
  ): Promise<PartnerAppInviteRecord> {
    const { data, error } = await this.client
      .from(INVITES)
      .insert({
        partner_app_id: partnerAppId,
        token_hash: tokenHash,
        created_by: createdBy ?? null,
      })
      .select()
      .single();
    if (error) {
      throw new DataAccessError(`partner_app_invites create: ${error.message}`, 'INSERT_ERROR', error);
    }
    return mapInvite(data as Record<string, unknown>);
  }

  async findPendingInviteByTokenHash(
    partnerAppId: string,
    tokenHash: string
  ): Promise<PartnerAppInviteRecord | null> {
    const { data, error } = await this.client
      .from(INVITES)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .eq('token_hash', tokenHash)
      .eq('status', 'pending')
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`partner_app_invites find: ${error.message}`, 'QUERY_ERROR', error);
    }
    return data ? mapInvite(data as Record<string, unknown>) : null;
  }

  async consumeAppInvite(
    partnerAppId: string,
    inviteId: string,
    usedSubject: string,
    usedEndUserId: string
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from(INVITES)
      .update({
        status: 'used',
        used_subject: usedSubject,
        used_end_user_id: usedEndUserId,
        used_at: now,
      })
      .eq('id', inviteId)
      .eq('partner_app_id', partnerAppId)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      throw new DataAccessError(`partner_app_invites consume: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return (data?.length ?? 0) > 0;
  }

  async listAppInvites(
    partnerAppId: string,
    limit = 50,
    offset = 0
  ): Promise<PartnerAppInviteRecord[]> {
    const { data, error } = await this.client
      .from(INVITES)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      throw new DataAccessError(`partner_app_invites list: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data ?? []).map((r) => mapInvite(r as Record<string, unknown>));
  }

  async revokeAppInvite(partnerAppId: string, inviteId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from(INVITES)
      .update({ status: 'revoked' })
      .eq('id', inviteId)
      .eq('partner_app_id', partnerAppId)
      .eq('status', 'pending')
      .select('id');
    if (error) {
      throw new DataAccessError(`partner_app_invites revoke: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return (data?.length ?? 0) > 0;
  }

  async listAllowlist(
    partnerAppId: string,
    limit = 100,
    offset = 0
  ): Promise<PartnerAllowlistRecord[]> {
    const { data, error } = await this.client
      .from(ALLOWLIST)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      throw new DataAccessError(`partner_allowlist list: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data ?? []).map((r) => mapAllowlist(r as Record<string, unknown>));
  }

  async isInAllowlist(
    partnerAppId: string,
    provider: 'sms' | 'wechat' | 'external',
    subject: string
  ): Promise<boolean> {
    const { data, error } = await this.client
      .from(ALLOWLIST)
      .select('id')
      .eq('partner_app_id', partnerAppId)
      .eq('provider', provider)
      .eq('subject', subject)
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`partner_allowlist check: ${error.message}`, 'QUERY_ERROR', error);
    }
    return !!data;
  }

  async upsertAllowlist(data: {
    partnerAppId: string;
    provider: 'sms' | 'wechat' | 'external';
    subject: string;
    source: 'manual' | 'invite';
    note?: string;
    createdBy?: string;
  }): Promise<PartnerAllowlistRecord> {
    const { data: row, error } = await this.client
      .from(ALLOWLIST)
      .upsert(
        {
          partner_app_id: data.partnerAppId,
          provider: data.provider,
          subject: data.subject,
          source: data.source,
          note: data.note ?? null,
          created_by: data.createdBy ?? null,
        },
        { onConflict: 'partner_app_id,provider,subject' }
      )
      .select()
      .single();
    if (error) {
      throw new DataAccessError(`partner_allowlist upsert: ${error.message}`, 'INSERT_ERROR', error);
    }
    return mapAllowlist(row as Record<string, unknown>);
  }

  async removeAllowlist(partnerAppId: string, allowlistId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from(ALLOWLIST)
      .delete()
      .eq('id', allowlistId)
      .eq('partner_app_id', partnerAppId)
      .select('id');
    if (error) {
      throw new DataAccessError(`partner_allowlist delete: ${error.message}`, 'DELETE_ERROR', error);
    }
    return (data?.length ?? 0) > 0;
  }

  async rotateAppSecret(
    id: string,
    ownerUserId: string,
    secretHash: string,
    secretPrefix: string
  ): Promise<PartnerAppRecord | null> {
    const { data, error } = await this.client
      .from(APPS)
      .update({
        secret_hash: secretHash,
        secret_prefix: secretPrefix,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_user_id', ownerUserId)
      .select()
      .maybeSingle();
    if (error) throw new DataAccessError(`partner_apps rotate secret: ${error.message}`, 'UPDATE_ERROR', error);
    return data ? mapApp(data as Record<string, unknown>) : null;
  }

  async findOrCreateAnonymousUser(
    partnerAppId: string,
    deviceFingerprint: string
  ): Promise<PartnerEndUserRecord> {
    const { data: existing, error: findErr } = await this.client
      .from(END_USERS)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .eq('device_fingerprint', deviceFingerprint)
      .eq('kind', 'anonymous')
      .maybeSingle();
    if (findErr) {
      throw new DataAccessError(`partner_end_users find: ${findErr.message}`, 'QUERY_ERROR', findErr);
    }
    if (existing) return mapEndUser(existing as Record<string, unknown>);

    const now = new Date().toISOString();
    const { data: inserted, error } = await this.client
      .from(END_USERS)
      .insert({
        partner_app_id: partnerAppId,
        kind: 'anonymous',
        device_fingerprint: deviceFingerprint,
        updated_at: now,
      })
      .select()
      .single();
    if (error) {
      throw new DataAccessError(`partner_end_users create: ${error.message}`, 'INSERT_ERROR', error);
    }
    return mapEndUser(inserted as Record<string, unknown>);
  }

  async findAnonymousUserByDevice(
    partnerAppId: string,
    deviceFingerprint: string
  ): Promise<PartnerEndUserRecord | null> {
    const { data, error } = await this.client
      .from(END_USERS)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .eq('device_fingerprint', deviceFingerprint)
      .eq('kind', 'anonymous')
      .maybeSingle();
    if (error) {
      throw new DataAccessError(`partner_end_users find device: ${error.message}`, 'QUERY_ERROR', error);
    }
    return data ? mapEndUser(data as Record<string, unknown>) : null;
  }

  async upsertExternalUser(
    partnerAppId: string,
    externalId: string,
    displayName?: string
  ): Promise<PartnerEndUserRecord> {
    const { data: existing, error: findErr } = await this.client
      .from(END_USERS)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .eq('external_id', externalId)
      .maybeSingle();
    if (findErr) {
      throw new DataAccessError(`partner_end_users find ext: ${findErr.message}`, 'QUERY_ERROR', findErr);
    }
    const now = new Date().toISOString();
    if (existing) {
      if (displayName) {
        const { data: updated, error } = await this.client
          .from(END_USERS)
          .update({ display_name: displayName, updated_at: now })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) {
          throw new DataAccessError(`partner_end_users update: ${error.message}`, 'UPDATE_ERROR', error);
        }
        return mapEndUser(updated as Record<string, unknown>);
      }
      return mapEndUser(existing as Record<string, unknown>);
    }

    const { data: inserted, error } = await this.client
      .from(END_USERS)
      .insert({
        partner_app_id: partnerAppId,
        kind: 'external',
        external_id: externalId,
        display_name: displayName ?? null,
        updated_at: now,
      })
      .select()
      .single();
    if (error) {
      throw new DataAccessError(`partner_end_users upsert: ${error.message}`, 'INSERT_ERROR', error);
    }
    return mapEndUser(inserted as Record<string, unknown>);
  }

  async findEndUserById(id: string): Promise<PartnerEndUserRecord | null> {
    const { data, error } = await this.client.from(END_USERS).select('*').eq('id', id).maybeSingle();
    if (error) throw new DataAccessError(`partner_end_users find: ${error.message}`, 'QUERY_ERROR', error);
    return data ? mapEndUser(data as Record<string, unknown>) : null;
  }

  async listEndUsers(
    partnerAppId: string,
    limit = 50,
    offset = 0
  ): Promise<PartnerEndUserRecord[]> {
    const { data, error } = await this.client
      .from(END_USERS)
      .select('*')
      .eq('partner_app_id', partnerAppId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new DataAccessError(`partner_end_users list: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map((r) => mapEndUser(r as Record<string, unknown>));
  }

  async listSmsPhonesByEndUserIds(
    partnerAppId: string,
    endUserIds: string[]
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (endUserIds.length === 0) return out;
    const { data, error } = await this.client
      .from(IDENTITIES)
      .select('end_user_id, provider_subject')
      .eq('partner_app_id', partnerAppId)
      .eq('provider', 'sms')
      .in('end_user_id', endUserIds);
    if (error) {
      throw new DataAccessError(`partner_identities list: ${error.message}`, 'QUERY_ERROR', error);
    }
    for (const row of data ?? []) {
      out.set(String(row.end_user_id), String(row.provider_subject));
    }
    return out;
  }

  async listIdentitiesByEndUserIds(
    partnerAppId: string,
    endUserIds: string[]
  ): Promise<PartnerEndUserIdentity[]> {
    if (endUserIds.length === 0) return [];
    const { data, error } = await this.client
      .from(IDENTITIES)
      .select('end_user_id, provider, provider_subject')
      .eq('partner_app_id', partnerAppId)
      .in('end_user_id', endUserIds);
    if (error) {
      throw new DataAccessError(`partner_identities list all: ${error.message}`, 'QUERY_ERROR', error);
    }
    return (data ?? []).map((row) => {
      const provider = String(row.provider);
      return {
        end_user_id: String(row.end_user_id),
        provider:
          provider === 'wechat' ? 'wechat' : provider === 'external' ? 'external' : 'sms',
        subject: String(row.provider_subject),
      };
    });
  }

  async findEndUsersByIds(ids: string[]): Promise<PartnerEndUserRecord[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.client.from(END_USERS).select('*').in('id', ids);
    if (error) throw new DataAccessError(`partner_end_users findByIds: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map((r) => mapEndUser(r as Record<string, unknown>));
  }

  async blockEndUser(partnerAppId: string, endUserId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from(END_USERS)
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('id', endUserId)
      .eq('partner_app_id', partnerAppId)
      .select('id');
    if (error) throw new DataAccessError(`partner_end_users block: ${error.message}`, 'UPDATE_ERROR', error);
    if ((data?.length ?? 0) > 0) {
      await this.revokeSessionsByEndUserId(endUserId);
    }
    return (data?.length ?? 0) > 0;
  }

  async unblockEndUser(partnerAppId: string, endUserId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from(END_USERS)
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', endUserId)
      .eq('partner_app_id', partnerAppId)
      .select('id');
    if (error) {
      throw new DataAccessError(`partner_end_users unblock: ${error.message}`, 'UPDATE_ERROR', error);
    }
    return (data?.length ?? 0) > 0;
  }

  async revokeSessionsByEndUserId(endUserId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from(SESSIONS)
      .update({ revoked_at: now })
      .eq('end_user_id', endUserId)
      .is('revoked_at', null);
    if (error) {
      throw new DataAccessError(`partner_sessions revoke all: ${error.message}`, 'UPDATE_ERROR', error);
    }
  }

  async findEndUserBySmsPhone(partnerAppId: string, phone: string): Promise<PartnerEndUserRecord | null> {
    const { data: identity, error: idErr } = await this.client
      .from(IDENTITIES)
      .select('end_user_id')
      .eq('partner_app_id', partnerAppId)
      .eq('provider', 'sms')
      .eq('provider_subject', phone)
      .maybeSingle();
    if (idErr) {
      throw new DataAccessError(`partner_identities find phone: ${idErr.message}`, 'QUERY_ERROR', idErr);
    }
    if (!identity) return null;
    return this.findEndUserById(String(identity.end_user_id));
  }

  async bindIdentity(
    partnerAppId: string,
    provider: 'sms' | 'wechat',
    providerSubject: string,
    endUserId: string
  ): Promise<void> {
    const { error } = await this.client.from(IDENTITIES).upsert(
      {
        partner_app_id: partnerAppId,
        provider,
        provider_subject: providerSubject,
        end_user_id: endUserId,
      },
      { onConflict: 'partner_app_id,provider,provider_subject' }
    );
    if (error) {
      throw new DataAccessError(`partner_identities bind: ${error.message}`, 'INSERT_ERROR', error);
    }
  }

  async mergeEndUsers(
    partnerAppId: string,
    fromEndUserId: string,
    toEndUserId: string
  ): Promise<void> {
    if (fromEndUserId === toEndUserId) return;

    const { error: usageErr } = await this.client
      .from('published_api_usage_events')
      .update({ end_user_id: toEndUserId })
      .eq('partner_app_id', partnerAppId)
      .eq('end_user_id', fromEndUserId);
    if (usageErr) {
      throw new DataAccessError(`merge usage: ${usageErr.message}`, 'UPDATE_ERROR', usageErr);
    }

    const { error: assetErr } = await this.client
      .from(ASSETS)
      .update({ end_user_id: toEndUserId })
      .eq('partner_app_id', partnerAppId)
      .eq('end_user_id', fromEndUserId);
    if (assetErr) {
      throw new DataAccessError(`merge assets: ${assetErr.message}`, 'UPDATE_ERROR', assetErr);
    }

    const { data: storageRows, error: soFindErr } = await this.client
      .from('storage_objects')
      .select('id, metadata')
      .contains('metadata', { end_user_id: fromEndUserId });
    if (soFindErr) {
      throw new DataAccessError(`merge storage find: ${soFindErr.message}`, 'QUERY_ERROR', soFindErr);
    }
    for (const row of storageRows ?? []) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      await this.client
        .from('storage_objects')
        .update({
          metadata: { ...meta, end_user_id: toEndUserId },
          partner_end_user_id: toEndUserId,
        })
        .eq('id', row.id);
    }

    const { error: mergeLogErr } = await this.client.from(MERGES).insert({
      partner_app_id: partnerAppId,
      from_end_user_id: fromEndUserId,
      to_end_user_id: toEndUserId,
      reason: 'anonymous_upgrade',
    });
    if (mergeLogErr) {
      throw new DataAccessError(`merge log: ${mergeLogErr.message}`, 'INSERT_ERROR', mergeLogErr);
    }

    await this.client
      .from(END_USERS)
      .update({ status: 'blocked', updated_at: new Date().toISOString() })
      .eq('id', fromEndUserId)
      .eq('partner_app_id', partnerAppId);
  }

  async createSession(
    endUserId: string,
    tokenHash: string,
    expiresAt: string
  ): Promise<PartnerSessionRecord> {
    const { data, error } = await this.client
      .from(SESSIONS)
      .insert({ end_user_id: endUserId, token_hash: tokenHash, expires_at: expiresAt })
      .select()
      .single();
    if (error) throw new DataAccessError(`partner_sessions create: ${error.message}`, 'INSERT_ERROR', error);
    return mapSession(data as Record<string, unknown>);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<PartnerSessionRecord | null> {
    const { data, error } = await this.client
      .from(SESSIONS)
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) throw new DataAccessError(`partner_sessions find: ${error.message}`, 'QUERY_ERROR', error);
    return data ? mapSession(data as Record<string, unknown>) : null;
  }

  async revokeSession(id: string): Promise<void> {
    const { error } = await this.client
      .from(SESSIONS)
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new DataAccessError(`partner_sessions revoke: ${error.message}`, 'UPDATE_ERROR', error);
  }

  async createAsset(
    data: Omit<PartnerAssetRecord, 'id' | 'created_at'>
  ): Promise<PartnerAssetRecord> {
    const { data: inserted, error } = await this.client.from(ASSETS).insert(data).select().single();
    if (error) throw new DataAccessError(`partner_assets create: ${error.message}`, 'INSERT_ERROR', error);
    return mapAsset(inserted as Record<string, unknown>);
  }

  async findAssetById(id: string): Promise<PartnerAssetRecord | null> {
    const { data, error } = await this.client.from(ASSETS).select('*').eq('id', id).maybeSingle();
    if (error) throw new DataAccessError(`partner_assets find: ${error.message}`, 'QUERY_ERROR', error);
    return data ? mapAsset(data as Record<string, unknown>) : null;
  }

  async listAssets(partnerAppId: string, endUserId?: string): Promise<PartnerAssetRecord[]> {
    let q = this.client.from(ASSETS).select('*').eq('partner_app_id', partnerAppId);
    if (endUserId) {
      q = q.or(`end_user_id.eq.${endUserId},kind.eq.app_shared`);
    }
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new DataAccessError(`partner_assets list: ${error.message}`, 'QUERY_ERROR', error);
    return (data ?? []).map((r) => mapAsset(r as Record<string, unknown>));
  }

  async appendAuditLog(data: {
    partnerAppId: string;
    action: string;
    actorUserId?: string;
    endUserId?: string;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.client.from(AUDIT).insert({
      partner_app_id: data.partnerAppId,
      action: data.action,
      actor_user_id: data.actorUserId ?? null,
      end_user_id: data.endUserId ?? null,
      detail: data.detail ?? {},
    });
    if (error) throw new DataAccessError(`partner_audit_logs: ${error.message}`, 'INSERT_ERROR', error);
  }
}
