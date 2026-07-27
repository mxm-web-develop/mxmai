/**
 * Google / GitHub OAuth 授权码流程
 */

export type OAuthProvider = 'google' | 'github';

export type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  usernameHint: string | null;
  avatarUrl: string | null;
  raw: Record<string, unknown>;
};

export function isOAuthProvider(v: string): v is OAuthProvider {
  return v === 'google' || v === 'github';
}

export function getOAuthRedirectBase(): string {
  return (process.env.OAUTH_REDIRECT_BASE || process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
}

export function getOAuthCallbackUrl(provider: OAuthProvider): string {
  return `${getOAuthRedirectBase()}/api/v1/account/oauth/${provider}/callback`;
}

export function getAppPublicUrl(): string {
  return (process.env.APP_PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  if (provider === 'google') {
    return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
  }
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID?.trim() && process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim());
}

export function buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
  const redirectUri = getOAuthCallbackUrl(provider);
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  const redirectUri = getOAuthCallbackUrl('google');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${t}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error('Google token missing access_token');

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!profileRes.ok) {
    const t = await profileRes.text();
    throw new Error(`Google userinfo failed: ${t}`);
  }
  const profile = (await profileRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!profile.sub) throw new Error('Google profile missing sub');
  return {
    provider: 'google',
    providerUserId: profile.sub,
    email: profile.email?.toLowerCase() || null,
    usernameHint: profile.name || profile.email?.split('@')[0] || null,
    avatarUrl: profile.picture || null,
    raw: profile as Record<string, unknown>,
  };
}

async function exchangeGithubCode(code: string): Promise<OAuthProfile> {
  const redirectUri = getOAuthCallbackUrl('github');
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    throw new Error(`GitHub token exchange failed: ${t}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenJson.access_token) {
    throw new Error(`GitHub token missing access_token: ${tokenJson.error || 'unknown'}`);
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'MXM-AI',
    },
  });
  if (!userRes.ok) {
    const t = await userRes.text();
    throw new Error(`GitHub user failed: ${t}`);
  }
  const user = (await userRes.json()) as {
    id?: number;
    login?: string;
    email?: string | null;
    avatar_url?: string;
  };

  let email = user.email?.toLowerCase() || null;
  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'MXM-AI',
      },
    });
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as Array<{
        email?: string;
        primary?: boolean;
        verified?: boolean;
      }>;
      const primary =
        emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
      email = primary?.email?.toLowerCase() || null;
    }
  }

  if (user.id == null) throw new Error('GitHub profile missing id');
  return {
    provider: 'github',
    providerUserId: String(user.id),
    email,
    usernameHint: user.login || email?.split('@')[0] || null,
    avatarUrl: user.avatar_url || null,
    raw: user as Record<string, unknown>,
  };
}

export async function exchangeOAuthCode(provider: OAuthProvider, code: string): Promise<OAuthProfile> {
  if (provider === 'google') return exchangeGoogleCode(code);
  return exchangeGithubCode(code);
}
