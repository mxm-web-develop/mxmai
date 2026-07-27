import { useCallback, useEffect, useRef, useState } from 'react';
import { Github, Mail, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { CaptchaVerifyModal } from '../../components/CaptchaVerifyModal';
import { useAuth } from '../../context/AuthContext';
import { useLoginWithCaptcha } from '../../hooks/useLoginWithCaptcha';
import {
  forgotPassword,
  getAuthProviders,
  getOAuthStartUrl,
  registerAccount,
  resendVerification,
  resetPassword,
  verifyMfaLogin,
  type AuthProviders,
} from '../../api/client';
import { MfaCodeInput } from '../../components/account/MfaCodeInput';
import { animateCardEnter } from '../../lib/motion/gsapPresets';

gsap.registerPlugin(useGSAP);

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'verifySent' | 'mfa';

interface LandingLoginModalProps {
  open: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  resetToken?: string | null;
}

function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.9 2.4 2.7 6.6 2.7 11.7S6.9 21 12 21c6.1 0 8.1-4.3 8.1-6.5 0-.4 0-.8-.1-1.1H12z"
      />
    </svg>
  );
}

export function LandingLoginModal({
  open,
  onClose,
  initialMode = 'login',
  resetToken = null,
}: LandingLoginModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { setToken } = useAuth();
  const { t } = useTranslation();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'ok'>('error');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [activeResetToken, setActiveResetToken] = useState<string | null>(resetToken);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(resetToken ? 'reset' : initialMode);
    setActiveResetToken(resetToken);
    setMessage('');
    setPassword('');
    setPassword2('');
    setLoginIdentifier('');
    setMfaToken('');
    setMfaCode('');
  }, [open, initialMode, resetToken]);

  useEffect(() => {
    if (!open) return;
    void getAuthProviders().then((res) => {
      if ('error' in res) {
        setProviders({ google: false, github: false, smtp: false });
        return;
      }
      setProviders(res);
    });
  }, [open]);

  const handleLoginSuccess = useCallback(
    (res: { accessToken: string; user?: unknown }) => {
      setToken(res.accessToken, (res.user as Parameters<typeof setToken>[1]) ?? null);
      onClose();
    },
    [onClose, setToken]
  );

  const {
    captchaOpen,
    loading: loginLoading,
    submitCredentials,
    handleCaptchaVerified,
    closeCaptcha,
  } = useLoginWithCaptcha({
    onSuccess: handleLoginSuccess,
    onMfaRequired: ({ mfaToken: token }) => {
      setMessage('');
      setMfaToken(token);
      setMfaCode('');
      setMode('mfa');
    },
    onError: (err) => {
      setMessageTone('error');
      if (err.includes('verify') || err.includes('验证')) {
        setMessage(t('landing.emailNotVerified'));
        return;
      }
      setMessage(t('landing.loginFailed') + err);
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useGSAP(
    () => {
      if (!open || !panelRef.current) return;
      animateCardEnter(panelRef.current);
    },
    { dependencies: [open, mode], scope: panelRef }
  );

  const handleClose = () => onClose();

  const showMsg = (text: string, tone: 'error' | 'ok' = 'error') => {
    setMessageTone(tone);
    setMessage(text);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    await submitCredentials(loginIdentifier.trim(), password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (password.length < 8) {
      showMsg(t('landing.passwordTooShort'));
      return;
    }
    if (password !== password2) {
      showMsg(t('landing.passwordMismatch'));
      return;
    }
    setBusy(true);
    const res = await registerAccount(email, password);
    setBusy(false);
    if ('error' in res && res.error) {
      showMsg(t('landing.registerFailed') + res.error);
      return;
    }
    setMode('verifySent');
    showMsg(t('landing.verifySentHint'), 'ok');
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setBusy(true);
    const res = await forgotPassword(email);
    setBusy(false);
    if ('error' in res && res.error) {
      showMsg(t('landing.forgotFailed') + res.error);
      return;
    }
    showMsg(t('landing.forgotSent'), 'ok');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (!activeResetToken) {
      showMsg(t('landing.resetTokenMissing'));
      return;
    }
    if (password.length < 8) {
      showMsg(t('landing.passwordTooShort'));
      return;
    }
    if (password !== password2) {
      showMsg(t('landing.passwordMismatch'));
      return;
    }
    setBusy(true);
    const res = await resetPassword(activeResetToken, password);
    setBusy(false);
    if ('error' in res && res.error) {
      showMsg(t('landing.resetFailed') + res.error);
      return;
    }
    showMsg(t('landing.resetSuccess'), 'ok');
    setMode('login');
    setPassword('');
    setPassword2('');
  };

  const handleResend = async () => {
    setBusy(true);
    const res = await resendVerification(email);
    setBusy(false);
    if ('error' in res && res.error) {
      showMsg(t('landing.resendFailed') + res.error);
      return;
    }
    showMsg(t('landing.resendOk'), 'ok');
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken || mfaCode.length !== 6) {
      showMsg(t('landing.mfaCodeRequired'));
      return;
    }
    setMessage('');
    setMfaSubmitting(true);
    const res = await verifyMfaLogin(mfaToken, mfaCode);
    setMfaSubmitting(false);
    if ('error' in res && res.error) {
      showMsg(t('landing.mfaFailed') + res.error);
      return;
    }
    if ('ok' in res && res.ok && res.accessToken) {
      handleLoginSuccess({ accessToken: res.accessToken, user: res.user });
    }
  };

  const title =
    mode === 'mfa'
      ? t('landing.mfaTitle')
      : mode === 'register'
      ? t('landing.registerTitle')
      : mode === 'forgot'
        ? t('landing.forgotTitle')
        : mode === 'reset'
          ? t('landing.resetTitle')
          : mode === 'verifySent'
            ? t('landing.verifySentTitle')
            : t('landing.loginTitle');

  const subtitle =
    mode === 'mfa'
      ? t('landing.mfaSubtitle')
      : mode === 'register'
      ? t('landing.registerSubtitle')
      : mode === 'forgot'
        ? t('landing.forgotSubtitle')
        : mode === 'reset'
          ? t('landing.resetSubtitle')
          : mode === 'verifySent'
            ? t('landing.verifySentSubtitle')
            : t('landing.loginSubtitle');

  const loading = busy || loginLoading || mfaSubmitting;

  return (
    <>
      <dialog
        ref={dialogRef}
        className="mxm-login-dialog"
        onClose={handleClose}
        onCancel={handleClose}
        aria-labelledby="mxm-login-title"
      >
        <div ref={panelRef} className="mxm-login-dialog__panel">
          <button
            type="button"
            className="mxm-login-dialog__close"
            onClick={handleClose}
            aria-label={t('landing.modalClose')}
          >
            <X size={16} />
          </button>
          <h2 id="mxm-login-title">{title}</h2>
          <p className="mxm-login-dialog__subtitle">{subtitle}</p>

          {(mode === 'login' || mode === 'register') && (
            <div className="mxm-login-dialog__oauth">
              {providers?.google !== false && (
                <button
                  type="button"
                  className="mxm-login-dialog__oauth-btn"
                  disabled={!providers?.google}
                  onClick={() => {
                    window.location.href = getOAuthStartUrl('google');
                  }}
                >
                  <GoogleGlyph />
                  <span>{t('landing.continueGoogle')}</span>
                </button>
              )}
              {providers?.github !== false && (
                <button
                  type="button"
                  className="mxm-login-dialog__oauth-btn"
                  disabled={!providers?.github}
                  onClick={() => {
                    window.location.href = getOAuthStartUrl('github');
                  }}
                >
                  <Github size={18} />
                  <span>{t('landing.continueGithub')}</span>
                </button>
              )}
              {(providers?.google || providers?.github || providers == null) && (
                <div className="mxm-login-dialog__divider" role="separator">
                  <span>{t('landing.orEmail')}</span>
                </div>
              )}
            </div>
          )}

          {mode === 'mfa' && (
            <form onSubmit={handleMfaSubmit} className="form-group mxm-login-dialog__mfa">
              <MfaCodeInput value={mfaCode} onChange={setMfaCode} disabled={loading} />
              <button type="submit" className="btn-primary mxm-login-dialog__submit" disabled={loading}>
                {loading ? t('landing.mfaVerifying') : t('landing.mfaConfirm')}
              </button>
              <p className="mxm-login-dialog__switch">
                <button
                  type="button"
                  className="mxm-login-dialog__link"
                  onClick={() => {
                    setMessage('');
                    setMfaToken('');
                    setMfaCode('');
                    setMode('login');
                  }}
                >
                  {t('landing.mfaBackToLogin')}
                </button>
              </p>
            </form>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="form-group">
              <label htmlFor="landing-identifier">{t('landing.accountLabel')}</label>
              <input
                id="landing-identifier"
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                required
                autoComplete="username"
                placeholder={t('landing.accountPlaceholder')}
              />
              <label htmlFor="landing-password">{t('landing.passwordLabel')}</label>
              <input
                id="landing-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={t('landing.passwordPlaceholder')}
              />
              <div className="mxm-login-dialog__row-links">
                <button
                  type="button"
                  className="mxm-login-dialog__link"
                  onClick={() => {
                    setMessage('');
                    setMode('forgot');
                  }}
                >
                  {t('landing.forgotLink')}
                </button>
              </div>
              <button type="submit" className="btn-primary mxm-login-dialog__submit" disabled={loading}>
                {loading ? t('landing.loggingIn') : t('landing.loginButton')}
              </button>
              <p className="mxm-login-dialog__switch">
                {t('landing.noAccount')}{' '}
                <button
                  type="button"
                  className="mxm-login-dialog__link"
                  onClick={() => {
                    setMessage('');
                    setMode('register');
                  }}
                >
                  {t('landing.goRegister')}
                </button>
              </p>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="form-group">
              <label htmlFor="landing-reg-email">{t('landing.emailLabel')}</label>
              <input
                id="landing-reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={t('landing.emailPlaceholder')}
              />
              <label htmlFor="landing-reg-password">{t('landing.passwordLabel')}</label>
              <input
                id="landing-reg-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder={t('landing.passwordPlaceholder')}
              />
              <label htmlFor="landing-reg-password2">{t('landing.passwordConfirmLabel')}</label>
              <input
                id="landing-reg-password2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder={t('landing.passwordConfirmPlaceholder')}
              />
              <button type="submit" className="btn-primary mxm-login-dialog__submit" disabled={loading}>
                {loading ? t('landing.registering') : t('landing.registerButton')}
              </button>
              <p className="mxm-login-dialog__switch">
                {t('landing.hasAccount')}{' '}
                <button
                  type="button"
                  className="mxm-login-dialog__link"
                  onClick={() => {
                    setMessage('');
                    setMode('login');
                  }}
                >
                  {t('landing.goLogin')}
                </button>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="form-group">
              <label htmlFor="landing-forgot-email">{t('landing.emailLabel')}</label>
              <input
                id="landing-forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={t('landing.emailPlaceholder')}
              />
              <button type="submit" className="btn-primary mxm-login-dialog__submit" disabled={loading}>
                {loading ? t('landing.sending') : t('landing.sendResetLink')}
              </button>
              <p className="mxm-login-dialog__switch">
                <button
                  type="button"
                  className="mxm-login-dialog__link"
                  onClick={() => {
                    setMessage('');
                    setMode('login');
                  }}
                >
                  {t('landing.backToLogin')}
                </button>
              </p>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handleReset} className="form-group">
              <label htmlFor="landing-reset-password">{t('landing.passwordLabel')}</label>
              <input
                id="landing-reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder={t('landing.passwordPlaceholder')}
              />
              <label htmlFor="landing-reset-password2">{t('landing.passwordConfirmLabel')}</label>
              <input
                id="landing-reset-password2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder={t('landing.passwordConfirmPlaceholder')}
              />
              <button type="submit" className="btn-primary mxm-login-dialog__submit" disabled={loading}>
                {loading ? t('landing.resetting') : t('landing.resetButton')}
              </button>
            </form>
          )}

          {mode === 'verifySent' && (
            <div className="mxm-login-dialog__verify">
              <div className="mxm-login-dialog__verify-icon" aria-hidden>
                <Mail size={28} />
              </div>
              <p>{t('landing.verifySentBody', { email })}</p>
              <button
                type="button"
                className="btn-primary mxm-login-dialog__submit"
                disabled={loading || !email}
                onClick={() => void handleResend()}
              >
                {loading ? t('landing.sending') : t('landing.resendVerification')}
              </button>
              <p className="mxm-login-dialog__switch">
                <button
                  type="button"
                  className="mxm-login-dialog__link"
                  onClick={() => {
                    setMessage('');
                    setMode('login');
                  }}
                >
                  {t('landing.backToLogin')}
                </button>
              </p>
            </div>
          )}

          {message && (
            <p
              className={
                messageTone === 'ok' ? 'mxm-login-dialog__ok' : 'mxm-login-dialog__error'
              }
              role="alert"
            >
              {message}
            </p>
          )}
        </div>
      </dialog>

      <CaptchaVerifyModal
        open={captchaOpen}
        onClose={closeCaptcha}
        onVerified={handleCaptchaVerified}
      />
    </>
  );
}
