import { FormEvent, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { login } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

type LocationState = {
  from?: { pathname?: string };
};

export function LoginPage() {
  const { isLoggedIn, setAuth } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoggedIn) {
    return <Navigate to={state.from?.pathname ?? '/'} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await login(username.trim(), password);
    setSubmitting(false);

    if ('error' in result && result.error) {
      setError(result.error);
      return;
    }

    if ('ok' in result && result.ok) {
      setAuth(result.accessToken, result.user ?? null);
      navigate(state.from?.pathname ?? '/', { replace: true });
    } else {
      setError('登录失败，请稍后重试');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-mark">MX</div>
          <div className="login-header-text">
            <h1>{t('login.title')}</h1>
            <p>{t('dashboard.subtitle')}</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>{t('login.username')}</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('login.username')}
            />
          </label>

          <label className="login-field">
            <span>{t('login.password')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.password')}
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? t('login.submit') + '...' : t('login.submit')}
          </button>
        </form>

        <div className="login-footer">
          <p>开发环境中，请确保 Gateway 运行在 http://localhost:3000。</p>
        </div>
      </div>
    </div>
  );
}

