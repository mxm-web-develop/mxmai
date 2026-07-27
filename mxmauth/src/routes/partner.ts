/**
 * Partner 开放平台 API
 */
import { Router, Request, Response, NextFunction } from 'express';
import { maskPhone } from '../partner/phone';
import {
  buildH5LoginUrl,
  buildInviteUrl,
  buildOpenModeShareCopy,
  effectiveAllowedSlugs,
  generateInviteToken,
  maskIdentitySubject,
} from '../partner/access-control';
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { PartnerAppRecord } from '@mxmai/mxmdata';
import { gatewayOrJwtAuth } from '../middleware/auth';
import { generatePartnerSecret, hashPartnerSecret, isTimestampFresh, verifyPartnerHmac } from '../partner/crypto';
import { resolveIntegrationKeyFromRequest } from '../partner/integration-key';
import { signPartnerSessionToken } from '../partner/session-jwt';
import partnerAuthSmsRouter from '../partner/auth-sms.routes';

const router = Router();
const partnerRepo = RepositoryFactory.createPartnerRepository();

function jsonOk(res: Response, data: unknown, message = 'ok') {
  return res.json({ code: 200, message, data });
}

function jsonErr(res: Response, status: number, message: string, error = 'ERROR') {
  return res.status(status).json({ code: status, message, error });
}

async function requireIntegrationKey(req: Request, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveIntegrationKeyFromRequest(req.headers);
    if (!resolved) {
      return jsonErr(res, 401, '需要有效的 integration API Key', 'UNAUTHORIZED');
    }
    (req as any).integrationKey = resolved;
    next();
  } catch (e) {
    next(e);
  }
}

async function ensurePartnerAppForKey(resolved: Awaited<ReturnType<typeof resolveIntegrationKeyFromRequest>>) {
  if (!resolved) return null;
  if (resolved.partnerApp) return resolved.partnerApp;
  const secret = generatePartnerSecret();
  const app = await partnerRepo.createApp({
    ownerUserId: resolved.userId,
    apiKeyId: resolved.keyId,
    name: '默认 Partner 应用',
    secretHash: secret.hash,
    secretPrefix: secret.prefix,
    allowedSlugs: [],
  });
  return app;
}

function serializeApp(a: PartnerAppRecord) {
  return {
    id: a.id,
    name: a.name,
    apiKeyId: a.api_key_id,
    allowedSlugs: a.allowed_slugs,
    status: a.status,
    secretPrefix: a.secret_prefix,
    endUserAccessMode: a.end_user_access_mode,
    slugAccessMode: a.slug_access_mode,
    h5LoginBaseUrl: a.h5_login_base_url,
    hasInviteToken: !!a.invite_token_hash,
    dailyEndUserQuota: a.daily_end_user_quota,
    qpsLimit: a.qps_limit,
    createdAt: a.created_at,
  };
}

async function requireOwnedApp(appId: string, ownerUserId: string) {
  const app = await partnerRepo.findAppById(appId);
  if (!app || app.owner_user_id !== ownerUserId) return null;
  return app;
}

const DEFAULT_H5_ORIGIN = process.env.PARTNER_H5_PUBLIC_ORIGIN ?? '';

/** POST /api/v1/partner/apps — 创建 Partner 应用并绑定 integration Key */
router.post('/apps', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { apiKeyId, name, allowedSlugs } = req.body ?? {};
    if (!apiKeyId || !name) {
      return jsonErr(res, 400, 'apiKeyId 与 name 必填', 'VALIDATION_ERROR');
    }

    const userApiKeyRepo = RepositoryFactory.createUserApiKeyRepository();
    const keys = await userApiKeyRepo.listByUserId(userId);
    const keyMeta = keys.find((k) => k.id === String(apiKeyId));
    if (!keyMeta || keyMeta.key_type !== 'integration') {
      return jsonErr(res, 400, '无效的 integration Key', 'VALIDATION_ERROR');
    }
    const existing = await partnerRepo.findAppByApiKeyId(String(apiKeyId));
    if (existing) {
      return jsonErr(res, 409, '该 Key 已绑定 Partner 应用', 'DUPLICATE');
    }

    const secret = generatePartnerSecret();
    const app = await partnerRepo.createApp({
      ownerUserId: userId,
      apiKeyId: String(apiKeyId),
      name: String(name).trim(),
      secretHash: secret.hash,
      secretPrefix: secret.prefix,
      allowedSlugs: Array.isArray(allowedSlugs) ? allowedSlugs.map(String) : [],
    });

    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'app.create',
      actorUserId: userId,
    });

    return jsonOk(res, {
      app: {
        id: app.id,
        name: app.name,
        apiKeyId: app.api_key_id,
        allowedSlugs: app.allowed_slugs,
        status: app.status,
        secretPrefix: app.secret_prefix,
      },
      partnerSecret: secret.plain,
      hint: 'partnerSecret 仅展示一次，用于 HMAC delegate 签名',
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps */
router.get('/apps', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const apps = await partnerRepo.listAppsByOwner(req.user!.userId);
    return jsonOk(
      res,
      apps.map((a) => serializeApp(a))
    );
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps/by-key/:apiKeyId — 按 integration Key 查应用（lazy ensure） */
router.get('/apps/by-key/:apiKeyId', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const userApiKeyRepo = RepositoryFactory.createUserApiKeyRepository();
    const keys = await userApiKeyRepo.listByUserId(userId);
    const keyMeta = keys.find((k) => k.id === req.params.apiKeyId);
    if (!keyMeta || keyMeta.key_type !== 'integration') {
      return jsonErr(res, 400, '无效的 integration Key', 'VALIDATION_ERROR');
    }
    let app = await partnerRepo.findAppByApiKeyId(req.params.apiKeyId);
    if (!app) {
      const secret = generatePartnerSecret();
      app = await partnerRepo.createApp({
        ownerUserId: userId,
        apiKeyId: req.params.apiKeyId,
        name: keyMeta.name || 'Partner 应用',
        secretHash: secret.hash,
        secretPrefix: secret.prefix,
        allowedSlugs: [],
      });
    }
    return jsonOk(res, serializeApp(app));
  } catch (e) {
    next(e);
  }
});

/** PUT /api/v1/partner/apps/:id/settings */
router.put('/apps/:id/settings', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const { endUserAccessMode, slugAccessMode, allowedSlugs, h5LoginBaseUrl } = req.body ?? {};
    if (
      endUserAccessMode != null &&
      endUserAccessMode !== 'open' &&
      endUserAccessMode !== 'whitelist'
    ) {
      return jsonErr(res, 400, 'endUserAccessMode 须为 open 或 whitelist', 'VALIDATION_ERROR');
    }
    if (
      slugAccessMode != null &&
      slugAccessMode !== 'all_owner' &&
      slugAccessMode !== 'restricted'
    ) {
      return jsonErr(res, 400, 'slugAccessMode 须为 all_owner 或 restricted', 'VALIDATION_ERROR');
    }
    if (allowedSlugs != null && !Array.isArray(allowedSlugs)) {
      return jsonErr(res, 400, 'allowedSlugs 须为字符串数组', 'VALIDATION_ERROR');
    }
    if (slugAccessMode === 'restricted' && Array.isArray(allowedSlugs) && allowedSlugs.length === 0) {
      return jsonErr(res, 400, 'restricted 模式下 allowedSlugs 不能为空', 'VALIDATION_ERROR');
    }

    const updated = await partnerRepo.updateAppAccessSettings(req.params.id, req.user!.userId, {
      endUserAccessMode: endUserAccessMode ?? undefined,
      slugAccessMode: slugAccessMode ?? undefined,
      allowedSlugs: Array.isArray(allowedSlugs) ? allowedSlugs.map(String) : undefined,
      h5LoginBaseUrl: h5LoginBaseUrl !== undefined ? (h5LoginBaseUrl ? String(h5LoginBaseUrl) : null) : undefined,
    });
    if (!updated) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');

    await partnerRepo.appendAuditLog({
      partnerAppId: updated.id,
      action: 'app.update_settings',
      actorUserId: req.user!.userId,
      detail: { endUserAccessMode, slugAccessMode, allowedSlugs, h5LoginBaseUrl },
    });
    return jsonOk(res, serializeApp(updated));
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps/:id/allowlist */
router.get('/apps/:id/allowlist', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const rows = await partnerRepo.listAllowlist(app.id, limit, offset);
    return jsonOk(
      res,
      rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        subject: r.subject,
        subjectMasked: maskIdentitySubject(r.provider, r.subject),
        source: r.source,
        note: r.note,
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/apps/:id/allowlist */
router.post('/apps/:id/allowlist', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    const { provider, subject, note } = req.body ?? {};
    if (!provider || !subject) {
      return jsonErr(res, 400, 'provider 与 subject 必填', 'VALIDATION_ERROR');
    }
    const p = String(provider);
    if (p !== 'sms' && p !== 'wechat' && p !== 'external') {
      return jsonErr(res, 400, 'provider 无效', 'VALIDATION_ERROR');
    }
    let normalizedSubject = String(subject).trim();
    if (p === 'sms') {
      const { normalizeCnPhone } = await import('../partner/phone');
      const phone = normalizeCnPhone(normalizedSubject);
      if (!phone) return jsonErr(res, 400, '无效的手机号', 'VALIDATION_ERROR');
      normalizedSubject = phone;
    }
    const row = await partnerRepo.upsertAllowlist({
      partnerAppId: app.id,
      provider: p as 'sms' | 'wechat' | 'external',
      subject: normalizedSubject,
      source: 'manual',
      note: note ? String(note) : undefined,
      createdBy: req.user!.userId,
    });
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'allowlist.add',
      actorUserId: req.user!.userId,
      detail: { provider: p, subject: normalizedSubject },
    });
    return jsonOk(res, {
      id: row.id,
      provider: row.provider,
      subject: row.subject,
      subjectMasked: maskIdentitySubject(row.provider, row.subject),
      source: row.source,
    });
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/v1/partner/apps/:id/allowlist/:entryId */
router.delete('/apps/:id/allowlist/:entryId', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    const ok = await partnerRepo.removeAllowlist(app.id, req.params.entryId);
    if (!ok) return jsonErr(res, 404, '白名单条目不存在', 'NOT_FOUND');
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'allowlist.remove',
      actorUserId: req.user!.userId,
      detail: { entryId: req.params.entryId },
    });
    return jsonOk(res, { removed: true });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps/:id/share-link — 开放模式分享文案（无 invite token） */
router.get('/apps/:id/share-link', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');

    const url = buildH5LoginUrl(app, DEFAULT_H5_ORIGIN);
    const copyText = buildOpenModeShareCopy(app, DEFAULT_H5_ORIGIN);
    return jsonOk(res, {
      url,
      copyText,
      mode: app.end_user_access_mode,
      hint: '开放注册模式下无需邀请码，直接分享登录页链接',
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/apps/:id/invites — 白名单模式生成一次性邀请码 */
router.post('/apps/:id/invites', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    if (app.end_user_access_mode !== 'whitelist') {
      return jsonErr(res, 400, '仅白名单模式可生成邀请码', 'VALIDATION_ERROR');
    }

    const token = generateInviteToken();
    const invite = await partnerRepo.createAppInvite(app.id, token.hash, req.user!.userId);
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'invite.create',
      actorUserId: req.user!.userId,
      detail: { inviteId: invite.id },
    });

    return jsonOk(res, {
      inviteId: invite.id,
      url: buildInviteUrl(app, token.plain, DEFAULT_H5_ORIGIN),
      tokenPlain: token.plain,
      hint: '邀请码仅可使用一次，验码成功后自动失效',
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps/:id/invites */
router.get('/apps/:id/invites', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const rows = await partnerRepo.listAppInvites(app.id, limit, offset);
    return jsonOk(
      res,
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        usedSubject: r.used_subject ? maskIdentitySubject('sms', r.used_subject) : null,
        usedEndUserId: r.used_end_user_id,
        createdAt: r.created_at,
        usedAt: r.used_at,
      }))
    );
  } catch (e) {
    next(e);
  }
});

/** DELETE /api/v1/partner/apps/:id/invites/:inviteId */
router.delete('/apps/:id/invites/:inviteId', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    const ok = await partnerRepo.revokeAppInvite(app.id, req.params.inviteId);
    if (!ok) return jsonErr(res, 404, '邀请码不存在或已使用', 'NOT_FOUND');
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'invite.revoke',
      actorUserId: req.user!.userId,
      detail: { inviteId: req.params.inviteId },
    });
    return jsonOk(res, { revoked: true });
  } catch (e) {
    next(e);
  }
});

/** @deprecated 使用 POST /invites 生成一次性邀请码 */
router.get('/apps/:id/invite-link', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await requireOwnedApp(req.params.id, req.user!.userId);
    if (!app) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    if (app.end_user_access_mode !== 'whitelist') {
      return jsonErr(res, 400, '白名单模式请使用 POST /invites；开放模式请使用 GET /share-link', 'VALIDATION_ERROR');
    }
    return jsonErr(res, 410, '请使用 POST /apps/:id/invites 生成一次性邀请码', 'DEPRECATED');
  } catch (e) {
    next(e);
  }
});

/** @deprecated */
router.post('/apps/:id/invite-link/rotate', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    return jsonErr(res, 410, '请使用 POST /apps/:id/invites 生成新邀请码', 'DEPRECATED');
  } catch (e) {
    next(e);
  }
});

/** PUT /api/v1/partner/apps/:id/slugs */
router.put('/apps/:id/slugs', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const { allowedSlugs } = req.body ?? {};
    if (!Array.isArray(allowedSlugs)) {
      return jsonErr(res, 400, 'allowedSlugs 须为字符串数组', 'VALIDATION_ERROR');
    }
    const updated = await partnerRepo.updateAppSlugs(
      req.params.id,
      req.user!.userId,
      allowedSlugs.map(String)
    );
    if (!updated) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    await partnerRepo.appendAuditLog({
      partnerAppId: updated.id,
      action: 'app.update_slugs',
      actorUserId: req.user!.userId,
      detail: { allowedSlugs },
    });
    return jsonOk(res, { id: updated.id, allowedSlugs: updated.allowed_slugs });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/apps/:id/rotate-secret */
router.post('/apps/:id/rotate-secret', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const secret = generatePartnerSecret();
    const updated = await partnerRepo.rotateAppSecret(
      req.params.id,
      req.user!.userId,
      secret.hash,
      secret.prefix
    );
    if (!updated) return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    await partnerRepo.appendAuditLog({
      partnerAppId: updated.id,
      action: 'app.rotate_secret',
      actorUserId: req.user!.userId,
    });
    return jsonOk(res, {
      secretPrefix: updated.secret_prefix,
      partnerSecret: secret.plain,
      hint: 'partnerSecret 仅展示一次',
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps/:id/stats */
router.get('/apps/:id/stats', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await partnerRepo.findAppById(req.params.id);
    if (!app || app.owner_user_id !== req.user!.userId) {
      return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    }
    const days = Math.min(Math.max(Number(req.query.days ?? 30), 1), 90);
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const { getSupabaseClient } = await import('@mxmai/mxmdata');
    const client = getSupabaseClient();
    const { data: rows, error } = await client
      .from('published_api_usage_events')
      .select('end_user_id, status, tokens_charged, created_at')
      .eq('partner_app_id', app.id)
      .gte('created_at', since.toISOString());
    if (error) throw error;

    const byEndUser = new Map<string, { call_count: number; tokens_charged: number; last_called_at: string | null }>();
    let totalCalls = 0;
    let totalTokens = 0;
    for (const r of rows ?? []) {
      const eid = r.end_user_id ? String(r.end_user_id) : '__none__';
      totalCalls += 1;
      totalTokens += Number(r.tokens_charged ?? 0);
      const cur = byEndUser.get(eid) ?? { call_count: 0, tokens_charged: 0, last_called_at: null };
      cur.call_count += 1;
      cur.tokens_charged += Number(r.tokens_charged ?? 0);
      const ts = String(r.created_at);
      if (!cur.last_called_at || ts > cur.last_called_at) cur.last_called_at = ts;
      byEndUser.set(eid, cur);
    }

    const groupBy = String(req.query.groupBy ?? '');
    const endUserIds = [...byEndUser.keys()].filter((k) => k !== '__none__');
    const phoneMap = endUserIds.length
      ? await partnerRepo.listSmsPhonesByEndUserIds(app.id, endUserIds)
      : new Map<string, string>();
    const endUserRecords =
      endUserIds.length > 0 ? await partnerRepo.findEndUsersByIds(endUserIds) : [];
    const displayById = new Map(endUserRecords.map((u) => [u.id, u.display_name]));
    const kindById = new Map(endUserRecords.map((u) => [u.id, u.kind]));

    return jsonOk(res, {
      days,
      totalCalls,
      totalTokensCharged: totalTokens,
      byEndUser:
        groupBy === 'end_user'
          ? [...byEndUser.entries()].map(([end_user_id, v]) => {
              const id = end_user_id === '__none__' ? null : end_user_id;
              const phone = id ? phoneMap.get(id) ?? null : null;
              return {
                end_user_id: id,
                ...v,
                phone,
                phone_masked: phone ? maskPhone(phone) : null,
                display_name: id ? displayById.get(id) ?? null : null,
                user_kind: id ? kindById.get(id) ?? null : null,
              };
            })
          : undefined,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/partner/apps/:id/end-users */
router.get('/apps/:id/end-users', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await partnerRepo.findAppById(req.params.id);
    if (!app || app.owner_user_id !== req.user!.userId) {
      return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    }
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const days = Math.min(Math.max(Number(req.query.days ?? 30), 1), 90);
    const users = await partnerRepo.listEndUsers(app.id, limit, offset);
    const endUserIds = users.map((u) => u.id);

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const { getSupabaseClient } = await import('@mxmai/mxmdata');
    const client = getSupabaseClient();
    const usageByUser = new Map<
      string,
      { call_count: number; tokens_charged: number; last_called_at: string | null }
    >();
    if (endUserIds.length > 0) {
      const { data: usageRows } = await client
        .from('published_api_usage_events')
        .select('end_user_id, tokens_charged, created_at')
        .eq('partner_app_id', app.id)
        .gte('created_at', since.toISOString())
        .in('end_user_id', endUserIds);

      for (const r of usageRows ?? []) {
      if (!r.end_user_id) continue;
      const id = String(r.end_user_id);
      const cur = usageByUser.get(id) ?? { call_count: 0, tokens_charged: 0, last_called_at: null };
      cur.call_count += 1;
      cur.tokens_charged += Number(r.tokens_charged ?? 0);
      const ts = String(r.created_at);
      if (!cur.last_called_at || ts > cur.last_called_at) cur.last_called_at = ts;
        usageByUser.set(id, cur);
      }
    }

    const phoneMap = await partnerRepo.listSmsPhonesByEndUserIds(app.id, endUserIds);
    const identityRows = await partnerRepo.listIdentitiesByEndUserIds(app.id, endUserIds);
    const identitiesByUser = new Map<
      string,
      Array<{ provider: string; subject: string; subject_masked: string }>
    >();
    for (const row of identityRows) {
      const list = identitiesByUser.get(row.end_user_id) ?? [];
      list.push({
        provider: row.provider,
        subject: row.subject,
        subject_masked: maskIdentitySubject(row.provider, row.subject),
      });
      identitiesByUser.set(row.end_user_id, list);
    }

    const enriched = users.map((u) => {
      const phone = phoneMap.get(u.id) ?? null;
      const usage = usageByUser.get(u.id);
      const identities = identitiesByUser.get(u.id) ?? [];
      if (u.external_id && !identities.some((i) => i.provider === 'external')) {
        identities.push({
          provider: 'external',
          subject: u.external_id,
          subject_masked: maskIdentitySubject('external', u.external_id),
        });
      }
      return {
        ...u,
        phone,
        phone_masked: phone ? maskPhone(phone) : null,
        identities,
        call_count: usage?.call_count ?? 0,
        tokens_charged: usage?.tokens_charged ?? 0,
        last_called_at: usage?.last_called_at ?? null,
      };
    });

    return jsonOk(res, enriched);
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/apps/:id/end-users/:endUserId/block */
router.post('/apps/:id/end-users/:endUserId/block', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await partnerRepo.findAppById(req.params.id);
    if (!app || app.owner_user_id !== req.user!.userId) {
      return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    }
    const ok = await partnerRepo.blockEndUser(app.id, req.params.endUserId);
    if (!ok) return jsonErr(res, 404, '终端用户不存在', 'NOT_FOUND');
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'end_user.block',
      actorUserId: req.user!.userId,
      endUserId: req.params.endUserId,
    });
    return jsonOk(res, { blocked: true });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/apps/:id/end-users/:endUserId/unblock */
router.post('/apps/:id/end-users/:endUserId/unblock', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const app = await partnerRepo.findAppById(req.params.id);
    if (!app || app.owner_user_id !== req.user!.userId) {
      return jsonErr(res, 404, '应用不存在', 'NOT_FOUND');
    }
    const ok = await partnerRepo.unblockEndUser(app.id, req.params.endUserId);
    if (!ok) return jsonErr(res, 404, '终端用户不存在', 'NOT_FOUND');
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'end_user.unblock',
      actorUserId: req.user!.userId,
      endUserId: req.params.endUserId,
    });
    return jsonOk(res, { unblocked: true });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/sessions/anonymous — 已禁用（H5 须短信登录） */
router.post('/sessions/anonymous', requireIntegrationKey, async (_req, res) => {
  return jsonErr(res, 403, '匿名会话已禁用，请使用短信登录', 'ANONYMOUS_DISABLED');
});

/** POST /api/v1/partner/end-users/upsert — 服务端登记 external 用户 */
router.post('/end-users/upsert', requireIntegrationKey, async (req, res, next) => {
  try {
    const resolved = (req as any).integrationKey;
    const { externalId, displayName } = req.body ?? {};
    if (!externalId) return jsonErr(res, 400, 'externalId 必填', 'VALIDATION_ERROR');

    const app = await ensurePartnerAppForKey(resolved);
    if (!app) return jsonErr(res, 403, 'Partner 应用不可用', 'FORBIDDEN');

    const endUser = await partnerRepo.upsertExternalUser(app.id, String(externalId), displayName);
    return jsonOk(res, { endUserId: endUser.id, externalId: endUser.external_id, kind: endUser.kind });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/sessions/delegate — HMAC 换票 */
router.post('/sessions/delegate', requireIntegrationKey, async (req, res, next) => {
  try {
    const resolved = (req as any).integrationKey;
    const app = resolved?.partnerApp ?? (await ensurePartnerAppForKey(resolved));
    if (!app || app.status !== 'active') {
      return jsonErr(res, 403, 'Partner 应用不可用', 'FORBIDDEN');
    }

    const timestamp = String(req.headers['x-partner-timestamp'] ?? '');
    const signature = String(req.headers['x-partner-signature'] ?? '');
    const bodyStr = JSON.stringify(req.body ?? {});

    const partnerSecretHeader = String(req.headers['x-partner-secret'] ?? '').trim();
    if (!partnerSecretHeader) {
      return jsonErr(res, 401, '缺少 X-Partner-Secret（HMAC 签名密钥）', 'UNAUTHORIZED');
    }
    if (!isTimestampFresh(timestamp)) {
      return jsonErr(res, 401, '时间戳无效或已过期', 'TIMESTAMP_INVALID');
    }
    if (!verifyPartnerHmac(partnerSecretHeader, timestamp, bodyStr, signature)) {
      return jsonErr(res, 401, 'HMAC 签名无效', 'INVALID_SIGNATURE');
    }
    const secretHash = hashPartnerSecret(partnerSecretHeader);
    if (secretHash !== app.secret_hash) {
      return jsonErr(res, 401, 'Partner secret 不匹配', 'INVALID_SECRET');
    }

    const { externalId, displayName } = req.body ?? {};
    if (!externalId) return jsonErr(res, 400, 'externalId 必填', 'VALIDATION_ERROR');

    const endUser = await partnerRepo.upsertExternalUser(app.id, String(externalId), displayName);
    if (endUser.status === 'blocked') {
      return jsonErr(res, 403, '终端用户已封禁', 'END_USER_BLOCKED');
    }

    const { token, expiresAt, tokenHash } = signPartnerSessionToken({
      partnerAppId: app.id,
      endUserId: endUser.id,
      callerUserId: resolved!.userId,
      allowedSlugs: effectiveAllowedSlugs(app),
      sessionId: '',
    });
    const session = await partnerRepo.createSession(endUser.id, tokenHash, expiresAt);

    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'session.delegate',
      endUserId: endUser.id,
      detail: { sessionId: session.id, externalId },
    });

    return jsonOk(res, {
      sessionToken: token,
      expiresAt,
      endUserId: endUser.id,
      partnerAppId: app.id,
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/token/exchange — integration Key → 短期 session（方案三） */
router.post('/token/exchange', requireIntegrationKey, async (req, res, next) => {
  try {
    const resolved = (req as any).integrationKey;
    const app = await ensurePartnerAppForKey(resolved);
    if (!app || app.status !== 'active') {
      return jsonErr(res, 403, 'Partner 应用不可用', 'FORBIDDEN');
    }

    const scopeSlugs = Array.isArray(req.body?.scopeSlugs)
      ? (req.body.scopeSlugs as string[]).map(String)
      : effectiveAllowedSlugs(app);
    const externalId = String(req.body?.externalId ?? `exchange-${Date.now()}`);
    const endUser = await partnerRepo.upsertExternalUser(app.id, externalId, req.body?.displayName);

    const shortSec = Math.min(Math.max(Number(req.body?.expiresIn ?? 3600), 300), 86400);
    const prev = process.env.PARTNER_SESSION_EXPIRES_IN_SECONDS;
    process.env.PARTNER_SESSION_EXPIRES_IN_SECONDS = String(shortSec);
    const allowedForSession =
      app.slug_access_mode === 'restricted'
        ? scopeSlugs.filter((s) => app.allowed_slugs.includes(s))
        : scopeSlugs;
    const { token, expiresAt, tokenHash } = signPartnerSessionToken({
      partnerAppId: app.id,
      endUserId: endUser.id,
      callerUserId: resolved!.userId,
      allowedSlugs: allowedForSession,
      sessionId: '',
    });
    if (prev != null) process.env.PARTNER_SESSION_EXPIRES_IN_SECONDS = prev;
    else delete process.env.PARTNER_SESSION_EXPIRES_IN_SECONDS;

    await partnerRepo.createSession(endUser.id, tokenHash, expiresAt);
    await partnerRepo.appendAuditLog({
      partnerAppId: app.id,
      action: 'token.exchange',
      actorUserId: resolved!.userId,
      endUserId: endUser.id,
    });

    return jsonOk(res, {
      sessionToken: token,
      expiresAt,
      tokenType: 'partner_session',
      scopeSlugs,
    });
  } catch (e) {
    next(e);
  }
});

/** POST /api/v1/partner/sessions/revoke — 撤销当前 session */
router.post('/sessions/revoke', async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return jsonErr(res, 401, '需要 session token', 'UNAUTHORIZED');
    }
    const token = auth.slice(7).trim();
    const { verifyPartnerSessionToken } = await import('../partner/session-jwt');
    const { hashSessionToken } = await import('../partner/crypto');
    verifyPartnerSessionToken(token);
    const session = await partnerRepo.findSessionByTokenHash(hashSessionToken(token));
    if (session) await partnerRepo.revokeSession(session.id);
    return jsonOk(res, { revoked: true });
  } catch (e) {
    next(e);
  }
});

router.use('/auth/sms', partnerAuthSmsRouter);

export default router;
