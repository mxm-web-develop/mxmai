import { FolderOpen, ShieldCheck, Users, PenLine, ShoppingBag, Megaphone, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const VALUE_ICONS = [FolderOpen, ShieldCheck, Users] as const;
const VALUE_KEYS = ['why1', 'why2', 'why3'] as const;

const SCENE_ICONS = [PenLine, ShoppingBag, Megaphone, UsersRound] as const;
const SCENE_KEYS = ['whyScene1', 'whyScene2', 'whyScene3', 'whyScene4'] as const;

const COMPARE_KEYS = ['whyCompare1', 'whyCompare2', 'whyCompare3'] as const;

export function LandingWhySection() {
  const { t } = useTranslation();

  return (
    <section id="why" className="mxm-landing-section mxm-landing-why" aria-labelledby="landing-why-title">
      <div className="mxm-landing-section__head">
        <h2 id="landing-why-title">{t('landing.whyTitle')}</h2>
        <p>{t('landing.whyDesc')}</p>
      </div>

      <div className="mxm-landing-why__main">
        <aside className="mxm-landing-why__spotlight" aria-label={t('landing.whySpotlightAria')}>
          <div className="mxm-landing-why__spotlight-glow" aria-hidden />
          <p className="mxm-landing-why__spotlight-quote">{t('landing.whySpotlightQuote')}</p>
          <p className="mxm-landing-why__spotlight-lead">{t('landing.whySpotlightLead')}</p>

          <div className="mxm-landing-why__metrics">
            {(['whyMetric1', 'whyMetric2', 'whyMetric3'] as const).map((key) => (
              <div key={key} className="mxm-landing-why__metric">
                <strong>{t(`landing.${key}Value`)}</strong>
                <span>{t(`landing.${key}Label`)}</span>
              </div>
            ))}
          </div>

          <div className="mxm-landing-why__pipeline" aria-hidden>
            <span>{t('landing.whyPipelineIdea')}</span>
            <span className="mxm-landing-why__pipeline-arrow">→</span>
            <span>{t('landing.whyPipelineCreate')}</span>
            <span className="mxm-landing-why__pipeline-arrow">→</span>
            <span>{t('landing.whyPipelineDeliver')}</span>
          </div>
        </aside>

        <div className="mxm-landing-why__values">
          {VALUE_KEYS.map((key, i) => {
            const Icon = VALUE_ICONS[i];
            return (
              <article key={key} className="mxm-landing-why__value-card">
                <div className="mxm-landing-why__value-icon">
                  <Icon size={20} aria-hidden />
                </div>
                <div>
                  <h3>{t(`landing.${key}Title`)}</h3>
                  <p>{t(`landing.${key}Desc`)}</p>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="mxm-landing-why__compare">
        <h3 className="mxm-landing-why__compare-title">{t('landing.whyCompareTitle')}</h3>
        <div className="mxm-landing-why__compare-grid" role="table" aria-label={t('landing.whyCompareTitle')}>
          <div className="mxm-landing-why__compare-head" role="row">
            <span role="columnheader">{t('landing.whyCompareColBefore')}</span>
            <span role="columnheader">{t('landing.whyCompareColAfter')}</span>
          </div>
          {COMPARE_KEYS.map((key) => (
            <div key={key} className="mxm-landing-why__compare-row" role="row">
              <span
                className="mxm-landing-why__compare-before"
                role="cell"
                data-label={t('landing.whyCompareColBefore')}
              >
                {t(`landing.${key}Before`)}
              </span>
              <span
                className="mxm-landing-why__compare-after"
                role="cell"
                data-label={t('landing.whyCompareColAfter')}
              >
                {t(`landing.${key}After`)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mxm-landing-why__scenes">
        <h3 className="mxm-landing-why__scenes-title">{t('landing.whyScenesTitle')}</h3>
        <div className="mxm-landing-why__scenes-grid">
          {SCENE_KEYS.map((key, i) => {
            const Icon = SCENE_ICONS[i];
            return (
              <article key={key} className="mxm-landing-why__scene-card">
                <div className="mxm-landing-why__scene-icon">
                  <Icon size={18} aria-hidden />
                </div>
                <h4>{t(`landing.${key}Title`)}</h4>
                <p>{t(`landing.${key}Desc`)}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
