import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setBaseUrl } from '../api/client';
import { CaptchaVerifyModal } from '../components/CaptchaVerifyModal';
import { useAuth } from '../context/AuthContext';
import { useLoginWithCaptcha } from '../hooks/useLoginWithCaptcha';

export default function Login() {
  const { t } = useTranslation();
  const { setToken, isLoggedIn, logout } = useAuth();
  const [baseUrl, setBaseUrlState] = useState(localStorage.getItem('api_base_url') ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const { captchaOpen, loading, submitCredentials, handleCaptchaVerified, closeCaptcha } =
    useLoginWithCaptcha({
      onSuccess: (res) => {
        setToken(res.accessToken);
        setMessage(t('auth.loginSuccess'));
      },
      onError: (err) => setMessage(t('auth.loginFailed') + err),
    });

  const handleSaveBaseUrl = () => {
    setBaseUrl(baseUrl);
    setMessage(t('auth.baseUrlSaved'));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    await submitCredentials(username, password);
  };

  if (isLoggedIn) {
    return (
      <section className="page-card login-page-card">
        <h2>{t('auth.loggedIn')}</h2>
        <p>{t('auth.loggedInDebug')}</p>
        <button type="button" onClick={logout}>
          {t('auth.logoutLogin')}
        </button>
      </section>
    );
  }

  return (
    <>
      <section className="page-card login-page-card">
        <style>{`
        .login-page-card {
          min-width: unset !important;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          height: auto;
          min-height: 80vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        @media (max-width: 640px) {
          .login-page-card {
            border-radius: 12px;
            padding: 1.25rem;
            min-height: auto;
            height: auto;
            max-width: 100%;
          }
          .login-page-card .form-group input,
          .login-page-card .form-group button {
            width: 100%;
          }
          .login-page-card .form-group input {
            font-size: 16px;
          }
          .login-page-card .url-input-row {
            flex-direction: column;
          }
          .login-page-card .url-input-row button {
            width: 100%;
            margin-top: 8px;
          }
        }
      `}</style>
        <h2>{t('auth.loginConfigTitle')}</h2>
        <div className="form-group">
          <label>{t('auth.apiBaseUrlLabel')}</label>
          <div className="url-input-row" style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrlState(e.target.value)}
              placeholder={t('auth.apiBaseUrlPlaceholder')}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={handleSaveBaseUrl}>
              {t('common.save')}
            </button>
          </div>
        </div>
        <form onSubmit={handleLogin} className="form-group">
          <label>{t('auth.usernameLabel')}</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <label>{t('auth.passwordLabel')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? t('auth.loggingIn') : t('auth.loginButton')}
          </button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>

      <CaptchaVerifyModal
        open={captchaOpen}
        onClose={closeCaptcha}
        onVerified={handleCaptchaVerified}
      />
    </>
  );
}
