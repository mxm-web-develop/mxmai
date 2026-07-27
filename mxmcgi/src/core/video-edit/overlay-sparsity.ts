/**
 * Overlay 稀疏化：只保留开场 / 章节切换 / 数据突出 / 人物首见 / 收尾等关键节点。
 * 对齐口播成片惯例（YouTube 解说 / B 站知识区）—— 大多数镜头只靠画面 + 底部字幕。
 *
 * 开场/结尾保底文案必须来自真实身份信息（主标题、副标题、节目名、UP主），
 * 禁止「本期开场」「感谢收看」等空洞占位。
 */
import type {
  SegmentOverlayLayerRole,
  SegmentOverlayLayerSpec,
  TimelineVisualSegment,
} from './timeline-segment-types';

/** 身份元数据：来自用户填写或 shot-list 识别回写 */
export type OverlayIdentityOpts = {
  /** 主标题 / 本期主题（global_topic / topic） */
  title?: string;
  /** 副标题 / 本期角度 */
  subtitle?: string;
  /** 节目名 / 系列名 */
  showName?: string;
  /** UP主 / 主持人 */
  hostName?: string;
};

/** 关键节点角色：默认保留 */
const KEYSTONE_ROLES = new Set<SegmentOverlayLayerRole>([
  'title-card',
  'chapter-cover',
  'fact-card',
  'lower-third',
  'outro-cta',
  'show-badge',
]);

/** keyword-pop / chapter-progress 最小间隔（秒） */
const KEYWORD_MIN_GAP_SECONDS = 18;
const PROGRESS_MIN_GAP_SECONDS = 25;

/** LLM/兜底常见的空洞开场文案（勿把真实短标题如「芯片」误判为空洞） */
const PLACEHOLDER_OPEN =
  /^(本期开场|开场|开场白|片头|片头字|opening|intro)$/i;
/** LLM/兜底常见的空洞结尾文案（纯「感谢收看」无行动号召） */
const PLACEHOLDER_CLOSE =
  /^(感谢收看|谢谢收看|结尾|收尾|结束|outro|end|再见)( · .+)?$/i;

function isKeystoneBeat(role: TimelineVisualSegment['mxmBeatRole']): boolean {
  return role === 'opening' || role === 'transition' || role === 'closing';
}

function layerHasDigits(text: string): boolean {
  return /\d/.test(text);
}

function shortOverlayText(raw: string, maxLen = 16): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function clean(s?: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function isPlaceholderOpenText(text: string): boolean {
  const t = clean(text);
  return !t || PLACEHOLDER_OPEN.test(t);
}

function isPlaceholderCloseText(text: string): boolean {
  const t = clean(text);
  if (!t) return true;
  // 「感谢收看 · 节目名」仍缺行动号召，也算占位
  if (PLACEHOLDER_CLOSE.test(t)) return true;
  if (/^感谢收看/.test(t) && !/三连|点赞|投币|收藏|关注/.test(t)) return true;
  return false;
}

/**
 * 单段内：过滤掉无效 / 重复 role；body 段去掉纯装饰 keyword。
 */
function filterLayersForSegment(
  seg: TimelineVisualSegment,
  layers: SegmentOverlayLayerSpec[]
): SegmentOverlayLayerSpec[] {
  const seen = new Set<string>();
  const out: SegmentOverlayLayerSpec[] = [];
  for (const layer of layers) {
    const role = layer.role as SegmentOverlayLayerRole;
    const text = layer.text.trim();
    if (!text) continue;
    const key = `${role}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (KEYSTONE_ROLES.has(role)) {
      // fact-card 若无数字且不像数据短语，降级丢弃（避免把普通标题当事实卡）
      if (role === 'fact-card' && !layerHasDigits(text) && text.length > 12) {
        continue;
      }
      out.push(layer);
      continue;
    }

    if (role === 'chapter-progress') {
      // 仅章节节点保留进度条
      if (isKeystoneBeat(seg.mxmBeatRole) || seg.mxmBeatRole === undefined) {
        out.push(layer);
      }
      continue;
    }

    if (role === 'keyword-pop') {
      // body 默认不要 keyword-pop；关键 beat 或未标注角色时交给全局节流
      if (seg.mxmBeatRole === 'body') continue;
      out.push(layer);
      continue;
    }

    out.push(layer);
  }

  // 开场/结尾允许叠多层身份信息；其余段最多 2 条
  const max =
    seg.mxmBeatRole === 'opening' || seg.mxmBeatRole === 'closing' ? 4 : 2;
  return out.slice(0, max);
}

function hasRole(
  layers: SegmentOverlayLayerSpec[] | undefined,
  roles: SegmentOverlayLayerRole[]
): boolean {
  return (layers ?? []).some((l) => roles.includes(l.role as SegmentOverlayLayerRole));
}

function hasLegacyTextOverlay(seg: TimelineVisualSegment): boolean {
  return (seg.overlays ?? []).some((o) => o.kind === 'text' && Boolean(o.text?.trim()));
}

function stripPlaceholderLayers(
  layers: SegmentOverlayLayerSpec[] | undefined,
  kind: 'open' | 'close'
): SegmentOverlayLayerSpec[] {
  return (layers ?? []).filter((l) => {
    const text = l.text ?? '';
    if (kind === 'open') {
      if (l.role === 'title-card' || l.role === 'chapter-cover') {
        return !isPlaceholderOpenText(text);
      }
      return true;
    }
    if (l.role === 'outro-cta' || l.role === 'title-card') {
      return !isPlaceholderCloseText(text);
    }
    return true;
  });
}

function hasSubstantiveOpening(layers: SegmentOverlayLayerSpec[]): boolean {
  return layers.some(
    (l) =>
      (l.role === 'title-card' || l.role === 'chapter-cover' || l.role === 'show-badge') &&
      !isPlaceholderOpenText(l.text)
  );
}

function hasSubstantiveClosing(layers: SegmentOverlayLayerSpec[]): boolean {
  return layers.some(
    (l) =>
      (l.role === 'outro-cta' && !isPlaceholderCloseText(l.text)) ||
      (l.role === 'title-card' &&
        !isPlaceholderCloseText(l.text) &&
        /三连|点赞|投币|收藏|关注/.test(l.text))
  );
}

/** 开场：节目角标 + 主标题 + 副标题 + UP主 — 仅写入真实存在的字段 */
export function buildOpeningIdentityLayers(
  opts: OverlayIdentityOpts,
  segmentDuration: number
): SegmentOverlayLayerSpec[] {
  const dur = Math.max(0.5, segmentDuration);
  const show = clean(opts.showName);
  const title = clean(opts.title);
  const subtitle = clean(opts.subtitle);
  const host = clean(opts.hostName);
  const layers: SegmentOverlayLayerSpec[] = [];

  if (show) {
    layers.push({
      role: 'show-badge',
      text: shortOverlayText(show, 18),
      position: 'top-center',
      emphasis: 'soft',
      enterAt: 0.12,
      exitAt: Math.min(dur, 3.6),
    });
  }

  if (title) {
    layers.push({
      role: 'title-card',
      text: shortOverlayText(title, 20),
      position: 'title-hero',
      emphasis: 'normal',
      enterAt: 0.22,
      exitAt: Math.min(dur, 3.9),
    });
  }

  if (subtitle && subtitle !== title && subtitle !== show) {
    layers.push({
      role: 'chapter-cover',
      text: shortOverlayText(subtitle, 24),
      position: 'title-sub',
      emphasis: 'soft',
      enterAt: 0.4,
      exitAt: Math.min(dur, 4.1),
    });
  }

  if (host) {
    layers.push({
      role: 'lower-third',
      text: `UP主 · ${shortOverlayText(host, 14)}`,
      position: 'bottom-left',
      emphasis: 'soft',
      enterAt: 0.55,
      exitAt: Math.min(dur, 4.3),
    });
  }

  return layers;
}

/** 结尾：B站式一键三连 / 关注号召 — 勿用空洞「感谢收看」 */
export function buildClosingCtaLayers(
  opts: OverlayIdentityOpts,
  segmentDuration: number
): SegmentOverlayLayerSpec[] {
  const dur = Math.max(0.5, segmentDuration);
  const show = clean(opts.showName);
  const host = clean(opts.hostName);
  const title = clean(opts.title);

  let cta: string;
  if (show) {
    cta = `一键三连 · 关注「${shortOverlayText(show, 10)}」`;
  } else if (host) {
    cta = `一键三连 · 关注 ${shortOverlayText(host, 10)}`;
  } else if (title) {
    cta = '一键三连 · 点赞收藏关注';
  } else {
    cta = '一键三连 · 点赞投币收藏';
  }
  if (cta.length > 22) {
    cta = show ? '一键三连 · 关注不迷路' : '一键三连 · 点赞收藏关注';
  }

  return [
    {
      role: 'outro-cta',
      text: cta,
      position: 'end-card',
      emphasis: 'hot',
      enterAt: Math.max(0, dur - 3.5),
      exitAt: dur,
    },
  ];
}

function mergeIdentityLayers(
  existing: SegmentOverlayLayerSpec[],
  identity: SegmentOverlayLayerSpec[]
): SegmentOverlayLayerSpec[] {
  const haveRole = new Set(existing.map((l) => l.role));
  const merged = [...existing];
  for (const layer of identity) {
    // title-card / show-badge / outro-cta / lower-third（UP）缺则补；
    // 副标题用 chapter-cover@title-sub，若已有任意 chapter-cover 不重复硬塞
    if (layer.role === 'chapter-cover' && haveRole.has('chapter-cover')) continue;
    if (haveRole.has(layer.role)) continue;
    merged.push(layer);
    haveRole.add(layer.role);
  }
  return merged.slice(0, 4);
}

/**
 * 开场 / 结尾：用真实身份信息补齐（或替换空洞占位）。
 * 无任何可用身份字段时不强行注入「本期开场」。
 */
export function ensureOpeningClosingOverlays(
  segments: TimelineVisualSegment[],
  opts?: OverlayIdentityOpts
): TimelineVisualSegment[] {
  if (!segments.length) return segments;
  const out = segments.map((s) => ({ ...s }));
  const identity: OverlayIdentityOpts = {
    title: clean(opts?.title),
    subtitle: clean(opts?.subtitle),
    showName: clean(opts?.showName),
    hostName: clean(opts?.hostName),
  };
  const hasAnyIdentity = Boolean(
    identity.title || identity.subtitle || identity.showName || identity.hostName
  );

  const openingIdx = out.findIndex((s) => s.mxmBeatRole === 'opening');
  const closingIdx = out.findIndex((s) => s.mxmBeatRole === 'closing');
  const openAt = openingIdx >= 0 ? openingIdx : 0;
  const closeAt = closingIdx >= 0 ? closingIdx : out.length - 1;

  const open = out[openAt]!;
  {
    let layers = stripPlaceholderLayers(open.overlayLayers, 'open');
    // 旧 overlays 文案若是占位也清掉
    if (hasLegacyTextOverlay(open)) {
      const legacyOk = (open.overlays ?? []).some(
        (o) => o.kind === 'text' && o.text && !isPlaceholderOpenText(o.text)
      );
      if (!legacyOk) {
        open.overlays = undefined;
      }
    }

    if (hasAnyIdentity) {
      const identityLayers = buildOpeningIdentityLayers(
        identity,
        open.endSeconds - open.startSeconds
      );
      if (!hasSubstantiveOpening(layers) || identityLayers.length) {
        layers = mergeIdentityLayers(layers, identityLayers);
      }
    }
    open.overlayLayers = layers.length ? layers : undefined;
  }

  // 单段时间轴：开场注入后不再叠结尾 CTA（避免同一帧既是片头又是三连）
  if (openAt === closeAt) return out;

  const close = out[closeAt]!;
  {
    let layers = stripPlaceholderLayers(close.overlayLayers, 'close');
    if (hasLegacyTextOverlay(close)) {
      const legacyOk = (close.overlays ?? []).some(
        (o) =>
          o.kind === 'text' &&
          o.text &&
          !isPlaceholderCloseText(o.text) &&
          /三连|点赞|投币|收藏|关注/.test(o.text)
      );
      if (!legacyOk) {
        close.overlays = undefined;
      }
    }

    // 结尾 CTA：始终用一键三连替换空洞「感谢收看」；有身份信息时强制补齐
    if (!hasSubstantiveClosing(layers) || hasAnyIdentity) {
      const ctaLayers = buildClosingCtaLayers(
        identity,
        close.endSeconds - close.startSeconds
      );
      // 去掉旧的空壳 outro，再合并 CTA
      layers = layers.filter((l) => l.role !== 'outro-cta' || !isPlaceholderCloseText(l.text));
      if (!layers.some((l) => l.role === 'outro-cta')) {
        layers = [...ctaLayers, ...layers];
      }
    }
    close.overlayLayers = layers.length ? layers : undefined;
  }

  return out;
}

/**
 * 全时间轴节流：keyword-pop / chapter-progress 不可接连出现；
 * 结束后强制补开场/结尾 overlay。
 */
export function sparsifySegmentOverlays(
  segments: TimelineVisualSegment[],
  opts?: OverlayIdentityOpts
): TimelineVisualSegment[] {
  let lastKeywordAt = -Infinity;
  let lastProgressAt = -Infinity;
  let keywordBudget = Math.max(2, Math.ceil(segments.length / 5));

  const thinned = segments.map((seg) => {
    const layers = Array.isArray(seg.overlayLayers) ? seg.overlayLayers : [];
    const legacyOverlays = Array.isArray(seg.overlays) ? seg.overlays : [];
    if (layers.length === 0 && legacyOverlays.length === 0) return seg;

    const filtered = filterLayersForSegment(seg, layers);
    const kept: SegmentOverlayLayerSpec[] = [];

    for (const layer of filtered) {
      const t0 = seg.startSeconds + (layer.enterAt ?? 0);

      if (layer.role === 'keyword-pop') {
        if (keywordBudget <= 0) continue;
        if (t0 - lastKeywordAt < KEYWORD_MIN_GAP_SECONDS && !isKeystoneBeat(seg.mxmBeatRole)) {
          continue;
        }
        lastKeywordAt = t0;
        keywordBudget -= 1;
        kept.push(layer);
        continue;
      }

      if (layer.role === 'chapter-progress') {
        if (t0 - lastProgressAt < PROGRESS_MIN_GAP_SECONDS) continue;
        lastProgressAt = t0;
        kept.push(layer);
        continue;
      }

      kept.push(layer);
    }

    // 旧 overlays[]：body 段清空；关键段最多保留 1 条短标题
    let nextOverlays = legacyOverlays;
    if (legacyOverlays.length > 0) {
      if (seg.mxmBeatRole === 'body') {
        nextOverlays = [];
      } else if (!isKeystoneBeat(seg.mxmBeatRole) && seg.mxmBeatRole !== undefined) {
        nextOverlays = [];
      } else {
        nextOverlays = legacyOverlays.slice(0, 1);
      }
    }

    return {
      ...seg,
      overlayLayers: kept.length ? kept : undefined,
      overlays: nextOverlays.length ? nextOverlays : undefined,
    };
  });

  return ensureOpeningClosingOverlays(thinned, opts);
}
