import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Modal, Slider, Switch } from 'antd';
import { Volume2, VolumeX } from 'lucide-react';
import { listStorageObjects, type StorageObjectListItem } from '../../api/client';
import { INSPECTOR_TIPS } from '../manualReviewUserCopy';
import { InspectorField } from './InspectorField';
import { PageHint } from '../PageHint';
import type { AudioRole } from './audioTrackUtils';

export type AudioTrackInspectorProps = {
  role: AudioRole;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  hasMedia: boolean;
  onUpdate: (patch: {
    volume?: number;
    muted?: boolean;
    fadeIn?: number;
    fadeOut?: number;
  }) => void;
  onPickMedia?: (url: string, assetId?: string) => void;
  onClearMedia?: () => void;
};

const ROLE_TITLE_KEY: Record<AudioRole, string> = {
  voice: 'video.audio.voice',
  bgm: 'video.audio.bgm',
};

const ROLE_HELP_TITLE_KEY: Record<AudioRole, string> = {
  voice: 'video.audio.voiceHelp',
  bgm: 'video.audio.bgmHelp',
};

function volumeToPercent(volume: number): number {
  return Math.round(Math.max(0, Math.min(1, volume)) * 100);
}

function percentToVolume(percent: number): number {
  return Math.max(0, Math.min(1, percent / 100));
}

export function AudioTrackInspector({
  role,
  volume,
  muted,
  fadeIn,
  fadeOut,
  hasMedia,
  onUpdate,
  onPickMedia,
  onClearMedia,
}: AudioTrackInspectorProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assets, setAssets] = useState<StorageObjectListItem[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const title = t(ROLE_TITLE_KEY[role]);
  const percent = volumeToPercent(volume);
  const effectiveMuted = muted || percent === 0;

  const openPicker = async () => {
    setPickerOpen(true);
    setLoadingAssets(true);
    try {
      const res = await listStorageObjects({
        storageMode: 'asset',
        uploadSource: 'self',
        limit: 80,
        mimePrefix: 'audio/',
      });
      setAssets(res.items ?? []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('video.audio.loadFailed'));
    } finally {
      setLoadingAssets(false);
    }
  };

  return (
    <div className="video-timeline-review__inspector">
      <header className="video-timeline-review__inspector-header">
        <h4 className="video-timeline-review__inspector-title">{title}</h4>
        <PageHint title={t(ROLE_HELP_TITLE_KEY[role])} description={role === 'voice' ? INSPECTOR_TIPS.voiceAudio : INSPECTOR_TIPS.bgmAudio} placement="left" />
      </header>
      <div className="video-timeline-review__inspector-body">
        {role === 'bgm' && (
          <div className="video-timeline-review__audio-actions">
            <Button type="primary" ghost size="small" onClick={() => void openPicker()}>
              {hasMedia ? t('video.audio.replaceBgm') : t('video.audio.pickFromAssets')}
            </Button>
            {hasMedia && onClearMedia ? (
              <Button size="small" danger type="text" onClick={onClearMedia}>
                {t('video.audio.remove')}
              </Button>
            ) : null}
          </div>
        )}

        <InspectorField label={t('video.audio.volume')}>
          <div className="video-timeline-review__volume-row">
            <span className="video-timeline-review__volume-icon" aria-hidden>
              {effectiveMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </span>
            <Slider
              className="video-timeline-review__volume-slider"
              min={0}
              max={100}
              value={percent}
              onChange={(v) => onUpdate({ volume: percentToVolume(v) })}
              tooltip={{ formatter: (v) => `${v}%` }}
            />
            <span className="video-timeline-review__volume-value">{percent}%</span>
          </div>
        </InspectorField>

        <InspectorField label={t('video.audio.mute')}>
          <Switch checked={muted} onChange={(checked) => onUpdate({ muted: checked })} />
        </InspectorField>

        <InspectorField label={t('video.audio.fadeIn')}>
          <Slider
            min={0}
            max={10}
            step={0.1}
            value={fadeIn}
            onChange={(v) => onUpdate({ fadeIn: v })}
            tooltip={{ formatter: (v) => `${v}s` }}
          />
        </InspectorField>

        <InspectorField label={t('video.audio.fadeOut')}>
          <Slider
            min={0}
            max={10}
            step={0.1}
            value={fadeOut}
            onChange={(v) => onUpdate({ fadeOut: v })}
            tooltip={{ formatter: (v) => `${v}s` }}
          />
        </InspectorField>

        {role === 'voice' && !hasMedia && (
          <p className="video-timeline-review__hint">{t('video.audio.voiceHint')}</p>
        )}
        {role === 'bgm' && !hasMedia && (
          <p className="video-timeline-review__hint">{t('video.audio.bgmHint')}</p>
        )}
      </div>

      <Modal
        title={t('video.audio.pickBgmTitle')}
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
        width={560}
        destroyOnHidden
      >
        {loadingAssets ? (
          <p className="video-timeline-review__hint">{t('video.audio.loading')}</p>
        ) : assets.length === 0 ? (
          <p className="video-timeline-review__hint">{t('video.audio.noAudioInAssets')}</p>
        ) : (
          <ul className="video-timeline-review__asset-picker">
            {assets.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="video-timeline-review__asset-picker-item"
                  onClick={() => {
                    if (!item.url) return;
                    onPickMedia?.(item.url, item.id);
                    setPickerOpen(false);
                  }}
                >
                  <span className="video-timeline-review__asset-picker-name">
                    {item.originalName ?? item.id}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
