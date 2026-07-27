import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  AudioLines,
  BookOpenText,
  File,
  FileText,
  ImageIcon,
  UserCircle2,
  Video,
} from 'lucide-react';
import type { AssetMediaKind } from './types';

const KIND_ICONS: Record<AssetMediaKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  music: AudioLines,
  writing: FileText,
  outline: BookOpenText,
  character: UserCircle2,
  file: File,
  generic: File,
};

const KIND_KEYS: Record<AssetMediaKind, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  music: 'music',
  writing: 'writing',
  outline: 'outline',
  character: 'character',
  file: 'file',
  generic: 'generic',
};

export type KindMeta = {
  icon: LucideIcon;
  label: string;
  stageMessage: string;
  stageSubmessage?: string;
};

export function getKindMeta(kind: AssetMediaKind, t: TFunction): KindMeta {
  const key = KIND_KEYS[kind];
  return {
    icon: KIND_ICONS[kind],
    label: t(`common.assetLoading.${key}.label`),
    stageMessage: t(`common.assetLoading.${key}.stageMessage`),
    stageSubmessage: t(`common.assetLoading.${key}.stageSubmessage`, { defaultValue: '' }) || undefined,
  };
}

/** @deprecated 使用 getKindMeta(kind, t) */
export const KIND_META: Record<AssetMediaKind, KindMeta> = {
  image: {
    icon: ImageIcon,
    label: '图片',
    stageMessage: '正在加载生成结果…',
    stageSubmessage: '拉取鉴权媒体资源',
  },
  video: {
    icon: Video,
    label: '视频',
    stageMessage: '正在加载视频资源…',
    stageSubmessage: '准备播放器与流数据',
  },
  audio: {
    icon: AudioLines,
    label: '音频',
    stageMessage: '正在加载音频资源…',
    stageSubmessage: '解码音频流',
  },
  music: {
    icon: AudioLines,
    label: '音乐',
    stageMessage: '正在加载音乐资源…',
    stageSubmessage: '拉取音频文件',
  },
  writing: {
    icon: FileText,
    label: '文稿',
    stageMessage: '正在加载文稿内容…',
    stageSubmessage: '组装写作结果',
  },
  outline: {
    icon: BookOpenText,
    label: '大纲',
    stageMessage: '正在加载大纲内容…',
    stageSubmessage: '解析结构化文本',
  },
  character: {
    icon: UserCircle2,
    label: '角色',
    stageMessage: '正在加载角色资产…',
    stageSubmessage: '拉取头像与资料',
  },
  file: {
    icon: File,
    label: '文件',
    stageMessage: '正在加载文件…',
    stageSubmessage: '读取云端存储',
  },
  generic: {
    icon: File,
    label: '资产',
    stageMessage: '正在加载内容…',
    stageSubmessage: '请稍候',
  },
};
