import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Input, Upload } from 'antd';
import BrandLoading from '../BrandLoading';
import { Loader2, Mic, Pause, Play, Square, Upload as UploadIcon } from 'lucide-react';
import {
  cloneMinimaxVoice,
  listMinimaxVoices,
  listMinimaxVoicesFromFolder,
  type MinimaxVoiceItem,
} from '../../api/client';
import { fetchMinimaxVoicePreviewBlob } from '../../shared/minimaxVoicePreview';
import {
  canUseMicrophoneCapture,
  captureMicrophoneStream,
  isMediaRecorderSupported,
  microphoneUnavailableReason,
  pickMediaRecorderMimeType,
} from '../../shared/audioCapture';
import './minimax-voice-field.css';

export type MinimaxVoiceValue = {
  mode: 'system' | 'clone';
  voice_id: string;
  label?: string;
};

type MinimaxVoiceFieldProps = {
  value: unknown;
  voiceModel?: string;
  cloneFolderId?: string;
  onChange: (next: MinimaxVoiceValue) => void;
};

type GenderFilter = 'all' | 'male' | 'female' | 'other';
type LanguageFilter = 'all' | 'zh' | 'en' | 'other';

const DEFAULT_VALUE: MinimaxVoiceValue = {
  mode: 'system',
  voice_id: 'female-shaonv',
  label: '',
};

const CLONE_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/m4a,.mp3,.wav,.m4a';


function normalizeValue(raw: unknown): MinimaxVoiceValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_VALUE };
  const o = raw as Record<string, unknown>;
  const voiceId = typeof o.voice_id === 'string' && o.voice_id.trim() ? o.voice_id.trim() : DEFAULT_VALUE.voice_id;
  const mode = o.mode === 'clone' ? 'clone' : 'system';
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : voiceId;
  return { mode, voice_id: voiceId, label };
}

function matchesGender(voice: MinimaxVoiceItem, filter: GenderFilter): boolean {
  if (filter === 'all') return true;
  return (voice.gender ?? 'other') === filter;
}

function matchesLanguage(voice: MinimaxVoiceItem, filter: LanguageFilter): boolean {
  if (filter === 'all') return true;
  return (voice.language ?? 'other') === filter;
}

export function MinimaxVoiceField({ value, voiceModel = 'speech-2.8-hd', cloneFolderId, onChange }: MinimaxVoiceFieldProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const currentRaw = normalizeValue(value);
  const current = {
    ...currentRaw,
    label: currentRaw.label || t('form.minimax.defaultLabel'),
  };

  const genderOptions: { value: GenderFilter; label: string }[] = [
    { value: 'all', label: t('form.minimax.genderAll') },
    { value: 'male', label: t('form.minimax.genderMale') },
    { value: 'female', label: t('form.minimax.genderFemale') },
    { value: 'other', label: t('form.minimax.genderOther') },
  ];
  const languageOptions: { value: LanguageFilter; label: string }[] = [
    { value: 'all', label: t('form.minimax.langAll') },
    { value: 'zh', label: t('form.minimax.langZh') },
    { value: 'en', label: t('form.minimax.langEn') },
    { value: 'other', label: t('form.minimax.langJa') },
  ];
  const languageTag = (language: MinimaxVoiceItem['language']): string => {
    if (language === 'zh') return t('form.minimax.langTagZh');
    if (language === 'en') return t('form.minimax.langTagEn');
    return t('form.minimax.langTagJa');
  };
  const [tab, setTab] = useState<'system' | 'clone'>(current.mode === 'clone' ? 'clone' : 'system');
  const [systemVoices, setSystemVoices] = useState<MinimaxVoiceItem[]>([]);
  const [cloneVoices, setCloneVoices] = useState<MinimaxVoiceItem[]>([]);
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [loadingClone, setLoadingClone] = useState(false);
  const [systemLoaded, setSystemLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('all');
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  const loadSystemVoices = useCallback(async () => {
    setLoadingSystem(true);
    try {
      const list = await listMinimaxVoices('system');
      setSystemVoices(list);
      setSystemLoaded(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.loadSystemFailed'));
    } finally {
      setLoadingSystem(false);
    }
  }, [message, t]);

  const loadCloneVoices = useCallback(async () => {
    setLoadingClone(true);
    try {
      if (cloneFolderId?.trim()) {
        const list = await listMinimaxVoicesFromFolder(cloneFolderId.trim());
        setCloneVoices(list);
        return;
      }
      const list = await listMinimaxVoices('voice_cloning');
      setCloneVoices(list);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.loadCloneFailed'));
    } finally {
      setLoadingClone(false);
    }
  }, [cloneFolderId, message, t]);

  useEffect(() => {
    if (tab === 'system' && !systemLoaded) void loadSystemVoices();
  }, [tab, systemLoaded, loadSystemVoices]);

  useEffect(() => {
    if (tab === 'clone') void loadCloneVoices();
  }, [tab, loadCloneVoices, cloneFolderId]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };
  }, []);

  const filteredSystem = useMemo(() => {
    const q = search.trim().toLowerCase();
    return systemVoices.filter((v) => {
      if (!matchesGender(v, genderFilter)) return false;
      if (!matchesLanguage(v, languageFilter)) return false;
      if (!q) return true;
      return (
        v.voice_name.toLowerCase().includes(q) ||
        v.voice_id.toLowerCase().includes(q)
      );
    });
  }, [systemVoices, search, genderFilter, languageFilter]);

  const filteredClone = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cloneVoices;
    return cloneVoices.filter(
      (v) => v.voice_name.toLowerCase().includes(q) || v.voice_id.toLowerCase().includes(q)
    );
  }, [cloneVoices, search]);

  const selectVoice = (mode: 'system' | 'clone', item: MinimaxVoiceItem) => {
    onChange({
      mode,
      voice_id: item.voice_id,
      label: item.voice_name || item.voice_id,
    });
  };

  const revokePreviewObjectUrl = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };

  const stopPreview = () => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    revokePreviewObjectUrl();
    setPlayingVoiceId(null);
    setLoadingPreviewId(null);
  };

  const togglePreview = async (item: MinimaxVoiceItem, event: React.MouseEvent) => {
    event.stopPropagation();

    if (playingVoiceId === item.voice_id) {
      stopPreview();
      return;
    }

    stopPreview();
    setLoadingPreviewId(item.voice_id);

    try {
      const blob = await fetchMinimaxVoicePreviewBlob(item.voice_id);
      const objectUrl = URL.createObjectURL(blob);
      previewObjectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      previewAudioRef.current = audio;
      audio.onended = () => {
        stopPreview();
      };
      audio.onerror = () => {
        stopPreview();
        message.error(t('form.minimax.previewPlayFailed'));
      };
      setLoadingPreviewId(null);
      setPlayingVoiceId(item.voice_id);
      await audio.play();
    } catch (e) {
      setLoadingPreviewId(null);
      setPlayingVoiceId(null);
      message.error(e instanceof Error ? e.message : t('form.minimax.previewLoadFailed'));
    }
  };

  const stopRecordingTimer = () => {
    if (recordTimerRef.current != null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    stopRecordingTimer();
  };

  const micBlockedReason = microphoneUnavailableReason();
  const micSupported = canUseMicrophoneCapture() && isMediaRecorderSupported();

  const startRecording = async () => {
    try {
      if (!micSupported) {
        message.warning(micBlockedReason ?? t('form.minimax.micUnsupported'));
        return;
      }
      const stream = await captureMicrophoneStream();
      const mimeType = pickMediaRecorderMimeType();
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const ext = rec.mimeType.includes('mp4') ? 'm4a' : 'webm';
        if (ext === 'webm') {
          message.warning(t('form.minimax.webmWarning'));
          return;
        }
        const file = new File([blob], `record-${Date.now()}.${ext}`, { type: blob.type });
        void handleCloneFile(file);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.micAccessFailed'));
    }
  };

  const handleCloneFile = async (file: File) => {
    const name = cloneName.trim() || file.name.replace(/\.[^.]+$/, '');
    setCloning(true);
    try {
      const result = await cloneMinimaxVoice(file, {
        voiceName: name,
        model: voiceModel,
        knowledgeFolderId: cloneFolderId?.trim() || undefined,
      });
      onChange({
        mode: 'clone',
        voice_id: result.voice_id,
        label: result.label || result.voice_id,
      });
      setTab('clone');
      message.success(
        result.virtual_folder_id
          ? t('form.minimax.cloneSuccessFolder')
          : cloneFolderId?.trim()
            ? t('form.minimax.cloneSuccessFolderWarn')
            : t('form.minimax.cloneSuccess')
      );
      if (result.demo_audio) {
        try {
          const audio = new Audio(result.demo_audio);
          void audio.play();
        } catch {
          // ignore
        }
      }
      void loadCloneVoices();
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.cloneFailed'));
    } finally {
      setCloning(false);
    }
  };

  const renderFilterChips = <T extends string>(
    options: { value: T; label: string }[],
    active: T,
    onSelect: (value: T) => void,
    ariaLabel: string,
  ) => (
    <div className="minimax-voice-field__filters" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`minimax-voice-field__filter${active === opt.value ? ' is-active' : ''}`}
          aria-pressed={active === opt.value}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const renderGrid = (mode: 'system' | 'clone', list: MinimaxVoiceItem[]) => {
    if (list.length === 0) {
      return (
        <div className="minimax-voice-field__empty">
          {mode === 'clone' ? t('form.minimax.noCloneVoices') : t('form.minimax.noMatchVoices')}
        </div>
      );
    }
    return (
      <div className="minimax-voice-field__grid-wrap">
        <div className="minimax-voice-field__grid">
          {list.map((item) => {
            const active = current.voice_id === item.voice_id && current.mode === mode;
            const isPlaying = playingVoiceId === item.voice_id;
            const isLoadingPreview = loadingPreviewId === item.voice_id;
            return (
              <button
                key={`${mode}-${item.voice_id}`}
                type="button"
                className={`minimax-voice-field__card${active ? ' is-active' : ''}`}
                onClick={() => selectVoice(mode, item)}
              >
                <div className="minimax-voice-field__card-head">
                  <div className="minimax-voice-field__card-name">{item.voice_name}</div>
                  {mode === 'system' ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className={`minimax-voice-field__preview-btn${isPlaying ? ' is-playing' : ''}${isLoadingPreview ? ' is-loading' : ''}`}
                      aria-label={isPlaying ? t('form.minimax.stopPreview') : t('form.minimax.previewVoice')}
                      aria-busy={isLoadingPreview}
                      onClick={(e) => void togglePreview(item, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          void togglePreview(item, e as unknown as React.MouseEvent);
                        }
                      }}
                    >
                      {isLoadingPreview ? (
                        <Loader2 size={14} className="minimax-voice-field__preview-spin" />
                      ) : isPlaying ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="minimax-voice-field__card-meta">
                  {mode === 'system' ? (
                    <>
                      <span className="minimax-voice-field__tag">{languageTag(item.language)}</span>
                      <span className="minimax-voice-field__tag">
                        {item.gender === 'male' ? t('form.minimax.tagMale') : item.gender === 'female' ? t('form.minimax.tagFemale') : t('form.minimax.tagOther')}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="minimax-voice-field__card-id">{item.voice_id}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="minimax-voice-field">
      <div className="minimax-voice-field__selected">
        <div className="minimax-voice-field__selected-main">
          <div className="minimax-voice-field__selected-label">
            {t('form.minimax.current', { label: current.label || current.voice_id })}
            <span className="minimax-voice-field__selected-badge">
              ({current.mode === 'clone' ? t('form.minimax.modeClone') : t('form.minimax.modeSystem')})
            </span>
          </div>
          <div className="minimax-voice-field__selected-id">{current.voice_id}</div>
        </div>
        <Button size="small" onClick={() => (tab === 'system' ? loadSystemVoices() : loadCloneVoices())}>
          {t('form.minimax.refresh')}
        </Button>
      </div>

      <div className="minimax-voice-field__tabs" role="tablist" aria-label={t("form.minimax.sourceAria")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'system'}
          className={`minimax-voice-field__tab${tab === 'system' ? ' is-active' : ''}`}
          onClick={() => setTab('system')}
        >
          {t('form.minimax.systemVoices')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clone'}
          className={`minimax-voice-field__tab${tab === 'clone' ? ' is-active' : ''}`}
          onClick={() => setTab('clone')}
        >
          {t('form.minimax.myClones')}
        </button>
      </div>

      <div className="minimax-voice-field__toolbar">
        <Input
          className="minimax-voice-field__search"
          allowClear
          placeholder={tab === 'system' ? t('form.minimax.searchSystem') : t('form.minimax.searchClone')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tab === 'system' ? (
        <>
          {renderFilterChips(genderOptions, genderFilter, setGenderFilter, t('form.minimax.genderFilterAria'))}
          {renderFilterChips(languageOptions, languageFilter, setLanguageFilter, t('form.minimax.languageFilterAria'))}
          {loadingSystem ? (
            <div className="minimax-voice-field__loading">
              <BrandLoading tip={t('form.minimax.loadingSystem')} />
            </div>
          ) : (
            <>
              <div className="minimax-voice-field__result-count">{t('form.minimax.voiceCount', { count: filteredSystem.length })}</div>
              {renderGrid('system', filteredSystem)}
            </>
          )}
        </>
      ) : (
        <div className="minimax-voice-field__clone-panel">
          <p className="minimax-voice-field__hint">
            {t('form.minimax.cloneHint')}
            {cloneFolderId?.trim()
              ? t('form.minimax.cloneHintFolder')
              : t('form.minimax.cloneHintNoFolder')}
            {!micSupported && micBlockedReason ? (
              <span className="minimax-voice-field__hint-warn"> {micBlockedReason}</span>
            ) : null}
          </p>
          <Input
            placeholder={t("form.minimax.cloneNamePlaceholder")}
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
            maxLength={32}
          />
          <div className="minimax-voice-field__clone-actions">
            <Upload
              accept={CLONE_ACCEPT}
              showUploadList={false}
              beforeUpload={(file) => {
                void handleCloneFile(file);
                return false;
              }}
            >
              <Button icon={<UploadIcon size={16} />} loading={cloning}>
                {t('form.minimax.uploadClone')}
              </Button>
            </Upload>
            {!recording ? (
              <Button
                icon={<Mic size={16} />}
                onClick={() => void startRecording()}
                disabled={cloning || !micSupported}
                title={micBlockedReason ?? undefined}
              >
                {t('form.minimax.micRecord')}
              </Button>
            ) : (
              <Button danger icon={<Square size={16} />} onClick={stopRecording}>
                {t('form.minimax.stopRecord', { sec: recordSeconds })}
              </Button>
            )}
          </div>
          {recording ? (
            <div className="minimax-voice-field__recording">
              <span className="minimax-voice-field__recording-dot" />
              {t('form.minimax.recordingHint')}
            </div>
          ) : null}
          {loadingClone ? (
            <div className="minimax-voice-field__loading">
              <BrandLoading size="small" />
            </div>
          ) : (
            renderGrid('clone', filteredClone)
          )}
        </div>
      )}
    </div>
  );
}
