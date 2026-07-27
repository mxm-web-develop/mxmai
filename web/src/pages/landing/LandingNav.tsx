import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  APP_LOCALE_LABELS,
  SUPPORTED_APP_LOCALES,
  type AppLocale,
} from '../../i18n/appLocale';

type ThemeMode = 'light' | 'dark';

interface LandingNavProps {
  isDark: boolean;
  currentLang: AppLocale;
  onThemeChange: (mode: ThemeMode) => void;
  onLanguageChange: (lang: AppLocale) => void;
  onLoginClick: () => void;
}

const NAV_LINKS = [
  { href: '#capabilities', key: 'navCapabilities' as const },
  { href: '#why', key: 'navWhy' as const },
  { href: '#workflow', key: 'navWorkflow' as const },
] as const;

export function LandingNav({
  isDark,
  currentLang,
  onThemeChange,
  onLanguageChange,
  onLoginClick,
}: LandingNavProps) {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`mxm-landing-nav${scrolled ? ' is-scrolled' : ''}`}>
      <a href="#" className="mxm-landing-nav__brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
        <span className="mxm-landing-nav__mark">MXM</span>
        <span className="mxm-landing-nav__name">SuperMXM</span>
      </a>

      <nav className="mxm-landing-nav__links" aria-label={t('landing.navAria')}>
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href}>
            {t(`landing.${link.key}`)}
          </a>
        ))}
      </nav>

      <div className="mxm-landing-nav__actions">
        <div className="mxm-landing-nav__lang" role="group" aria-label={t('header.menu.language')}>
          {SUPPORTED_APP_LOCALES.map((lang) => (
            <button
              key={lang}
              type="button"
              className={currentLang === lang ? 'is-active' : ''}
              onClick={() => onLanguageChange(lang)}
            >
              {APP_LOCALE_LABELS[lang]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mxm-landing-nav__icon-btn"
          onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
          aria-label={isDark ? t('header.menu.themeLight') : t('header.menu.themeDark')}
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button type="button" className="btn-primary btn-small" onClick={onLoginClick}>
          {t('landing.loginButton')}
        </button>
      </div>
    </header>
  );
}
