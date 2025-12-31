/**
 * JWT Token 生成和验证
 */

import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  username: string;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// 在运行时读取环境变量，而不是在模块加载时
function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'your-secret-key-change-in-production';
}

function getAccessTokenExpiresIn(): number {
  return Number(process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || 57600); // 默认16小时 (16 * 3600 = 57600秒)
}

function getRefreshTokenExpiresIn(): number {
  return Number(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || 604800); // 默认7天
}

/**
 * 生成 Access Token
 */
export function generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign(
    {
      ...payload,
      type: 'access',
    },
    getJwtSecret(),
    {
      expiresIn: getAccessTokenExpiresIn(),
    }
  );
}

/**
 * 生成 Refresh Token
 */
export function generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign(
    {
      ...payload,
      type: 'refresh',
    },
    getJwtSecret(),
    {
      expiresIn: getRefreshTokenExpiresIn(),
    }
  );
}

/**
 * 生成 Token 对
 */
export function generateTokenPair(payload: Omit<TokenPayload, 'type'>): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: getAccessTokenExpiresIn(),
  };
}

/**
 * 验证 Token
 */
export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    return decoded;
  } catch (error: any) {
    // TokenExpiredError 是 JsonWebTokenError 的子类，所以需要先检查 name
    if (error?.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw new Error('Token verification failed');
  }
}

/**
 * 从请求头提取 Token
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

