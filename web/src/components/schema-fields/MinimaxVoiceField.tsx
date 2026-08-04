import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Input, Upload } from 'antd';
import BrandLoading from '../BrandLoading';
import { Loader2, Mic, Pause, Play, Square, Upload as UploadIcon, UserRound } from 'lucide-react';
import {
  cloneMinimaxVoice,
  getKnowledgeFolders,
  getSystemKnowledgeFolders,
  listMinimaxVoices,
  listMinimaxVoicesFromFolder,
  type FolderItem,
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
import { resolveHostPersona } from '../../shared/hostPersonaFromVoice';
import { resolveHostPersonaAsync } from '../../shared/resolveHostPersonaAsync';
import './minimax-voice-field.css';

export type MinimaxVoiceValue = {
  mode: 'system' | 'clone' | 'character';
  voice_id: string;
  label?: string;
  /** 从角色卡选用时回写，便于展示与后续注入 */
  character_folder_id?: string;
  character_folder_label?: string;
};

type MinimaxVoiceFieldProps = {
  value: unknown;
  voiceModel?: string;
  cloneFolderId?: string;
  onChange: (next: MinimaxVoiceValue) => void;
  /**
   * 选音色后建议主播人设。
   * 系统音色：先 loading，再由 LLM 回填；角色卡同步；克隆为空。
   */
  onPersonaSuggest?: (persona: string, meta?: { status: 'ready' | 'loading' | 'empty' }) => void;
};

type GenderFilter = 'all' | 'male' | 'female' | 'other';
type LanguageFilter = 'all' | 'zh' | 'en' | 'other';
type VoiceTab = 'system' | 'clone' | 'character';

type CharacterVoiceRow = {
  folder: FolderItem;
  displayName: string;
  /** 角色卡 summary 中绑定的 voice_id */
  boundVoiceId: string;
};

const DEFAULT_VALUE: MinimaxVoiceValue = {
  mode: 'system',
  voice_id: 'female-shaonv',
  label: '',
};

const CLONE_ACCEPT = 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/m4a,.mp3,.wav,.m4a';

function readCharacterBoundVoice(folder: FolderItem): {
  voiceId: string;
  displayName: string;
  character: Record<string, unknown> | null;
} {
  const summary = (folder.card_summary ?? null) as { character?: Record<string, unknown> } | null;
  const ch = summary?.character && typeof summary.character === 'object' ? summary.character : null;
  const voiceId = typeof ch?.voice_id === 'string' ? ch.voice_id.trim() : '';
  const displayName =
    (typeof ch?.display_name === 'string' && ch.display_name.trim()) || folder.name || folder.id;
  return { voiceId, displayName, character: ch };
}

function normalizeValue(raw: unknown): MinimaxVoiceValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_VALUE };
  const o = raw as Record<string, unknown>;
  const voiceId = typeof o.voice_id === 'string' && o.voice_id.trim() ? o.voice_id.trim() : DEFAULT_VALUE.voice_id;
  const mode: MinimaxVoiceValue['mode'] =
    o.mode === 'clone' ? 'clone' : o.mode === 'character' ? 'character' : 'system';
  const label = typeof o.label === 'string' && o.label.trim() ? o.label.trim() : voiceId;
  const character_folder_id =
    typeof o.character_folder_id === 'string' && o.character_folder_id.trim()
      ? o.character_folder_id.trim()
      : undefined;
  const character_folder_label =
    typeof o.character_folder_label === 'string' && o.character_folder_label.trim()
      ? o.character_folder_label.trim()
      : undefined;
  return { mode, voice_id: voiceId, label, character_folder_id, character_folder_label };
}

function matchesGender(voice: MinimaxVoiceItem, filter: GenderFilter): boolean {
  if (filter === 'all') return true;
  return (voice.gender ?? 'other') === filter;
}

function matchesLanguage(voice: MinimaxVoiceItem, filter: LanguageFilter): boolean {
  if (filter === 'all') return true;
  return (voice.language ?? 'other') === filter;
}

function statusLabel(status: FolderItem['card_status'], t: (k: string) => string): string {
  if (status === 'ready') return t('form.minimax.charReady');
  if (status === 'parsing') return t('form.minimax.charParsing');
  if (status === 'failed') return t('form.minimax.charFailed');
  return t('form.minimax.charIdle');
}

export function MinimaxVoiceField({
  value,
  voiceModel = 'speech-2.8-hd',
  cloneFolderId,
  onChange,
  onPersonaSuggest,
}: MinimaxVoiceFieldProps) {
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

  const initialTab: VoiceTab =
    current.mode === 'clone' ? 'clone' : current.mode === 'character' ? 'character' : 'system';
  const [tab, setTab] = useState<VoiceTab>(initialTab);
  const [systemVoices, setSystemVoices] = useState<MinimaxVoiceItem[]>([]);
  const [cloneVoices, setCloneVoices] = useState<MinimaxVoiceItem[]>([]);
  const [characterRows, setCharacterRows] = useState<CharacterVoiceRow[]>([]);
  const [characterFolderVoices, setCharacterFolderVoices] = useState<Record<string, MinimaxVoiceItem[]>>({});
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(
    current.character_folder_id ?? null
  );
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [loadingClone, setLoadingClone] = useState(false);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [loadingCharacterFolderId, setLoadingCharacterFolderId] = useState<string | null>(null);
  const [systemLoaded, setSystemLoaded] = useState(false);
  const [charactersLoaded, setCharactersLoaded] = useState(false);
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
  const personaSuggestSeqRef = useRef(0);
  /** 角色卡 Tab 下「克隆到此角色」目标夹 */
  const [cloneTargetFolderId, setCloneTargetFolderId] = useState<string | null>(null);

  const effectiveCloneFolderId =
    (tab === 'character' && cloneTargetFolderId?.trim()) || cloneFolderId?.trim() || undefined;

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

  const loadCharacterFolderVoices = useCallback(async (folderId: string): Promise<MinimaxVoiceItem[]> => {
    setLoadingCharacterFolderId(folderId);
    try {
      const list = await listMinimaxVoicesFromFolder(folderId);
      setCharacterFolderVoices((prev) => ({ ...prev, [folderId]: list }));
      return list;
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.loadCloneFailed'));
      setCharacterFolderVoices((prev) => ({ ...prev, [folderId]: [] }));
      return [];
    } finally {
      setLoadingCharacterFolderId(null);
    }
  }, [message, t]);

  const loadCharacterCards = useCallback(async () => {
    setLoadingCharacters(true);
    try {
      const mine = await getKnowledgeFolders({ force: true });
      const filtered = mine.filter((f) => f.card_tag === 'character');
      const sys = await getSystemKnowledgeFolders('character');
      const seen = new Set(filtered.map((f) => f.id));
      const merged = [...filtered, ...sys.filter((s) => !seen.has(s.id))];
      merged.sort((a, b) => {
        const ra = a.card_status === 'ready' ? 0 : 1;
        const rb = b.card_status === 'ready' ? 0 : 1;
        if (ra !== rb) return ra - rb;
        if (Boolean(a.is_system) !== Boolean(b.is_system)) return a.is_system ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '', 'zh');
      });
      const rows: CharacterVoiceRow[] = merged.map((folder) => {
        const { voiceId, displayName } = readCharacterBoundVoice(folder);
        return { folder, displayName, boundVoiceId: voiceId };
      });
      setCharacterRows(rows);
      setCharactersLoaded(true);

      // 未在 summary 绑音色的就绪卡：静默拉文件夹内克隆音色，便于一眼可见
      const needProbe = rows
        .filter((r) => !r.boundVoiceId && r.folder.card_status === 'ready')
        .slice(0, 16);
      await Promise.all(
        needProbe.map(async (r) => {
          try {
            const list = await listMinimaxVoicesFromFolder(r.folder.id);
            setCharacterFolderVoices((prev) => ({ ...prev, [r.folder.id]: list }));
          } catch {
            setCharacterFolderVoices((prev) => ({ ...prev, [r.folder.id]: [] }));
          }
        })
      );
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.loadCharacterFailed'));
    } finally {
      setLoadingCharacters(false);
    }
  }, [message, t]);

  useEffect(() => {
    if (tab === 'system' && !systemLoaded) void loadSystemVoices();
  }, [tab, systemLoaded, loadSystemVoices]);

  useEffect(() => {
    if (tab === 'clone') void loadCloneVoices();
  }, [tab, loadCloneVoices, cloneFolderId]);

  useEffect(() => {
    if (tab === 'character' && !charactersLoaded) void loadCharacterCards();
  }, [tab, charactersLoaded, loadCharacterCards]);

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

  const filteredCharacters = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return characterRows;
    return characterRows.filter((row) => {
      const voices = characterFolderVoices[row.folder.id] ?? [];
      return (
        row.displayName.toLowerCase().includes(q) ||
        row.folder.name.toLowerCase().includes(q) ||
        row.boundVoiceId.toLowerCase().includes(q) ||
        voices.some(
          (v) => v.voice_name.toLowerCase().includes(q) || v.voice_id.toLowerCase().includes(q)
        )
      );
    });
  }, [characterRows, characterFolderVoices, search]);

  const selectVoice = (mode: 'system' | 'clone', item: MinimaxVoiceItem) => {
    onChange({
      mode,
      voice_id: item.voice_id,
      label: item.voice_name || item.voice_id,
    });
    if (!onPersonaSuggest) return;
    if (mode === 'clone') {
      personaSuggestSeqRef.current += 1;
      onPersonaSuggest('', { status: 'empty' });
      return;
    }
    const seq = ++personaSuggestSeqRef.current;
    onPersonaSuggest('', { status: 'loading' });
    void resolveHostPersonaAsync({
      kind: 'system',
      label: item.voice_name || item.voice_id,
      descriptions: item.description,
      voiceId: item.voice_id,
    }).then((persona) => {
      if (seq !== personaSuggestSeqRef.current) return;
      onPersonaSuggest(persona, { status: persona ? 'ready' : 'empty' });
    });
  };

  const selectCharacterVoice = (
    row: CharacterVoiceRow,
    voiceId: string,
    voiceLabel?: string
  ) => {
    const name = voiceLabel?.trim() || voiceId;
    onChange({
      mode: 'character',
      voice_id: voiceId,
      label: `${row.displayName} · ${name}`,
      character_folder_id: row.folder.id,
      character_folder_label: row.displayName,
    });
    setExpandedCharacterId(row.folder.id);
    setCloneTargetFolderId(row.folder.id);
    if (onPersonaSuggest) {
      personaSuggestSeqRef.current += 1;
      const { character } = readCharacterBoundVoice(row.folder);
      const persona = resolveHostPersona({ kind: 'character', character: character ?? {} });
      onPersonaSuggest(persona, { status: persona ? 'ready' : 'empty' });
    }
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

  const togglePreview = async (item: MinimaxVoiceItem, event: ReactMouseEvent) => {
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

  const handleCloneFile = async (file: File, folderIdOverride?: string) => {
    const name = cloneName.trim() || file.name.replace(/\.[^.]+$/, '');
    const targetFolder = (folderIdOverride ?? effectiveCloneFolderId)?.trim() || undefined;
    setCloning(true);
    try {
      const result = await cloneMinimaxVoice(file, {
        voiceName: name,
        model: voiceModel,
        knowledgeFolderId: targetFolder,
      });
      if (targetFolder && tab === 'character') {
        const row = characterRows.find((r) => r.folder.id === targetFolder);
        if (row) {
          selectCharacterVoice(row, result.voice_id, result.label || result.voice_id);
        } else {
          onChange({
            mode: 'character',
            voice_id: result.voice_id,
            label: result.label || result.voice_id,
            character_folder_id: targetFolder,
          });
        }
        void loadCharacterFolderVoices(targetFolder);
      } else {
        onChange({
          mode: 'clone',
          voice_id: result.voice_id,
          label: result.label || result.voice_id,
        });
        setTab('clone');
        void loadCloneVoices();
      }
      message.success(
        result.virtual_folder_id
          ? t('form.minimax.cloneSuccessFolder')
          : targetFolder
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
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('form.minimax.cloneFailed'));
    } finally {
      setCloning(false);
    }
  };

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
        stream.getTracks().forEach((track) => track.stop());
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

  const handleCharacterActivate = async (row: CharacterVoiceRow) => {
    setExpandedCharacterId(row.folder.id);
    setCloneTargetFolderId(row.folder.id);

    if (row.boundVoiceId) {
      selectCharacterVoice(row, row.boundVoiceId);
      return;
    }

    const cached = characterFolderVoices[row.folder.id];
    const voices = cached ?? (await loadCharacterFolderVoices(row.folder.id));
    if (voices.length === 1) {
      selectCharacterVoice(row, voices[0].voice_id, voices[0].voice_name);
      return;
    }
    if (voices.length === 0) {
      message.info(t('form.minimax.characterNoVoiceHint'));
    }
  };

  const refreshCurrentTab = () => {
    if (tab === 'system') void loadSystemVoices();
    else if (tab === 'clone') void loadCloneVoices();
    else {
      setCharactersLoaded(false);
      void loadCharacterCards();
    }
  };

  const modeBadge =
    current.mode === 'clone'
      ? t('form.minimax.modeClone')
      : current.mode === 'character'
        ? t('form.minimax.modeCharacter')
        : t('form.minimax.modeSystem');

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
                          void togglePreview(item, e as unknown as ReactMouseEvent);
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

  const renderCharacterPanel = () => {
    if (loadingCharacters && characterRows.length === 0) {
      return (
        <div className="minimax-voice-field__loading">
          <BrandLoading tip={t('form.minimax.loadingCharacters')} />
        </div>
      );
    }
    if (filteredCharacters.length === 0) {
      return <div className="minimax-voice-field__empty">{t('form.minimax.noCharacterCards')}</div>;
    }

    return (
      <div className="minimax-voice-field__char-list">
        {filteredCharacters.map((row) => {
          const folderVoices = characterFolderVoices[row.folder.id] ?? [];
          const expanded = expandedCharacterId === row.folder.id;
          const active =
            current.mode === 'character' && current.character_folder_id === row.folder.id;
          const primaryVoiceId = row.boundVoiceId || (folderVoices.length === 1 ? folderVoices[0].voice_id : '');
          const hasVoice = Boolean(row.boundVoiceId || folderVoices.length > 0);
          const busy = loadingCharacterFolderId === row.folder.id;

          return (
            <div
              key={row.folder.id}
              className={`minimax-voice-field__char-card${active ? ' is-active' : ''}${expanded ? ' is-expanded' : ''}`}
            >
              <button
                type="button"
                className="minimax-voice-field__char-main"
                onClick={() => void handleCharacterActivate(row)}
              >
                <span className="minimax-voice-field__char-icon" aria-hidden>
                  <UserRound size={18} strokeWidth={1.75} />
                </span>
                <span className="minimax-voice-field__char-copy">
                  <span className="minimax-voice-field__char-name">
                    {row.displayName}
                    {row.folder.is_system ? (
                      <span className="minimax-voice-field__char-sys">{t('form.minimax.charSystem')}</span>
                    ) : null}
                  </span>
                  <span className="minimax-voice-field__char-meta">
                    <span className="minimax-voice-field__tag">{statusLabel(row.folder.card_status, t)}</span>
                    {hasVoice ? (
                      <span className="minimax-voice-field__tag minimax-voice-field__tag--voice">
                        {row.boundVoiceId
                          ? t('form.minimax.characterBoundVoice')
                          : t('form.minimax.characterFolderVoices', { count: folderVoices.length })}
                      </span>
                    ) : (
                      <span className="minimax-voice-field__tag minimax-voice-field__tag--muted">
                        {t('form.minimax.characterNoVoice')}
                      </span>
                    )}
                  </span>
                  {primaryVoiceId ? (
                    <span className="minimax-voice-field__char-voice-id">{primaryVoiceId}</span>
                  ) : null}
                </span>
                {busy ? <BrandLoading size="small" /> : null}
              </button>

              {expanded ? (
                <div className="minimax-voice-field__char-detail">
                  {folderVoices.length > 1 ? (
                    <div className="minimax-voice-field__char-voices">
                      {folderVoices.map((v) => {
                        const voiceActive =
                          current.mode === 'character' && current.voice_id === v.voice_id;
                        return (
                          <button
                            key={v.voice_id}
                            type="button"
                            className={`minimax-voice-field__char-voice${voiceActive ? ' is-active' : ''}`}
                            onClick={() => selectCharacterVoice(row, v.voice_id, v.voice_name)}
                          >
                            <span className="minimax-voice-field__char-voice-name">{v.voice_name}</span>
                            <span className="minimax-voice-field__char-voice-id">{v.voice_id}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {!row.boundVoiceId && folderVoices.length === 0 ? (
                    <div className="minimax-voice-field__char-clone">
                      <p className="minimax-voice-field__hint">{t('form.minimax.characterCloneHint')}</p>
                      <Input
                        placeholder={t('form.minimax.cloneNamePlaceholder')}
                        value={cloneName}
                        onChange={(e) => setCloneName(e.target.value)}
                        maxLength={32}
                      />
                      <div className="minimax-voice-field__clone-actions">
                        <Upload
                          accept={CLONE_ACCEPT}
                          showUploadList={false}
                          beforeUpload={(file) => {
                            void handleCloneFile(file, row.folder.id);
                            return false;
                          }}
                        >
                          <Button icon={<UploadIcon size={16} />} loading={cloning} size="small">
                            {t('form.minimax.uploadClone')}
                          </Button>
                        </Upload>
                        {!recording ? (
                          <Button
                            size="small"
                            icon={<Mic size={16} />}
                            onClick={() => {
                              setCloneTargetFolderId(row.folder.id);
                              void startRecording();
                            }}
                            disabled={cloning || !micSupported}
                            title={micBlockedReason ?? undefined}
                          >
                            {t('form.minimax.micRecord')}
                          </Button>
                        ) : (
                          <Button danger size="small" icon={<Square size={16} />} onClick={stopRecording}>
                            {t('form.minimax.stopRecord', { sec: recordSeconds })}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const searchPlaceholder =
    tab === 'system'
      ? t('form.minimax.searchSystem')
      : tab === 'clone'
        ? t('form.minimax.searchClone')
        : t('form.minimax.searchCharacter');

  return (
    <div className="minimax-voice-field">
      <div className="minimax-voice-field__selected">
        <div className="minimax-voice-field__selected-main">
          <div className="minimax-voice-field__selected-label">
            {t('form.minimax.current', { label: current.label || current.voice_id })}
            <span className="minimax-voice-field__selected-badge">({modeBadge})</span>
          </div>
          <div className="minimax-voice-field__selected-id">{current.voice_id}</div>
        </div>
        <Button size="small" onClick={refreshCurrentTab}>
          {t('form.minimax.refresh')}
        </Button>
      </div>

      <div className="minimax-voice-field__tabs" role="tablist" aria-label={t('form.minimax.sourceAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'system'}
          className={`minimax-voice-field__tab${tab === 'system' ? ' is-active' : ''}`}
          onClick={() => {
            setSearch('');
            setTab('system');
          }}
        >
          {t('form.minimax.systemVoices')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'character'}
          className={`minimax-voice-field__tab${tab === 'character' ? ' is-active' : ''}`}
          onClick={() => {
            setSearch('');
            setTab('character');
          }}
        >
          {t('form.minimax.characterCards')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clone'}
          className={`minimax-voice-field__tab${tab === 'clone' ? ' is-active' : ''}`}
          onClick={() => {
            setSearch('');
            setTab('clone');
          }}
        >
          {t('form.minimax.myClones')}
        </button>
      </div>

      <div className="minimax-voice-field__toolbar">
        <Input
          className="minimax-voice-field__search"
          allowClear
          placeholder={searchPlaceholder}
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
      ) : null}

      {tab === 'character' ? (
        <>
          <p className="minimax-voice-field__hint">{t('form.minimax.characterTabHint')}</p>
          <div className="minimax-voice-field__result-count">
            {t('form.minimax.characterCount', { count: filteredCharacters.length })}
          </div>
          {renderCharacterPanel()}
        </>
      ) : null}

      {tab === 'clone' ? (
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
            placeholder={t('form.minimax.cloneNamePlaceholder')}
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
      ) : null}
    </div>
  );
}
