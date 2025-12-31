/**
 * 账户相关路由
 */

import '../config/loadEnv';
import { Router } from 'express';
import { RepositoryFactory } from '@mxmai/mxmdata';
import { hashPassword, verifyPassword } from '../auth/password';
import { generateTokenPair } from '../auth/jwt';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/admin.middleware';
import { captchaMiddleware } from '../middleware/captcha.middleware';
import { DuplicateError, NotFoundError } from '@mxmai/mxmdata';
import { WalletService } from '../services/wallet.service';
import { CaptchaService } from '../services/captcha.service';
import { getSupabaseClient } from '@mxmai/mxmdata';
import { MediaService, type MediaItemInput } from '../services/media.service';

const router = Router();
const userRepo = RepositoryFactory.createUserRepository();
const walletService = new WalletService();
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
 * 用户注册（验证码由 captchaMiddleware 控制，可通过 CAPTCHA_ENABLE 环境变量禁用）
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

      // 自动创建默认钱包（CNY）
      // 钱包创建失败不影响用户注册流程
      const walletInfo = await walletService.createDefaultWallet(user.id);
      if (walletInfo) {
        console.log(`✅ 用户 ${user.id} 钱包创建成功:`, walletInfo);
      } else {
        console.warn(`⚠️ 用户 ${user.id} 钱包创建失败或服务不可用`);
      }

      // 生成 Token
      const tokens = generateTokenPair({
        userId: user.id,
        username: user.username,
      });

      // 返回用户信息（不包含密码）
      const { password_hash: _, ...userWithoutPassword } = user;

      res.status(201).json({
        code: 201,
        message: 'User registered successfully',
        data: {
          user: userWithoutPassword,
          tokens,
          wallet: walletInfo, // 返回钱包信息
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
 * 用户登录（验证码由 captchaMiddleware 控制，可通过 CAPTCHA_ENABLE 环境变量禁用）
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

    // 生成 Token
    const tokens = generateTokenPair({
      userId: user.id,
      username: user.username,
    });

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
 * 用户登出（需要认证）
 */
router.post('/logout', authMiddleware, async (req, res) => {
  // TODO: 实现 Token 黑名单或从会话表中删除
  // 目前只是返回成功，实际的 Token 失效需要客户端删除
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

    // 生成新的 Token 对
    const tokens = generateTokenPair({
      userId: user.id,
      username: user.username,
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

    res.json({
      code: 200,
      data: userWithoutPassword,
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

export default router;

