/**
 * 多人语音：按人数编辑角色名 + 音色（系统/克隆/角色卡）
 */
import React, { useEffect } from 'react';
import { Button, Input, Space } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { MinimaxVoiceField } from './MinimaxVoiceField';

export type DialogueCastMember = {
  id: string;
  name: string;
  roleHint?: string;
  voice?: {
    mode?: string;
    voice_id?: string;
    label?: string;
    character_folder_id?: string;
  };
  persona?: string;
};

const DEFAULT_VOICES = [
  { mode: 'system', voice_id: 'female-shaonv', label: '少女音色' },
  { mode: 'system', voice_id: 'male-qn-qingse', label: '青涩青年音色' },
  { mode: 'system', voice_id: 'female-yujie', label: '御姐音色' },
  { mode: 'system', voice_id: 'presenter_male', label: '男性主持人' },
  { mode: 'system', voice_id: 'presenter_female', label: '女性主持人' },
  { mode: 'system', voice_id: 'audiobook_male_1', label: '有声书男声' },
];

function defaultName(index: number): string {
  const names = ['主持', '嘉宾', '嘉宾二', '旁白', '角色五', '角色六'];
  return names[index] ?? `角色${index + 1}`;
}

function defaultRoleHint(index: number): string {
  if (index === 0) return 'host';
  if (index === 1) return 'guest';
  return 'character';
}

export function normalizeDialogueCast(
  cast: DialogueCastMember[] | undefined,
  speakerCount: number
): DialogueCastMember[] {
  const n = Math.min(6, Math.max(2, Math.round(speakerCount) || 2));
  const prev = Array.isArray(cast) ? cast : [];
  const next: DialogueCastMember[] = [];
  for (let i = 0; i < n; i++) {
    const existing = prev[i];
    const voice = existing?.voice?.voice_id
      ? existing.voice
      : { ...DEFAULT_VOICES[i % DEFAULT_VOICES.length]! };
    next.push({
      id: existing?.id?.trim() || (i === 0 ? 'host' : i === 1 ? 'guest' : `s${i + 1}`),
      name: existing?.name?.trim() || defaultName(i),
      roleHint: existing?.roleHint || defaultRoleHint(i),
      voice,
      persona: existing?.persona ?? '',
    });
  }
  return next;
}

type DialogueCastFieldProps = {
  value?: DialogueCastMember[];
  speakerCount?: number;
  onChange?: (next: DialogueCastMember[]) => void;
  disabled?: boolean;
};

export function DialogueCastField({
  value,
  speakerCount = 2,
  onChange,
  disabled,
}: DialogueCastFieldProps) {
  const cast = normalizeDialogueCast(value, speakerCount);

  useEffect(() => {
    const normalized = normalizeDialogueCast(value, speakerCount);
    const sameLen = (value?.length ?? 0) === normalized.length;
    const sameIds =
      sameLen &&
      normalized.every((m, i) => m.id === value?.[i]?.id && m.voice?.voice_id === value?.[i]?.voice?.voice_id);
    if (!sameIds) onChange?.(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerCount]);

  const updateAt = (index: number, patch: Partial<DialogueCastMember>) => {
    const next = cast.map((m, i) => (i === index ? { ...m, ...patch } : m));
    onChange?.(next);
  };

  return (
    <div className="space-y-3">
      {cast.map((member, index) => (
        <div
          key={member.id}
          className="rounded-lg border border-slate-200/80 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/40"
        >
          <div className="mb-2 flex items-center gap-2">
            <Input
              disabled={disabled}
              value={member.name}
              placeholder="角色名"
              className="max-w-[10rem]"
              onChange={(e) => updateAt(index, { name: e.target.value })}
            />
            <span className="text-xs text-slate-500">音色</span>
          </div>
          <MinimaxVoiceField
            value={member.voice as any}
            voiceModel="speech-2.8-hd"
            onChange={(voice) => {
              updateAt(index, { voice: voice as DialogueCastMember['voice'] });
            }}
            onPersonaSuggest={(persona, meta) => {
              if (meta?.status === 'loading') return;
              updateAt(index, { persona });
            }}
          />
          <Input.TextArea
            className="mt-2"
            disabled={disabled}
            rows={2}
            placeholder="人设（可选）：选音色后由模型生成草稿，可改；语气词勿句句硬塞"
            value={member.persona || ''}
            onChange={(e) => updateAt(index, { persona: e.target.value })}
          />
        </div>
      ))}
      <Space>
        <Button
          size="small"
          icon={<PlusOutlined />}
          disabled={disabled || cast.length >= 6}
          onClick={() => onChange?.(normalizeDialogueCast(cast, cast.length + 1))}
        >
          加一人
        </Button>
        <Button
          size="small"
          icon={<DeleteOutlined />}
          disabled={disabled || cast.length <= 2}
          onClick={() => onChange?.(normalizeDialogueCast(cast, cast.length - 1))}
        >
          少一人
        </Button>
      </Space>
    </div>
  );
}
