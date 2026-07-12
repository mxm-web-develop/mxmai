/**
 * 确定性语篇分段器（A0 智能核心）
 *
 * 目标：让分镜切点贴合整段口播的语篇结构，而非纯按秒数平均切块。
 * - 识别开场白（大家好…）、章节转场（下面我们来看…）、结尾（总之…）
 * - 以语篇边界为优先切点，长段再按 cut_rhythm 的 min/max 细分，碎段吸附相邻
 * - 每个 window 标注 beatRole：opening | transition | body | closing
 *
 * 纯函数、无 LLM、可单测。由 planRhythmWindows 调用。
 */
import type { VoiceoverSubtitleLike } from './timeline-segment-types';

export type BeatRole = 'opening' | 'transition' | 'body' | 'closing';

export type DiscourseSegment = {
  startSeconds: number;
  endSeconds: number;
  /** 覆盖的句级字幕下标 [first, last]（含端点） */
  subtitleSpan: [number, number];
  voiceoverText: string;
  beatRole: BeatRole;
};

/** 开场白标记（仅在开头若干句判定） */
const OPENING_MARKERS = [
  '大家好',
  '大家',
  '哈喽',
  '哈啰',
  '各位',
  '欢迎',
  '今天我们',
  '今天来',
  '今天聊',
  '今天说',
  '今天讲',
  '今天要',
  '这期',
  '本期',
  '本视频',
  '我是',
  'hello',
  'hi',
];

/** 章节转场标记（多出现在句首，触发新语义段起点） */
const TRANSITION_MARKERS = [
  '下面',
  '接下来',
  '接着',
  '然后我们',
  '首先',
  '其次',
  '再次',
  '再来看',
  '再来说',
  '再看',
  '我们来看',
  '我们再看',
  '我们来说',
  '来看看',
  '来看一下',
  '说到',
  '说回',
  '回到',
  '另一方面',
  '另外',
  '除此之外',
  '与此同时',
  '那么',
  '第一',
  '第二',
  '第三',
  '第四',
  '第五',
  '先说',
  '先看',
  '值得一提',
  '值得注意',
  '更重要的是',
  '问题来了',
  '换句话说',
  '不仅如此',
];

/** 结尾标记（仅在末尾若干句判定） */
const CLOSING_MARKERS = [
  '总之',
  '总的来说',
  '综上',
  '综上所述',
  '最后',
  '好了',
  '以上就是',
  '以上',
  '这就是',
  '感谢',
  '谢谢',
  '点赞',
  '关注',
  '订阅',
  '我们下期',
  '下期见',
  '再见',
  '就到这里',
  '就聊到这',
];

/** 去掉句首标点/空白后小写，便于匹配 */
function normalizeHead(text: string): string {
  return text
    .replace(/^[\s，。、；：,.!?！？"'「」『』（）()\-—…·]+/u, '')
    .trim()
    .toLowerCase();
}

function startsWithMarker(text: string, markers: string[]): boolean {
  const head = normalizeHead(text);
  if (!head) return false;
  return markers.some((m) => head.startsWith(m.toLowerCase()));
}

/**
 * 在句级字幕区间 [from, to)（to 不含）内按 min/max 秒数贪心切分，返回句下标区间列表。
 * 不跨越传入区间边界，从而保证语篇边界不被合并。
 */
function splitSentenceRange(
  subs: VoiceoverSubtitleLike[],
  from: number,
  to: number,
  minCut: number,
  maxCut: number
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = from;
  while (i < to) {
    const chunkStart = subs[i]!.startSeconds;
    let lastIdx = i;
    let j = i;
    while (j < to) {
      const spanEnd = j + 1 < to ? subs[j + 1]!.startSeconds : subs[j]!.endSeconds;
      const spanDur = spanEnd - chunkStart;
      if (j > i && spanDur > maxCut) break;
      lastIdx = j;
      j++;
      if (spanDur >= minCut) {
        if (j >= to) break;
        const nextEnd = j + 1 < to ? subs[j + 1]!.startSeconds : subs[j]!.endSeconds;
        if (nextEnd - chunkStart > maxCut) break;
      }
    }
    ranges.push([i, lastIdx]);
    i = lastIdx + 1;
  }
  return ranges;
}

type Section = {
  from: number;
  to: number;
  /** 首窗角色（章节起点用 transition，普通正文用 body） */
  leadRole: BeatRole;
  /** 后续窗角色 */
  bodyRole: BeatRole;
};

/** 判定开场白覆盖的句数（0 表示无明显开场白） */
function detectOpeningCount(subs: VoiceoverSubtitleLike[], maxCut: number): number {
  if (!subs.length) return 0;
  if (!startsWithMarker(subs[0]!.text, OPENING_MARKERS)) return 0;
  const openStart = subs[0]!.startSeconds;
  let count = 1;
  // 开场白最多吸附到第 3 句、且总时长不超过 maxCut、遇到转场标记即停
  while (
    count < subs.length &&
    count < 3 &&
    subs[count]!.endSeconds - openStart <= maxCut &&
    !startsWithMarker(subs[count]!.text, TRANSITION_MARKERS)
  ) {
    // 仅当当前开场过短（<2.5s）或后一句仍是开场语气时继续吸附
    const soFar = subs[count - 1]!.endSeconds - openStart;
    const nextLooksIntro = startsWithMarker(subs[count]!.text, OPENING_MARKERS);
    if (soFar >= 2.5 && !nextLooksIntro) break;
    count++;
  }
  return count;
}

/** 判定结尾覆盖的起始句下标（-1 表示无明显结尾） */
function detectClosingStart(
  subs: VoiceoverSubtitleLike[],
  bodyStart: number,
  minCut: number,
  maxCut: number
): number {
  const n = subs.length;
  if (n === 0) return -1;
  // 从后往前找连续的结尾语气句，且结尾段不超过 maxCut 且句数不超过 3
  let start = -1;
  for (let i = n - 1; i >= bodyStart; i--) {
    if (startsWithMarker(subs[i]!.text, CLOSING_MARKERS)) {
      start = i;
    } else if (start >= 0) {
      break;
    }
    if (start >= 0 && (n - start >= 3 || subs[n - 1]!.endSeconds - subs[start]!.startSeconds > maxCut)) {
      break;
    }
  }
  // 结尾段不能吞掉整段正文
  if (start >= 0 && start <= bodyStart) return -1;
  return start;
}

/**
 * 句级字幕 → 语篇感知的分段（含 beatRole）。
 * 无字幕时返回空数组，由调用方回退到定长窗。
 */
export function planDiscourseSegments(
  segments: VoiceoverSubtitleLike[],
  totalDuration: number,
  minCutSeconds: number,
  maxCutSeconds: number
): DiscourseSegment[] {
  const minCut = Math.max(0.5, minCutSeconds);
  const maxCut = Math.max(minCut, maxCutSeconds);
  const total = Math.max(0.1, totalDuration);

  const subs = [...segments]
    .filter(
      (s) => s.text.trim() && Number.isFinite(s.startSeconds) && Number.isFinite(s.endSeconds)
    )
    .sort((a, b) => a.startSeconds - b.startSeconds);

  if (!subs.length) return [];
  const n = subs.length;

  const openingCount = detectOpeningCount(subs, maxCut);
  const bodyStart = openingCount;
  const closingStart = detectClosingStart(subs, bodyStart, minCut, maxCut);
  const bodyEnd = closingStart >= 0 ? closingStart : n;

  const sections: Section[] = [];

  if (openingCount > 0) {
    sections.push({ from: 0, to: openingCount, leadRole: 'opening', bodyRole: 'opening' });
  }

  // 正文按转场标记切成多段；每段首窗为 transition（若由转场标记触发）否则 body
  let segStart = bodyStart;
  for (let i = bodyStart; i < bodyEnd; i++) {
    const isBoundary = i > bodyStart && startsWithMarker(subs[i]!.text, TRANSITION_MARKERS);
    if (isBoundary) {
      sections.push({ from: segStart, to: i, leadRole: leadRoleFor(segStart, bodyStart), bodyRole: 'body' });
      segStart = i;
    }
  }
  if (segStart < bodyEnd) {
    sections.push({ from: segStart, to: bodyEnd, leadRole: leadRoleFor(segStart, bodyStart), bodyRole: 'body' });
  }

  if (closingStart >= 0) {
    sections.push({ from: closingStart, to: n, leadRole: 'closing', bodyRole: 'closing' });
  }

  // 每个 section 内部按时长细分
  const rawWindows: Array<{ span: [number, number]; role: BeatRole }> = [];
  for (const section of sections) {
    const ranges = splitSentenceRange(subs, section.from, section.to, minCut, maxCut);
    ranges.forEach((span, idx) => {
      rawWindows.push({ span, role: idx === 0 ? section.leadRole : section.bodyRole });
    });
  }

  if (!rawWindows.length) return [];

  // 转为连续时间窗
  const windows: DiscourseSegment[] = rawWindows.map(({ span, role }) => {
    const [a, z] = span;
    return {
      startSeconds: subs[a]!.startSeconds,
      endSeconds: subs[z]!.endSeconds,
      subtitleSpan: [a, z],
      voiceoverText: subs
        .slice(a, z + 1)
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join(' '),
      beatRole: role,
    };
  });

  return finalizeWindows(windows, total, minCut);
}

/** 章节首段：正文起点的第一段标记为 body（承接开场），其后由转场触发的才是 transition */
function leadRoleFor(segStart: number, bodyStart: number): BeatRole {
  return segStart === bodyStart ? 'body' : 'transition';
}

/** 时间连续性修正 + 碎窗吸附 */
function finalizeWindows(
  windows: DiscourseSegment[],
  total: number,
  minCut: number
): DiscourseSegment[] {
  const sorted = [...windows].sort((a, b) => a.startSeconds - b.startSeconds);
  if (sorted[0]!.startSeconds > 0) sorted[0]!.startSeconds = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    sorted[i]!.endSeconds = sorted[i + 1]!.startSeconds;
  }
  sorted[sorted.length - 1]!.endSeconds = total;

  // 吸附过短窗（正文 <1.5s 或末窗 <minCut*0.7）到前一窗，保留前窗角色
  const floor = Math.min(1.5, minCut * 0.6);
  const merged: DiscourseSegment[] = [];
  for (const w of sorted) {
    const dur = w.endSeconds - w.startSeconds;
    const prev = merged[merged.length - 1];
    const tooShort =
      prev &&
      ((w.beatRole === 'body' && dur < floor) ||
        (w === sorted[sorted.length - 1] && dur < minCut * 0.7 && w.beatRole !== 'opening'));
    if (tooShort && prev) {
      prev.endSeconds = w.endSeconds;
      prev.subtitleSpan = [prev.subtitleSpan[0], w.subtitleSpan[1]];
      prev.voiceoverText = `${prev.voiceoverText} ${w.voiceoverText}`.trim();
      continue;
    }
    merged.push({ ...w });
  }

  return merged.map((w) => ({
    ...w,
    startSeconds: Math.round(w.startSeconds * 10) / 10,
    endSeconds: Math.round(w.endSeconds * 10) / 10,
  }));
}
