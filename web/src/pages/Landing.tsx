import { useState } from 'react';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { login } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Landing() {
  const { setToken } = useAuth();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const res = await login(username, password);
    setLoading(false);
    if (res.error) {
      setMessage(t('landing.loginFailed') + res.error);
      return;
    }
    if ('ok' in res && res.ok && res.accessToken) {
      setToken(res.accessToken, res.user ?? null);
      setMessage(t('landing.loginSuccess'));
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <div className="landing-hero-left">
          <div className="landing-kicker">
            <Sparkles size={16} />
            <span>{t('landing.kicker')}</span>
          </div>
          <h1 className="landing-title">{t('landing.title')}</h1>
          <p className="landing-subtitle">{t('landing.subtitle')}</p>
          <ul className="landing-bullets">
            <li>
              <ArrowRight size={14} /> {t('landing.bullet1')}
            </li>
            <li>
              <ArrowRight size={14} /> {t('landing.bullet2')}
            </li>
            <li>
              <ArrowRight size={14} /> {t('landing.bullet3')}
            </li>
          </ul>
          <div className="landing-footnote">
            <ShieldCheck size={14} />
            <span>{t('landing.footnote')}</span>
          </div>
        </div>
        <div className="landing-login">
          <h2>{t('landing.loginTitle')}</h2>
          <p className="landing-login-subtitle">{t('landing.loginSubtitle')}</p>
          <form onSubmit={handleLogin} className="form-group">
            <label>{t('landing.usernameLabel')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder={t('landing.usernamePlaceholder')}
            />
            <label>{t('landing.passwordLabel')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t('landing.passwordPlaceholder')}
            />
            <button type="submit" disabled={loading}>
              {loading ? t('landing.loggingIn') : t('landing.loginButton')}
            </button>
          </form>
          {message && <p className="message landing-login-message">{message}</p>}
        </div>
      </div>
    </div>
  );
}

