import { useTranslation } from 'react-i18next';
import { Input, InputNumber, Select, Slider } from 'antd';
import { PageHint } from '../PageHint';
import { InspectorField } from './InspectorField';
import {
  OVERLAY_ANIMATION_LABEL_KEY,
  OVERLAY_ANIMATION_OPTIONS,
  type OverlayTextAnimationPreset,
  type TextClip,
} from './types';
import {
  OVERLAY_FONT_SIZE_MAX,
  OVERLAY_FONT_SIZE_MIN,
  OVERLAY_LAYOUT_LABEL_KEY,
  OVERLAY_LAYOUT_OPTIONS,
  OVERLAY_STYLE_PRESET_LABEL_KEY,
  OVERLAY_STYLE_PRESET_OPTIONS,
  applyOverlayStylePreset,
  buildOverlayAnimation,
  inferLayoutFromPosition,
  inferStylePreset,
  positionForLayout,
  type OverlayLayoutId,
  type OverlayStylePresetId,
} from './overlayStylePresets';

export type TextClipPatch = Partial<
  Pick<TextClip, 'text' | 'animation' | 'style' | 'transform' | 'startTime' | 'duration'>
>;

type OverlayInspectorProps = {
  clip: TextClip;
  onUpdate: (id: string, patch: TextClipPatch) => void;
};

const COLOR_SWATCHES = [
  '#FACC15',
  '#FFFFFF',
  '#FB923C',
  '#38BDF8',
  '#F472B6',
  '#A3E635',
  '#F8FAFC',
  '#0F172A',
];

export function OverlayInspector({ clip, onUpdate }: OverlayInspectorProps) {
  const { t } = useTranslation();
  const layout = inferLayoutFromPosition(clip.transform.position.x, clip.transform.position.y);
  const stylePreset = inferStylePreset(clip.style);
  const animPreset = (clip.animation?.preset ?? 'none') as OverlayTextAnimationPreset;

  const patchStyle = (partial: Partial<TextClip['style']>) => {
    onUpdate(clip.id, {
      style: { ...clip.style, ...partial },
    });
  };

  const patchPosition = (x: number, y: number) => {
    onUpdate(clip.id, {
      transform: {
        ...clip.transform,
        position: { x, y },
      },
    });
  };

  return (
    <div className="video-timeline-review__inspector">
      <header className="video-timeline-review__inspector-header">
        <h4 className="video-timeline-review__inspector-title">{t('video.overlay.title')}</h4>
        <PageHint
          title={t('video.overlay.layerTip')}
          description={t('video.overlay.layerDesc')}
          placement="left"
        />
      </header>

      <div className="video-timeline-review__inspector-body">
        <div className="video-timeline-review__inspector-meta">
          {clip.startTime.toFixed(1)}s · {clip.duration.toFixed(1)}s · {clip.style.fontSize}px
        </div>

        <InspectorField label={t('video.overlay.copy')}>
          <Input.TextArea
            rows={3}
            value={clip.text}
            maxLength={80}
            showCount
            onChange={(e) => onUpdate(clip.id, { text: e.target.value })}
          />
        </InspectorField>

        <section className="video-timeline-review__inspector-overlay-block">
          <header className="video-timeline-review__inspector-subsection-title">{t('video.overlay.style')}</header>

          <InspectorField label={t('video.overlay.stylePresetLabel')}>
            <Select
              value={stylePreset === 'custom' ? undefined : stylePreset}
              placeholder={stylePreset === 'custom' ? t('video.overlay.custom') : undefined}
              onChange={(v: OverlayStylePresetId) => {
                const next = applyOverlayStylePreset(clip, v);
                onUpdate(clip.id, { style: next.style, transform: next.transform });
              }}
              options={OVERLAY_STYLE_PRESET_OPTIONS.map((k) => ({
                value: k,
                label: t(OVERLAY_STYLE_PRESET_LABEL_KEY[k]),
              }))}
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.fontSize', { size: clip.style.fontSize })}>
            <Slider
              min={OVERLAY_FONT_SIZE_MIN}
              max={OVERLAY_FONT_SIZE_MAX}
              step={2}
              value={clip.style.fontSize}
              onChange={(v) => patchStyle({ fontSize: v })}
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.textColor')}>
            <div className="video-timeline-review__overlay-swatches">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`video-timeline-review__overlay-swatch${
                    clip.style.color?.toLowerCase() === c.toLowerCase()
                      ? ' video-timeline-review__overlay-swatch--active'
                      : ''
                  }`}
                  style={{ background: c }}
                  title={c}
                  onClick={() => patchStyle({ color: c })}
                />
              ))}
              <Input
                size="small"
                value={clip.style.color}
                onChange={(e) => patchStyle({ color: e.target.value })}
                style={{ width: 96 }}
              />
            </div>
          </InspectorField>

          <InspectorField label={t('video.overlay.stroke', { width: clip.style.strokeWidth ?? 0 })}>
            <Slider
              min={0}
              max={12}
              step={1}
              value={clip.style.strokeWidth ?? 0}
              onChange={(v) =>
                patchStyle({
                  strokeWidth: v,
                  strokeColor: v > 0 ? clip.style.strokeColor ?? '#0a0a0a' : undefined,
                })
              }
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.background')}>
            <Select
              value={clip.style.backgroundColor ? 'on' : 'off'}
              onChange={(v: 'on' | 'off') =>
                patchStyle({
                  backgroundColor: v === 'on' ? 'rgba(15, 23, 42, 0.72)' : undefined,
                })
              }
              options={[
                { value: 'off', label: t('video.overlay.bgOff') },
                { value: 'on', label: t('video.overlay.bgOn') },
              ]}
            />
          </InspectorField>
        </section>

        <section className="video-timeline-review__inspector-overlay-block">
          <header className="video-timeline-review__inspector-subsection-title">{t('video.overlay.layout')}</header>

          <InspectorField label={t('video.overlay.gridPosition')}>
            <Select
              value={layout === 'custom' ? undefined : layout}
              placeholder={layout === 'custom' ? t('video.overlay.customCoords') : undefined}
              onChange={(v: OverlayLayoutId) => {
                const p = positionForLayout(v);
                patchPosition(p.x, p.y);
              }}
              options={OVERLAY_LAYOUT_OPTIONS.map((k) => ({
                value: k,
                label: t(OVERLAY_LAYOUT_LABEL_KEY[k]),
              }))}
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.horizontal')}>
            <Slider
              min={0}
              max={100}
              value={Math.round(clip.transform.position.x * 100)}
              onChange={(v) => patchPosition(v / 100, clip.transform.position.y)}
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.vertical')}>
            <Slider
              min={0}
              max={100}
              value={Math.round(clip.transform.position.y * 100)}
              onChange={(v) => patchPosition(clip.transform.position.x, v / 100)}
            />
          </InspectorField>
        </section>

        <section className="video-timeline-review__inspector-overlay-block">
          <header className="video-timeline-review__inspector-subsection-title">{t('video.overlay.animation')}</header>

          <InspectorField label={t('video.overlay.inOutPreset')}>
            <Select
              value={animPreset}
              onChange={(v: OverlayTextAnimationPreset) =>
                onUpdate(clip.id, {
                  animation: buildOverlayAnimation(v, {
                    inDuration: clip.animation?.inDuration,
                    outDuration: clip.animation?.outDuration,
                  }),
                })
              }
              options={OVERLAY_ANIMATION_OPTIONS.map((k) => ({
                value: k,
                label: t(OVERLAY_ANIMATION_LABEL_KEY[k]),
              }))}
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.inDuration')}>
            <InputNumber
              min={0}
              max={3}
              step={0.05}
              style={{ width: '100%' }}
              disabled={!clip.animation}
              value={clip.animation?.inDuration ?? 0.45}
              onChange={(v) => {
                if (v == null || !clip.animation) return;
                onUpdate(clip.id, {
                  animation: { ...clip.animation, inDuration: v },
                });
              }}
            />
          </InspectorField>

          <InspectorField label={t('video.overlay.outDuration')}>
            <InputNumber
              min={0}
              max={3}
              step={0.05}
              style={{ width: '100%' }}
              disabled={!clip.animation}
              value={clip.animation?.outDuration ?? 0.35}
              onChange={(v) => {
                if (v == null || !clip.animation) return;
                onUpdate(clip.id, {
                  animation: { ...clip.animation, outDuration: v },
                });
              }}
            />
          </InspectorField>
        </section>
      </div>
    </div>
  );
}
