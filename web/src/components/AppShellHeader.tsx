import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Coins, LogOut, Menu, Moon, Plus, Sun, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMyWallet, type LoginUser } from '../api/client';
import {
  APP_LOCALE_LABELS,
  SUPPORTED_APP_LOCALES,
  type AppLocale,
} from '../i18n/appLocale';
import './AppShellHeader.css';

const MXM_ASSET = 'MXM-TOKEN';

type ThemeMode = 'light' | 'dark';

interface AppShellHeaderProps {
  title: string;
  subtitle: string;
  isLoggedIn: boolean;
  user: LoginUser | null;
  isDark: boolean;
  currentLang: AppLocale;
  onThemeChange: (mode: ThemeMode) => void;
  onLanguageChange: (lang: AppLocale) => void;
  onLogout: () => void;
  /** 跳转账号页（钱包 / 充值） */
  onNavigateToAccount?: () => void;
  showSidebarToggle?: boolean;
  onSidebarToggle?: () => void;
}

function userInitial(user: LoginUser | null): string {
  const name = user?.username?.trim();
  if (!name) return '?';
  return name.slice(0, 1).toUpperCase();
}

function formatBalance(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function AppShellHeader({
  title,
  subtitle,
  isLoggedIn,
  user,
  isDark,
  currentLang,
  onThemeChange,
  onLanguageChange,
  onLogout,
  onNavigateToAccount,
  showSidebarToggle,
  onSidebarToggle,
}: AppShellHeaderProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadBalance = useCallback(async () => {
    if (!isLoggedIn) {
      setBalance(null);
      return;
    }
    setBalanceLoading(true);
    try {
      const res = await getMyWallet(MXM_ASSET);
      if (!res.error && res.data?.data) {
        setBalance(Number(res.data.data.available_balance));
      } else {
        setBalance(null);
      }
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && isLoggedIn) void loadBalance();
  }, [open, isLoggedIn, loadBalance]);

  const goAccount = () => {
    setOpen(false);
    onNavigateToAccount?.();
  };

  return (
    <header className="app-shell-header">
      <div className="app-shell-header__title-block">
        <h1 className="app-shell-header__title">{title}</h1>
        <p className="app-shell-header__subtitle">{subtitle}</p>
      </div>

      <div className="app-shell-header__toolbar" ref={rootRef}>
        {showSidebarToggle && (
          <button
            type="button"
            className="app-shell-header__icon-btn"
            onClick={onSidebarToggle}
            aria-label="打开导航"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
        )}

        <div className="app-shell-header__menu">
          <button
            type="button"
            className={`app-shell-header__trigger ${open ? 'is-open' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={t('header.menu.open')}
          >
            <span className="app-shell-header__avatar" aria-hidden="true">
              {isLoggedIn ? userInitial(user) : <UserRound size={16} strokeWidth={1.75} />}
            </span>
            <span className="app-shell-header__trigger-text">
              {isLoggedIn ? user?.username ?? t('auth.loggedIn') : t('auth.loggedOut')}
            </span>
            <ChevronDown size={14} className="app-shell-header__chevron" aria-hidden="true" />
          </button>

          {open && (
            <div className="app-shell-header__panel" role="menu">
              <div className="app-shell-header__panel-head">
                <span className="app-shell-header__panel-name">
                  {isLoggedIn ? user?.username ?? t('auth.loggedIn') : t('auth.loggedOut')}
                </span>
                {isLoggedIn && user?.role && (
                  <span className="app-shell-header__panel-role">{user.role}</span>
                )}
              </div>

              {isLoggedIn && (
                <div className="app-shell-header__wallet" role="group" aria-label={t('header.menu.wallet')}>
                  <div className="app-shell-header__wallet-main">
                    <span className="app-shell-header__wallet-icon" aria-hidden="true">
                      <Coins size={16} strokeWidth={1.75} />
                    </span>
                    <div className="app-shell-header__wallet-text">
                      <span className="app-shell-header__wallet-label">
                        {t('header.menu.balance')}
                      </span>
                      <span className="app-shell-header__wallet-value">
                        {balanceLoading ? (
                          <span className="app-shell-header__wallet-skeleton" aria-busy="true" />
                        ) : (
                          <>
                            {formatBalance(balance)}
                            <span className="app-shell-header__wallet-unit">MXM</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="app-shell-header__wallet-recharge"
                    onClick={goAccount}
                  >
                    <Plus size={14} strokeWidth={2} />
                    {t('header.menu.recharge')}
                  </button>
                </div>
              )}

              <div className="app-shell-header__section">
                <span className="app-shell-header__section-label">{t('header.menu.appearance')}</span>
                <div className="app-shell-header__segmented" role="group" aria-label={t('header.menu.appearance')}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!isDark}
                    className={!isDark ? 'is-active' : ''}
                    onClick={() => onThemeChange('light')}
                  >
                    <Sun size={14} />
                    {t('header.menu.themeLight')}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isDark}
                    className={isDark ? 'is-active' : ''}
                    onClick={() => onThemeChange('dark')}
                  >
                    <Moon size={14} />
                    {t('header.menu.themeDark')}
                  </button>
                </div>
              </div>

              <div className="app-shell-header__section">
                <span className="app-shell-header__section-label">{t('header.menu.language')}</span>
                <div
                  className="app-shell-header__segmented app-shell-header__segmented--langs"
                  role="group"
                  aria-label={t('header.menu.language')}
                >
                  {SUPPORTED_APP_LOCALES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      role="menuitemradio"
                      aria-checked={currentLang === lang}
                      className={currentLang === lang ? 'is-active' : ''}
                      onClick={() => onLanguageChange(lang)}
                    >
                      {APP_LOCALE_LABELS[lang]}
                    </button>
                  ))}
                </div>
              </div>

              {isLoggedIn && (
                <>
                  <div className="app-shell-header__divider" />
                  <button
                    type="button"
                    role="menuitem"
                    className="app-shell-header__logout"
                    onClick={() => {
                      setOpen(false);
                      onLogout();
                    }}
                  >
                    <LogOut size={15} />
                    {t('auth.logout')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
