import { Clapperboard, FileText, Image } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STAGES = [
  { key: 'showcase1' as const, Icon: Image },
  { key: 'showcase2' as const, Icon: FileText },
  { key: 'showcase3' as const, Icon: Clapperboard },
] as const;

export function LandingShowcase() {
  const { t } = useTranslation();

  return (
    <section className="mxm-landing-section mxm-landing-showcase" aria-labelledby="landing-showcase-title">
      <div className="mxm-landing-section__head">
        <h2 id="landing-showcase-title">{t('landing.showcaseTitle')}</h2>
        <p>{t('landing.showcaseDesc')}</p>
      </div>
      <div className="mxm-landing-showcase__grid">
        {STAGES.map(({ key, Icon }) => (
          <article key={key} className="mxm-landing-showcase__card">
            <div className="mxm-landing-showcase__card-icon">
              <Icon size={24} strokeWidth={1.5} aria-hidden />
            </div>
            <h3>{t(`landing.${key}Title`)}</h3>
            <p>{t(`landing.${key}Desc`)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
