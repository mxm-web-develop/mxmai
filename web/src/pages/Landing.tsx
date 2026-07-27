import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Clapperboard,
  FileText,
  Image,
  Mic2,
  Sparkles,
  Workflow,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLocale } from '../i18n/appLocale';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { consumeOAuthHashPayload, verifyEmailToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LandingBackground } from './landing/LandingBackground';
import { LandingLoginModal } from './landing/LandingLoginModal';
import { LandingNav } from './landing/LandingNav';
import { LandingParticleLogo } from './landing/LandingParticleLogo';
import { LandingShowcase } from './landing/LandingShowcase';
import { LandingWhySection } from './landing/LandingWhySection';
import { MOTION } from '../lib/motion/gsapPresets';
import './landing/landing.css';

gsap.registerPlugin(useGSAP);

type ThemeMode = 'light' | 'dark';

interface LandingProps {
  isDark: boolean;
  currentLang: AppLocale;
  onThemeChange: (mode: ThemeMode) => void;
  onLanguageChange: (lang: AppLocale) => void;
}

const CAPABILITY_ICONS = [Image, FileText, Clapperboard, Mic2, Workflow, Bot] as const;
const CAPABILITY_KEYS = ['cap1', 'cap2', 'cap3', 'cap4', 'cap5', 'cap6'] as const;
const CAPABILITY_LAYOUT = ['wide', 'narrow', 'half', 'half', 'third', 'third'] as const;

const HERO_NODES = [
  { key: 'nodeImage' as const, style: { left: '8%', top: '18%' } },
  { key: 'nodeWriting' as const, style: { right: '6%', top: '22%' } },
  { key: 'nodeVideo' as const, style: { left: '10%', bottom: '16%' } },
  { key: 'nodeAgent' as const, style: { right: '8%', bottom: '14%' } },
] as const;

export default function Landing({ isDark, currentLang, onThemeChange, onLanguageChange }: LandingProps) {
  const { t } = useTranslation();
  const { setToken } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'register' | 'forgot' | 'reset' | 'verifySent'>(
    'login'
  );
  const [resetToken, setResetToken] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const oauth = consumeOAuthHashPayload();
    if (oauth?.accessToken) {
      setToken(oauth.accessToken, oauth.user ?? null);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const reset = params.get('reset_password');
    const verified = params.get('verified');
    const verifyEmail = params.get('verify_email');
    const oauthError = params.get('oauth_error');

    if (reset) {
      setResetToken(reset);
      setLoginMode('reset');
      setLoginOpen(true);
      params.delete('reset_password');
      const qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      return;
    }

    if (verifyEmail) {
      void verifyEmailToken(verifyEmail).finally(() => {
        setLoginMode('login');
        setLoginOpen(true);
      });
      params.delete('verify_email');
      const qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      return;
    }

    if (verified === '1' || verified === '0' || oauthError) {
      setLoginMode('login');
      setLoginOpen(true);
      params.delete('verified');
      params.delete('oauth_error');
      const qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [setToken]);

  useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) return;

      const heroTl = gsap.timeline({ defaults: { ease: MOTION.landingReveal.ease } });
      heroTl
        .from('.mxm-landing-hero__badge', { opacity: 0, y: 14, duration: 0.5 })
        .from('.mxm-landing-hero__title', { opacity: 0, y: MOTION.landingReveal.y, duration: 0.65 }, '-=0.25')
        .from('.mxm-landing-hero__lead', { opacity: 0, y: 18, duration: 0.55 }, '-=0.35')
        .from('.mxm-landing-hero__cta-row .btn-primary', { opacity: 0, y: 12, duration: 0.45 }, '-=0.3')
        .from('.mxm-landing-hero__cta-row .btn-secondary', { opacity: 0, y: 12, duration: 0.45 }, '-=0.35')
        .from('.mxm-landing-hero__stat', { opacity: 0, y: 10, stagger: 0.08, duration: 0.4 }, '-=0.2')
        .from('.mxm-landing-hero__visual-inner', { opacity: 0, scale: 0.92, duration: 0.75 }, '-=0.55')
        .from('.mxm-landing-hero__node', { opacity: 0, scale: 0.85, stagger: 0.07, duration: 0.45 }, '-=0.45');

      gsap.to('.mxm-landing-hero__orbit', {
        rotation: 360,
        duration: 48,
        repeat: -1,
        ease: 'none',
      });
    },
    { scope: rootRef },
  );

  const openLogin = () => {
    setLoginMode('login');
    setResetToken(null);
    setLoginOpen(true);
  };

  return (
    <div className="mxm-landing" ref={rootRef}>
      <LandingBackground />
      <div className="mxm-landing__scroll">
        <LandingNav
          isDark={isDark}
          currentLang={currentLang}
          onThemeChange={onThemeChange}
          onLanguageChange={onLanguageChange}
          onLoginClick={openLogin}
        />

        <section className="mxm-landing-section mxm-landing-hero" aria-labelledby="landing-hero-title">
            <div className="mxm-landing-hero__copy">
            <div className="mxm-landing-hero__badge">
              <Sparkles size={14} aria-hidden />
              <span>{t('landing.kicker')}</span>
            </div>
            <h1 id="landing-hero-title" className="mxm-landing-hero__title">
              {t('landing.titlePrefix')}
              <em>{t('landing.titleHighlight')}</em>
              {t('landing.titleSuffix')}
            </h1>
            <p className="mxm-landing-hero__lead">{t('landing.subtitle')}</p>
            <div className="mxm-landing-hero__cta-row">
              <button type="button" className="btn-primary" onClick={openLogin}>
                {t('landing.ctaPrimary')}
              </button>
              <a href="#capabilities" className="btn-secondary">
                {t('landing.ctaSecondary')}
              </a>
            </div>
            <div className="mxm-landing-hero__stats">
              <div className="mxm-landing-hero__stat">
                <strong>{t('landing.stat1Value')}</strong>
                <span>{t('landing.stat1Label')}</span>
              </div>
              <div className="mxm-landing-hero__stat">
                <strong>{t('landing.stat2Value')}</strong>
                <span>{t('landing.stat2Label')}</span>
              </div>
              <div className="mxm-landing-hero__stat">
                <strong>{t('landing.stat3Value')}</strong>
                <span>{t('landing.stat3Label')}</span>
              </div>
            </div>
          </div>

          <div className="mxm-landing-hero__visual" aria-hidden>
            <div className="mxm-landing-hero__visual-inner">
              <div className="mxm-landing-hero__visual-glow" />
              <div className="mxm-landing-hero__visual-grid" />
              <div className="mxm-landing-hero__orbit" />
              <LandingParticleLogo />
              {HERO_NODES.map(({ key, style }) => (
                <div key={key} className="mxm-landing-hero__node" style={style}>
                  <strong>{t(`landing.${key}Title`)}</strong>
                  {t(`landing.${key}Desc`)}
                </div>
              ))}
            </div>
          </div>
          </section>

        <LandingShowcase />

        <section id="capabilities" className="mxm-landing-section" aria-labelledby="landing-cap-title">
          <div className="mxm-landing-section__head">
            <h2 id="landing-cap-title">{t('landing.capabilitiesTitle')}</h2>
            <p>{t('landing.capabilitiesDesc')}</p>
          </div>
          <div className="mxm-landing-bento">
            {CAPABILITY_KEYS.map((key, i) => {
              const Icon = CAPABILITY_ICONS[i];
              const layout = CAPABILITY_LAYOUT[i] ?? 'third';
              return (
                <article
                  key={key}
                  className={`mxm-landing-bento__item mxm-landing-bento__item--${layout}`}
                >
                  <div className="mxm-landing-bento__icon">
                    <Icon size={18} aria-hidden />
                  </div>
                  <h3>{t(`landing.${key}Title`)}</h3>
                  <p>{t(`landing.${key}Desc`)}</p>
                </article>
              );
            })}
          </div>
        </section>

        <LandingWhySection />

        <section id="workflow" className="mxm-landing-section" aria-labelledby="landing-flow-title">
          <div className="mxm-landing-section__head">
            <h2 id="landing-flow-title">{t('landing.workflowTitle')}</h2>
            <p>{t('landing.workflowDesc')}</p>
          </div>
          <div className="mxm-landing-flow">
            <div>
              <div className="mxm-landing-flow__steps">
                {(['flow1', 'flow2', 'flow3'] as const).map((key, i) => (
                  <div key={key} className="mxm-landing-flow__step">
                    <span className="mxm-landing-flow__step-num">{i + 1}</span>
                    <div>
                      <h4>{t(`landing.${key}Title`)}</h4>
                      <p>{t(`landing.${key}Desc`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mxm-landing-flow__highlight">
              <div className="mxm-landing-flow__highlight-icon">
                <Zap size={18} aria-hidden />
              </div>
              <h3>{t('landing.flowHighlightTitle')}</h3>
              <p>{t('landing.flowHighlightDesc')}</p>
            </div>
          </div>
        </section>

        <footer className="mxm-landing-cta">
          <h2>{t('landing.ctaTitle')}</h2>
          <p>{t('landing.ctaDesc')}</p>
          <div className="mxm-landing-cta__actions">
            <button type="button" className="btn-primary" onClick={openLogin}>
              {t('landing.ctaPrimary')}
            </button>
          </div>
        </footer>

        <div className="mxm-landing-footer">
          <span>{t('landing.copyright', { year: new Date().getFullYear() })}</span>
          <span>{t('landing.footnote')}</span>
        </div>
      </div>

      <LandingLoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        initialMode={loginMode}
        resetToken={resetToken}
      />
    </div>
  );
}
