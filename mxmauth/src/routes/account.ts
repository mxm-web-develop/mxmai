/**
 * 账户相关路由
 */

import '../config/loadEnv';
import crypto from 'crypto';
import { Router } from 'express';
import { RepositoryFactory, isAppLocale } from '@mxmai/mxmdata';
import { hashPassword, verifyPassword } from '../auth/password';
import { generateTokenPair, getRefreshTokenExpiresInSeconds } from '../auth/jwt';
import { authMiddleware, gatewayOrJwtAuth } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin.middleware';
import { captchaMiddleware } from '../middleware/captcha.middleware';
import { DuplicateError, NotFoundError } from '@mxmai/mxmdata';
import { WalletService } from '../services/wallet.service';
import { FolderService } from '../services/folder.service';
import { CaptchaService } from '../services/captcha.service';
import { getSupabaseClient } from '@mxmai/mxmdata';
import { MediaService, type MediaItemInput } from '../services/media.service';
import { mailService, isSmtpConfigured } from '../services/mail.service';
import { authEmailTokenService } from '../services/auth-email-token.service';
import {
  allocateUsernameFromEmail,
  registerAccountAuthPublicRoutes,
} from './account-auth-public';
import { registerAccountMfaRoutes } from './account-mfa';
import { generateMfaChallengeToken, getMfaChallengeExpiresIn } from '../auth/jwt';

const router = Router();
const userRepo = RepositoryFactory.createUserRepository();
const userApiKeyRepo = RepositoryFactory.createUserApiKeyRepository();
const walletService = new WalletService();
const folderService = new FolderService();
const captchaService = new CaptchaService();
const mediaService = new MediaService();

registerAccountAuthPublicRoutes(router);
registerAccountMfaRoutes(router);

/**
 * GET /api/v1/account/captcha/config
 * 前端判断是否需在登录前弹出验证码
 */
router.get('/captcha/config', (_req, res) => {
  res.json({
    code: 200,
    message: 'ok',
    data: { enabled: process.env.CAPTCHA_ENABLE === 'true' },
  });
});

/**
 * GET /api/v1/account/captcha
 * 获取滑动拼图验证码
 */
router.get('/captcha', async (req, res, next) => {
  try {
    const captcha = await captchaService.generate();
    res.json({
      code: 200,
      message: '验证码生成成功',
      data: captcha,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/account/captcha/verify
 * 校验滑动拼图（登录/注册前须先通过）
 */
router.post('/captcha/verify', async (req, res, next) => {
  try {
    const { captchaId, x, duration, trail } = req.body ?? {};
    const result = await captchaService.verifySlide(captchaId, {
      x: Number(x),
      duration: duration != null ? Number(duration) : undefined,
      trail: Array.isArray(trail) ? trail : undefined,
    });

    if (!result.success) {
      return res.status(400).json({
        code: 400,
        message: result.reason || '滑动验证失败',
        error: 'CAPTCHA_INVALID',
      });
    }

    res.json({
      code: 200,
      message: '验证通过',
      data: { verified: true },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/account/register
 * 邮箱注册：创建未验证用户并发送验证邮件（不签发 JWT）
 */
router.post('/register', captchaMiddleware, async (req, res, next) => {
  try {
    const emailRaw = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    const phone = req.body?.phone ? String(req.body.phone).trim() : undefined;
    let username = req.body?.username ? String(req.body.username).trim() : '';

    if (!emailRaw || !password) {
      return res.status(400).json({
        code: 400,
        message: 'Email and password are required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return res.status(400).json({
        code: 400,
        message: 'Invalid email address',
        error: 'VALIDATION_ERROR',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        code: 400,
        message: 'Password must be at least 8 characters',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!isSmtpConfigured() && process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        code: 503,
        message: 'Email service is not configured; cannot register',
        error: 'SMTP_NOT_CONFIGURED',
      });
    }

    if (!username) {
      username = await allocateUsernameFromEmail(emailRaw);
    }

    const password_hash = await hashPassword(password);

    try {
      const user = await userRepo.create({
        username,
        email: emailRaw,
        phone,
        password_hash,
        email_verified_at: null,
      });

      const folderInfo = await folderService.createDefaultFolders(user.id);
      if (folderInfo) {
        console.log(`✅ 用户 ${user.id} 默认文件夹创建成功:`, folderInfo);
      } else {
        console.warn(`⚠️ 用户 ${user.id} 默认文件夹创建失败或服务不可用`);
      }

      const token = await authEmailTokenService.issue(user.id, 'email_verify');
      const al = String(req.headers['accept-language'] || '');
      const locale = al.toLowerCase().startsWith('en') ? 'en' : 'zh';
      const mail = mailService.buildVerifyEmail({ token, locale });
      try {
        await mailService.sendMail({ to: emailRaw, ...mail });
      } catch (mailErr) {
        const code = (mailErr as { code?: string })?.code;
        if (code === 'SMTP_NOT_CONFIGURED' && process.env.NODE_ENV !== 'production') {
          console.warn('[register] SMTP missing; verify link:', mail.link);
        } else {
          throw mailErr;
        }
      }

      const { password_hash: _, ...userWithoutPassword } = user;

      res.status(201).json({
        code: 201,
        message: 'User registered; please verify your email',
        data: {
          user: userWithoutPassword,
          needVerification: true,
        },
      });
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (error instanceof DuplicateError || err?.code === 'DUPLICATE') {
        return res.status(409).json({
          code: 409,
          message: err?.message || 'Resource already exists',
          error: 'DUPLICATE',
        });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/account/login
 * 用户登录（验证码默认禁用，正式上线前可通过设置 CAPTCHA_ENABLE=true 启用）
 */
router.post('/login', captchaMiddleware, async (req, res, next) => {
  try {
    const { username, phone, password } = req.body;
    const email = req.body?.email
      ? String(req.body.email).trim().toLowerCase()
      : undefined;

    if (!password) {
      return res.status(400).json({
        code: 400,
        message: 'Password is required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 兼容：单一 identifier 字段（前端邮箱登录可走 email 或 username）
    const identifier = req.body?.identifier
      ? String(req.body.identifier).trim()
      : undefined;

    if (!username && !email && !phone && !identifier) {
      return res.status(400).json({
        code: 400,
        message: 'Username, email, or phone is required',
        error: 'VALIDATION_ERROR',
      });
    }

    let user = null;
    if (email) {
      user = await userRepo.findByEmail(email);
    } else if (username) {
      user = await userRepo.findByUsername(username);
    } else if (phone) {
      user = await userRepo.findByPhone(phone);
      if (!user) user = await userRepo.findByUsername(phone);
    } else if (identifier) {
      if (identifier.includes('@')) {
        user = await userRepo.findByEmail(identifier.toLowerCase());
      }
      if (!user) {
        user = await userRepo.findByUsername(identifier);
      }
    }

    if (!user) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid credentials',
        error: 'UNAUTHORIZED',
      });
    }

    if (!user.password_hash) {
      return res.status(401).json({
        code: 401,
        message: 'Please sign in with Google or GitHub',
        error: 'OAUTH_ONLY',
      });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid credentials',
        error: 'UNAUTHORIZED',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        code: 403,
        message: `Account is ${user.status}`,
        error: 'FORBIDDEN',
      });
    }

    // 迭代期：管理员账号允许未验证邮箱登录；普通用户仍需验证
    if (user.email && !user.email_verified_at && user.role !== 'admin') {
      return res.status(403).json({
        code: 403,
        message: 'Please verify your email before signing in',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }

    if (user.mfa_totp_enabled) {
      const mfaToken = generateMfaChallengeToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });
      return res.json({
        code: 200,
        message: 'MFA required',
        data: {
          mfaRequired: true,
          mfaToken,
          expiresIn: getMfaChallengeExpiresIn(),
        },
      });
    }

    const tokens = generateTokenPair({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const tokenHash = crypto.createHash('sha256').update(tokens.accessToken).digest('hex');
    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + getRefreshTokenExpiresInSeconds() * 1000);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('user_sessions').insert({
        user_id: user.id,
        token_hash: tokenHash,
        refresh_token_hash: refreshHash,
        expires_at: expiresAt.toISOString(),
      });
      if (error) console.warn('[account/login] user_sessions insert failed:', error.message);
    } catch (e) {
      console.warn('[account/login] user_sessions insert error:', e instanceof Error ? e.message : e);
    }

    const { password_hash: _, ...userWithoutPassword } = user;

    res.json({
      code: 200,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        tokens,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/account/logout
 * 用户登出（需要认证），并删除当前会话记录
 */
router.post('/logout', authMiddleware, async (req, res) => {
  if (req.user?.userId && req.token) {
    const tokenHash = crypto.createHash('sha256').update(req.token).digest('hex');
    await getSupabaseClient().from('user_sessions').delete().eq('user_id', req.user.userId).eq('token_hash', tokenHash);
  }
  res.json({
    code: 200,
    message: 'Logout successful',
  });
});

/**
 * POST /api/v1/account/refresh-token
 * 刷新 Token
 */
router.post('/refresh-token', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        code: 400,
        message: 'Refresh token is required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 验证 Refresh Token
    const { verifyToken } = await import('../auth/jwt');
    const payload = verifyToken(refresh_token);

    if (payload.type !== 'refresh') {
      return res.status(401).json({
        code: 401,
        message: 'Invalid token type',
        error: 'UNAUTHORIZED',
      });
    }

    // 验证用户是否存在
    const user = await userRepo.findById(payload.userId);
    if (!user || user.status !== 'active') {
      return res.status(401).json({
        code: 401,
        message: 'User not found or inactive',
        error: 'UNAUTHORIZED',
      });
    }

    // 生成新的 Token 对（带上 role）
    const tokens = generateTokenPair({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    // 删除旧会话并用新 token 写入新会话，保持「已登录」状态与会话表一致
    const supabaseRefresh = getSupabaseClient();
    const oldRefreshHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    await supabaseRefresh.from('user_sessions').delete().eq('user_id', user.id).eq('refresh_token_hash', oldRefreshHash);
    const tokenHash = crypto.createHash('sha256').update(tokens.accessToken).digest('hex');
    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + getRefreshTokenExpiresInSeconds() * 1000);
    await supabaseRefresh.from('user_sessions').insert({
      user_id: user.id,
      token_hash: tokenHash,
      refresh_token_hash: refreshHash,
      expires_at: expiresAt.toISOString(),
    });

    res.json({
      code: 200,
      message: 'Token refreshed successfully',
      data: tokens,
    });
  } catch (error) {
    // 处理 verifyToken 抛出的认证错误
    if (error instanceof Error && (error.message === 'Invalid token' || error.message === 'Token expired')) {
      return res.status(401).json({
        code: 401,
        message: error.message,
        error: 'UNAUTHORIZED',
      });
    }
    next(error);
  }
});

/**
 * GET /api/v1/account/profile
 * 获取用户信息（需要认证）
 */
router.get('/profile', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await userRepo.findById(userId);

    if (!user) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        error: 'NOT_FOUND',
      });
    }

    // 返回用户信息（不包含密码）
    const { password_hash: _, ...userWithoutPassword } = user;

    // 可选：合并主钱包余额（mxmpay 不可用时不影响，不返回 primaryBalance）
    let primaryBalance: { assetCode: string; availableBalance: string } | undefined;
    try {
      const balance = await walletService.getPrimaryBalance(userId);
      if (balance) primaryBalance = balance;
    } catch {
      // 忽略
    }

    res.json({
      code: 200,
      data: {
        ...userWithoutPassword,
        ...(primaryBalance && { primaryBalance }),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/profile
 * 更新用户基础信息（需要认证）
 * 注意：用户只能修改 avatar_url，其他字段（username、email、phone）属于系统认证信息，不允许修改
 */
router.put('/profile', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { avatar_url } = req.body;

    // 只允许修改 avatar_url
    if (avatar_url === undefined) {
      return res.status(400).json({
        code: 400,
        message: 'avatar_url is required',
        error: 'VALIDATION_ERROR',
      });
    }

    const updateData: any = { avatar_url };

    const user = await userRepo.update(userId, updateData);

    // 返回用户信息（不包含密码）
    const { password_hash: _, ...userWithoutPassword } = user;

    res.json({
      code: 200,
      message: 'Profile updated successfully',
      data: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/password
 * 修改当前用户密码（需要认证）
 *
 * body:
 * - current_password: string
 * - new_password: string
 */
router.put('/password', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { current_password, new_password } = req.body as {
      current_password?: string;
      new_password?: string;
    };

    if (!current_password || !new_password) {
      return res.status(400).json({
        code: 400,
        message: 'current_password and new_password are required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (String(new_password).length < 8) {
      return res.status(400).json({
        code: 400,
        message: 'new_password must be at least 8 characters',
        error: 'VALIDATION_ERROR',
      });
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        error: 'NOT_FOUND',
      });
    }

    if (!user.password_hash) {
      return res.status(400).json({
        code: 400,
        message: '此账号使用第三方登录，请通过重置密码设置本地密码',
        error: 'OAUTH_ONLY',
      });
    }

    const isValid = await verifyPassword(current_password, user.password_hash);
    if (!isValid) {
      return res.status(400).json({
        code: 400,
        message: '当前密码不正确',
        error: 'INVALID_CURRENT_PASSWORD',
      });
    }

    const password_hash = await hashPassword(new_password);
    await userRepo.update(userId, { password_hash });

    // 安全起见：修改密码后清理该用户所有会话（强制重新登录）
    try {
      await getSupabaseClient().from('user_sessions').delete().eq('user_id', userId);
    } catch (e) {
      console.warn('[account/password] failed to clear user_sessions:', e instanceof Error ? e.message : e);
    }

    res.json({
      code: 200,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/updateAgents
 * 更新用户助手关联信息（需要认证）
 * 用于创建/更新助手时更新用户数据
 */
router.put('/updateAgents', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { agentIds, agentCount, lastAgentCreatedAt } = req.body;

    // 这里可以更新用户的助手相关元数据
    // 例如：在用户表的 metadata 字段中存储助手信息
    // 或者调用其他服务更新关联数据
    
    // 目前先返回成功，后续可以根据实际需求实现
    res.json({
      code: 200,
      message: 'Agents updated successfully',
      data: {
        userId,
        agentIds: agentIds || [],
        agentCount: agentCount || 0,
        lastAgentCreatedAt: lastAgentCreatedAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/updateMedia
 * 更新用户媒体资源关联信息（需要认证）
 * 用于创建/更新媒体资源时更新用户数据
 *
 * 请求体示例：
 * [
 *   {
 *     "type": "photo",              // 来自前端的多媒体类型，如 photo / video / music / illustration / text / voice
 *     "assets_type": "image/jpeg",  // 生成文件类型，如 image/jpeg, audio/mpeg, video/mp4 等
 *     "label": "封面图",             // 业务上的名称
 *     "url": "media/photo/xxx.jpg", // MinIO 中的存储路径或完整 URL
 *     "id": "task_123",             // 生成任务的 ID
 *     "description": "海边黄昏",     // 可选描述
 *     "prompts_meta": "{\"prompt\":\"海边黄昏\",\"seed\":42}" // 生成时的参数，JSON 字符串
 *   }
 * ]
 */
router.put('/updateMedia', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const items = req.body as MediaItemInput[];

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        code: 400,
        message: 'Body must be a non-empty array',
        error: 'VALIDATION_ERROR',
      });
    }

    // 基础字段校验（避免前端误传空值）
    const invalidItem = items.find(
      (item) =>
        !item ||
        !item.type ||
        !item.assets_type ||
        !item.label ||
        !item.url ||
        !item.id
    );

    if (invalidItem) {
      return res.status(400).json({
        code: 400,
        message: 'Each item must include type, assets_type, label, url and id',
        error: 'VALIDATION_ERROR',
      });
    }

    // 持久化到 user_media 表
    const inserted = await mediaService.addUserMedia(userId, items);

    res.json({
      code: 200,
      message: 'Media updated successfully',
      data: {
        userId,
        mediaCount: inserted,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/account/media
 * 获取当前用户的媒体资源列表（只读，占位实现）
 */
router.get('/media', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { type, page = '1', limit = '20' } = req.query as {
      type?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    const result = await mediaService.listUserMedia(userId, {
      type,
      page: pageNum,
      limit: limitNum,
    });

    res.json({
      code: 200,
      message: 'Media list fetched successfully',
      data: {
        userId,
        type: type || null,
        items: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/account/agents
 * 获取当前用户的助手列表（只读，占位实现）
 */
router.get('/agents', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { page = '1', limit = '20' } = req.query as {
      page?: string;
      limit?: string;
    };

    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    // 目前助手数据尚未落库，这里返回占位结构，后续由 mxmcgi / mxmdata 接入
    res.json({
      code: 200,
      message: 'Agent list fetched successfully',
      data: {
        userId,
        items: [] as any[],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/account/settings
 * 获取用户设置（需要认证）
 */
router.get('/settings', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    let settings = await userRepo.getSettings(userId);

    // 如果设置不存在，创建默认设置
    if (!settings) {
      settings = await userRepo.updateSettings(userId, {});
    }

    res.json({
      code: 200,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/settings
 * 更新用户设置（需要认证）
 */
router.put('/settings', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { theme, language, notifications_enabled } = req.body;

    const updateData: Record<string, unknown> = {};
    if (theme !== undefined) updateData.theme = theme;
    if (language !== undefined) {
      if (!isAppLocale(language)) {
        return res.status(400).json({
          code: 400,
          message: 'Invalid language; expected zh | zh-TW | en | ja',
        });
      }
      updateData.language = language;
    }
    if (notifications_enabled !== undefined) updateData.notifications_enabled = notifications_enabled;

    const settings = await userRepo.updateSettings(userId, updateData);

    res.json({
      code: 200,
      message: 'Settings updated successfully',
      data: settings,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/account/membership
 * 获取会员信息（需要认证）
 */
router.get('/membership', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const user = await userRepo.findById(userId);

    if (!user) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        error: 'NOT_FOUND',
      });
    }

    res.json({
      code: 200,
      data: {
        membership_type: user.membership_type,
        membership_expires_at: user.membership_expires_at,
        level: user.level,
      },
    });
  } catch (error) {
    next(error);
  }
});

const MAX_PERSONAL_API_KEYS = 10;
const MAX_INTEGRATION_API_KEYS = 10;
const API_KEY_PREFIX = 'mxm_';
const API_KEY_RANDOM_LENGTH = 32;

function parseKeyType(raw: unknown): 'personal' | 'integration' | null {
  const v = String(raw ?? '').trim();
  if (v === 'personal' || v === 'integration') return v;
  return null;
}

/** 允许的过期天数；0 / null / never 表示永不过期 */
const ALLOWED_API_KEY_EXPIRY_DAYS = [7, 30, 90, 180, 365] as const;

function parseExpiresInDays(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined || raw === '' || raw === 'never' || raw === false) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) return undefined;
  if (n === 0) return null;
  if (!(ALLOWED_API_KEY_EXPIRY_DAYS as readonly number[]).includes(n)) return undefined;
  return n;
}

function computeExpiresAt(expiresInDays: number | null): Date | null {
  if (expiresInDays == null) return null;
  return new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
}

/**
 * POST /api/v1/account/api-keys
 * 创建 API 密钥（需要认证）。明文 key 仅在本次响应中返回一次。
 */
router.post('/api-keys', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name, keyType: rawKeyType, expiresInDays: rawExpiresInDays } = req.body || {};
    const keyType = parseKeyType(rawKeyType);
    if (!keyType) {
      return res.status(400).json({
        code: 400,
        message: 'keyType 必填，须为 personal（个人自动化）或 integration（开放 API 客户端）',
        error: 'VALIDATION_ERROR',
      });
    }

    let expiresInDays: number | null = null;
    if (rawExpiresInDays !== undefined) {
      const parsed = parseExpiresInDays(rawExpiresInDays);
      if (parsed === undefined) {
        return res.status(400).json({
          code: 400,
          message: `expiresInDays 无效，可选：${ALLOWED_API_KEY_EXPIRY_DAYS.join('、')} 或 0（永不过期）`,
          error: 'VALIDATION_ERROR',
        });
      }
      expiresInDays = parsed;
    }

    const expiresAt = computeExpiresAt(expiresInDays);

    const counts = await userApiKeyRepo.countByUserIdAndType(userId);
    const max = keyType === 'integration' ? MAX_INTEGRATION_API_KEYS : MAX_PERSONAL_API_KEYS;
    const current = keyType === 'integration' ? counts.integration : counts.personal;
    if (current >= max) {
      return res.status(400).json({
        code: 400,
        message: `该类型密钥最多 ${max} 个（当前 ${current}）`,
        error: 'LIMIT_EXCEEDED',
      });
    }

    const rawKey = API_KEY_PREFIX + crypto.randomBytes(24).toString('base64url').slice(0, API_KEY_RANDOM_LENGTH);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, API_KEY_PREFIX.length + 8);

    const record = await userApiKeyRepo.create({
      userId,
      keyHash,
      keyPrefix,
      keyType,
      name: name != null ? String(name).trim() || null : null,
      expiresAt,
    });

    const typeHint =
      keyType === 'integration'
        ? '仅可调用 /api/v1/open/{slug} 已发布接口'
        : '可用于 Cursor、OpenClaw 等平台能力与开放 API';

    res.status(201).json({
      code: 201,
      message: `API 密钥已创建（${keyType === 'integration' ? '开放 API 客户端' : '个人访问凭证'}），请妥善保存，关闭后无法再次查看`,
      data: {
        id: record.id,
        name: record.name,
        key_type: record.key_type,
        key_prefix: record.key_prefix,
        created_at: record.created_at,
        expires_at: record.expires_at,
        key: rawKey,
        usage_hint: typeHint,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/account/api-keys
 * 列出当前用户的 API 密钥（不包含明文）。表未创建或查询失败时返回空数组，不报 500。
 */
router.get('/api-keys', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const list = await userApiKeyRepo.listByUserId(userId);
    res.json({
      code: 200,
      data: list,
    });
  } catch (error) {
    // 表未迁移或 schema 未刷新时返回空数组，避免前端报错
    console.warn('[account/api-keys] listByUserId failed, returning []:', error instanceof Error ? error.message : error);
    res.json({ code: 200, data: [] });
  }
});

/**
 * DELETE /api/v1/account/api-keys/:id
 * 撤销指定 API 密钥（需归属当前用户）
 */
router.delete('/api-keys/:id', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const deleted = await userApiKeyRepo.delete(id, userId);
    if (!deleted) {
      return res.status(404).json({
        code: 404,
        message: 'API 密钥不存在或已撤销',
        error: 'NOT_FOUND',
      });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/admin/user_profile
 * 管理员：更新用户信息（可修改所有参数）
 */
router.put('/admin/user_profile', adminMiddleware, async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        code: 400,
        message: 'userId is required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 管理员可以修改所有字段
    const {
      username,
      email,
      phone,
      avatar_url,
      level,
      balance,
      membership_type,
      membership_expires_at,
      status,
      role,
    } = req.body;

    const updateData: any = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (level !== undefined) updateData.level = level;
    if (balance !== undefined) updateData.balance = balance;
    if (membership_type !== undefined) updateData.membership_type = membership_type;
    if (membership_expires_at !== undefined) updateData.membership_expires_at = membership_expires_at;
    if (status !== undefined) updateData.status = status;
    if (role !== undefined) updateData.role = role;

    // 检查是否有要更新的字段
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        code: 400,
        message: 'At least one field is required to update',
        error: 'VALIDATION_ERROR',
      });
    }

    const user = await userRepo.update(userId, updateData);

    // 返回用户信息（不包含密码）
    const { password_hash: _, ...userWithoutPassword } = user;

    res.json({
      code: 200,
      message: 'User profile updated successfully',
      data: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/account/admin/users
 * 管理员：创建用户（免验证码；可选角色）
 */
router.post('/admin/users', adminMiddleware, async (req, res, next) => {
  try {
    const { username, email, phone, password, role, membership_type } = req.body as {
      username?: string;
      email?: string;
      phone?: string;
      password?: string;
      role?: 'user' | 'admin';
      membership_type?: 'free' | 'pro' | 'premium';
    };

    if (!username?.trim() || !password) {
      return res.status(400).json({
        code: 400,
        message: 'Username and password are required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (!email?.trim() && !phone?.trim()) {
      return res.status(400).json({
        code: 400,
        message: 'Email or phone is required',
        error: 'VALIDATION_ERROR',
      });
    }

    if (role != null && role !== 'user' && role !== 'admin') {
      return res.status(400).json({
        code: 400,
        message: 'role must be user or admin',
        error: 'VALIDATION_ERROR',
      });
    }

    if (
      membership_type != null &&
      !['free', 'pro', 'premium'].includes(membership_type)
    ) {
      return res.status(400).json({
        code: 400,
        message: 'membership_type must be free, pro, or premium',
        error: 'VALIDATION_ERROR',
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        code: 400,
        message: 'Password must be at least 6 characters',
        error: 'VALIDATION_ERROR',
      });
    }

    const password_hash = await hashPassword(password);

    try {
      // 入库前统一 lowercase + trim，与登录端 line 215-216 保持一致
      const trimmedEmail = email?.trim().toLowerCase() || undefined;
      const nowIso = new Date().toISOString();
      const user = await userRepo.create({
        username: username.trim(),
        email: trimmedEmail,
        phone: phone?.trim() || undefined,
        password_hash,
        role: role ?? 'user',
        membership_type: membership_type ?? 'free',
        status: 'active',
        // 后台创建账号一律视为已验证邮箱，避免迭代期无法登录
        // 无论是否提供 email（admin 主动创建的用户不应卡 EMAIL_NOT_VERIFIED）
        email_verified_at: nowIso,
      });

      const folderInfo = await folderService.createDefaultFolders(user.id);
      if (folderInfo) {
        console.log(`[Admin] 用户 ${user.id} 默认文件夹创建成功`);
      }

      const { password_hash: _, ...userWithoutPassword } = user;

      res.status(201).json({
        code: 201,
        message: 'User created successfully',
        data: userWithoutPassword,
      });
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (error instanceof DuplicateError || err?.code === 'DUPLICATE') {
        return res.status(409).json({
          code: 409,
          message: err?.message || 'User already exists',
          error: 'DUPLICATE',
        });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/account/admin/users
 * 管理员：查看用户列表（包含登录状态）
 */
router.get('/admin/users', adminMiddleware, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as 'active' | 'suspended' | 'banned' | undefined;
    const role = req.query.role as 'user' | 'admin' | undefined;
    const search = req.query.search as string | undefined;

    // 查询用户列表
    const result = await userRepo.findAll({
      page,
      limit,
      filters: {
        status,
        role,
        search,
      },
    });

    // 查询所有用户的登录状态（检查是否有未过期的会话）
    const supabase = getSupabaseClient();
    const userIds = result.users.map((u) => u.id);

    // 查询所有未过期的会话
    const { data: activeSessions } = await supabase
      .from('user_sessions')
      .select('user_id')
      .in('user_id', userIds)
      .gt('expires_at', new Date().toISOString());

    // 构建用户ID到登录状态的映射
    const loggedInUserIds = new Set(
      (activeSessions || []).map((s: { user_id: string }) => s.user_id)
    );

    // 组合用户信息和登录状态
    const usersWithStatus = result.users.map((user) => {
      const { password_hash, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        isLoggedIn: loggedInUserIds.has(user.id),
      };
    });

    res.json({
      code: 200,
      data: {
        users: usersWithStatus,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/account/admin/users/:id/status
 * 管理员：封禁/解封用户
 */
router.put('/admin/users/:id/status', adminMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const actorId = (req as { user?: { userId?: string } }).user?.userId;

    if (!status || !['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({
        code: 400,
        message: 'status must be one of: active, suspended, banned',
        error: 'VALIDATION_ERROR',
      });
    }

    if (actorId && actorId === id && status !== 'active') {
      return res.status(400).json({
        code: 400,
        message: 'Cannot disable your own account',
        error: 'VALIDATION_ERROR',
      });
    }

    const existing = await userRepo.findById(id);
    if (!existing) {
      return res.status(404).json({
        code: 404,
        message: 'User not found',
        error: 'NOT_FOUND',
      });
    }

    if (existing.role === 'admin' && status !== 'active') {
      return res.status(403).json({
        code: 403,
        message: 'Cannot disable admin accounts',
        error: 'FORBIDDEN',
      });
    }

    const user = await userRepo.update(id, { status });

    // 禁用时强制登出，避免会话继续可用
    if (status === 'suspended' || status === 'banned') {
      const supabase = getSupabaseClient();
      await supabase.from('user_sessions').delete().eq('user_id', id);
    }

    const { password_hash: _, ...userWithoutPassword } = user;

    res.json({
      code: 200,
      message: 'User status updated successfully',
      data: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/account/admin/users/:id/force-logout
 * 管理员：强制登出用户，删除该用户所有会话
 */
router.post('/admin/users/:id/force-logout', adminMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('user_sessions').delete().eq('user_id', id);

    if (error) {
      return res.status(500).json({
        code: 500,
        message: 'Failed to force logout',
        error: error.message,
      });
    }

    res.json({
      code: 200,
      message: 'User logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

