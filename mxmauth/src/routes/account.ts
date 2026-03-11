/**
 * 账户相关路由
 */

import '../config/loadEnv';
import crypto from 'crypto';
import { Router } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
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

const router = Router();
const userRepo = RepositoryFactory.createUserRepository();
const userApiKeyRepo = RepositoryFactory.createUserApiKeyRepository();
const walletService = new WalletService();
const folderService = new FolderService();
const captchaService = new CaptchaService();
const mediaService = new MediaService();

/**
 * GET /api/v1/account/captcha
 * 获取验证码
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
 * POST /api/v1/account/register
 * 用户注册（验证码默认禁用，正式上线前可通过设置 CAPTCHA_ENABLE=true 启用）
 */
router.post('/register', captchaMiddleware, async (req, res, next) => {
  try {
    const { username, email, phone, password } = req.body;

    // 验证必填字段
    if (!username || !password) {
      return res.status(400).json({
        code: 400,
        message: 'Username and password are required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 验证至少有一个联系方式
    if (!email && !phone) {
      return res.status(400).json({
        code: 400,
        message: 'Email or phone is required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 加密密码
    const password_hash = await hashPassword(password);

    // 创建用户
    try {
      const user = await userRepo.create({
        username,
        email,
        phone,
        password_hash,
      });

      // 钱包改为懒加载：用户首次访问 /wallets 时由 mxmpay 自动创建

      // 自动创建默认文件夹
      // 文件夹创建失败不影响用户注册流程
      const folderInfo = await folderService.createDefaultFolder(user.id);
      if (folderInfo) {
        console.log(`✅ 用户 ${user.id} 默认文件夹创建成功:`, folderInfo);
      } else {
        console.warn(`⚠️ 用户 ${user.id} 默认文件夹创建失败或服务不可用`);
      }

      // 生成 Token（写入 role 供 gateway 转发，避免下游每次查库校验 admin）
      const tokens = generateTokenPair({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      // 返回用户信息（不包含密码）
      const { password_hash: _, ...userWithoutPassword } = user;

      res.status(201).json({
        code: 201,
        message: 'User registered successfully',
        data: {
          user: userWithoutPassword,
          tokens,
        },
      });
    } catch (error) {
      if (error instanceof DuplicateError) {
        return res.status(409).json({
          code: 409,
          message: error.message,
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
    const { username, email, phone, password } = req.body;

    // 验证必填字段
    if (!password) {
      return res.status(400).json({
        code: 400,
        message: 'Password is required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 验证至少有一个登录标识
    if (!username && !email && !phone) {
      return res.status(400).json({
        code: 400,
        message: 'Username, email, or phone is required',
        error: 'VALIDATION_ERROR',
      });
    }

    // 查找用户
    let user = null;
    if (username) {
      user = await userRepo.findByUsername(username);
    } else if (email) {
      user = await userRepo.findByEmail(email);
    } else if (phone) {
      // 通过手机号查找：先尝试通过邮箱查找（兼容性处理）
      // 如果邮箱查找失败，再通过用户名查找
      // 注意：理想情况下应该在 IUserRepository 中添加 findByPhone 方法
      // 这里使用临时方案：通过邮箱字段查找（如果 phone 存储在 email 字段）
      user = await userRepo.findByEmail(phone);
      // 如果通过邮箱找不到，尝试通过用户名查找（某些系统可能将手机号作为用户名）
      if (!user) {
        user = await userRepo.findByUsername(phone);
      }
    }

    if (!user) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid credentials',
        error: 'UNAUTHORIZED',
      });
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        code: 401,
        message: 'Invalid credentials',
        error: 'UNAUTHORIZED',
      });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(403).json({
        code: 403,
        message: `Account is ${user.status}`,
        error: 'FORBIDDEN',
      });
    }

    // 生成 Token（写入 role 供 gateway 转发，避免下游每次查库校验 admin）
    const tokens = generateTokenPair({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    // 写入 user_sessions，供管理员「已登录」状态查询（失败不影响登录成功）
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

    // 返回用户信息（不包含密码）
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

    // 目前助手数据尚未落库，这里返回占位结构，后续由 mxmagent / mxmdata 接入
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

    const updateData: any = {};
    if (theme !== undefined) updateData.theme = theme;
    if (language !== undefined) updateData.language = language;
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

const MAX_API_KEYS_PER_USER = 10;
const API_KEY_PREFIX = 'mxm_';
const API_KEY_RANDOM_LENGTH = 32;

/**
 * POST /api/v1/account/api-keys
 * 创建 API 密钥（需要认证）。明文 key 仅在本次响应中返回一次。
 */
router.post('/api-keys', gatewayOrJwtAuth, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { name } = req.body || {};

    const list = await userApiKeyRepo.listByUserId(userId);
    if (list.length >= MAX_API_KEYS_PER_USER) {
      return res.status(400).json({
        code: 400,
        message: `最多允许创建 ${MAX_API_KEYS_PER_USER} 个 API 密钥`,
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
      name: name != null ? String(name).trim() || null : null,
    });

    res.status(201).json({
      code: 201,
      message: 'API 密钥已创建，请妥善保存，关闭后无法再次查看',
      data: {
        id: record.id,
        name: record.name,
        key_prefix: record.key_prefix,
        created_at: record.created_at,
        key: rawKey,
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

    if (!status || !['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({
        code: 400,
        message: 'status must be one of: active, suspended, banned',
        error: 'VALIDATION_ERROR',
      });
    }

    const user = await userRepo.update(id, { status });

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

