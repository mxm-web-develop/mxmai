/**
 * 文件夹标签卡 → 既有业务 params 注入（手填优先）
 */
import { RepositoryFactory } from '@mxmai/mxmdata';
import type { Folder, FolderCardTag } from '@mxmai/mxmdata';
import type { JsonSchemaV2, TaskContext } from '../tasks/types';
import { ValidationError } from '../tasks/errors';
import {
  formatStyleExemplarHints,
  STYLE_EXEMPLARS_MAX,
  type StyleExemplar,
} from '../folder-index/style-vision-types';
import { CHARACTER_APPEARANCE_REFS_MAX } from '../folder-index/character-vision-types';

export type CardAssetNeed =
  | 'voice_id'
  | 'appearance_images'
  | 'appearance_primary'
  | 'description'
  | 'appearance_prompt'
  | 'style_ref_images'
  | 'style_summary'
  | 'style_exemplar_hints'
  | 'writing_summary'
  | 'kb_recall';

export type CardAssetPick = 'primary' | 'all' | `max:${number}`;

export type FolderCardAssetSource = {
  from: 'folder_card';
  need: CardAssetNeed;
  pick?: CardAssetPick;
  inject_as_param?: string;
  folder_param?: string;
};

const DEFAULT_INJECT: Record<CardAssetNeed, string> = {
  voice_id: 'voice_id',
  appearance_images: 'character_ref_images',
  appearance_primary: 'host_portrait',
  description: 'character_brief',
  appearance_prompt: 'appearance_prompt',
  style_ref_images: 'style_ref_images',
  style_summary: 'style_summary',
  style_exemplar_hints: 'style_exemplar_hints',
  writing_summary: 'writing_summary',
  kb_recall: 'kb_recall_block',
};

const NEED_TAG: Record<CardAssetNeed, FolderCardTag> = {
  voice_id: 'character',
  appearance_images: 'character',
  appearance_primary: 'character',
  description: 'character',
  appearance_prompt: 'character',
  style_ref_images: 'style',
  style_summary: 'style',
  style_exemplar_hints: 'style',
  writing_summary: 'writing',
  kb_recall: 'knowledge',
};

const DEFAULT_FOLDER_PARAM: Record<FolderCardTag, string> = {
  character: 'character_folder_id',
  style: 'style_folder_id',
  writing: 'writing_folder_id',
  knowledge: 'knowledge_folder_id',
};

function schemaProperties(formSchema?: JsonSchemaV2): Record<string, unknown> {
  if (!formSchema || typeof formSchema !== 'object') return {};
  const props = (formSchema as { properties?: Record<string, unknown> }).properties;
  return props && typeof props === 'object' ? props : {};
}

function parsePick(pick?: CardAssetPick): { mode: 'primary' | 'all' | 'max'; n: number } {
  if (!pick || pick === 'all') return { mode: 'all', n: 99 };
  if (pick === 'primary') return { mode: 'primary', n: 1 };
  const m = /^max:(\d+)$/.exec(pick);
  if (m) return { mode: 'max', n: Math.max(1, Number(m[1])) };
  return { mode: 'all', n: 99 };
}

function isEmptyParam(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function pickUrls(urls: string[], pick?: CardAssetPick): string[] {
  const { mode, n } = parsePick(pick);
  if (mode === 'primary') return urls.slice(0, 1);
  return urls.slice(0, n);
}

function readStyleExemplars(st: Record<string, unknown> | undefined): StyleExemplar[] {
  if (!st) return [];
  const raw = Array.isArray(st.exemplars) ? st.exemplars : [];
  const out: StyleExemplar[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const ref_key = typeof o.ref_key === 'string' ? o.ref_key.trim() : '';
    if (!ref_key) continue;
    const fit =
      typeof o.fit_score === 'number' && Number.isFinite(o.fit_score) ? o.fit_score : 0.5;
    const tags = Array.isArray(o.feature_tags)
      ? o.feature_tags
          .filter((t): t is string => typeof t === 'string' && !!t.trim())
          .map((t) => t.trim())
      : [];
    out.push({
      ref_key,
      fit_score: fit,
      feature_tags: tags.slice(0, 3),
      ...(typeof o.url === 'string' && o.url.trim() ? { url: o.url.trim() } : {}),
    });
  }
  if (out.length > 0) {
    return out.sort((a, b) => b.fit_score - a.fit_score).slice(0, STYLE_EXEMPLARS_MAX);
  }
  // 旧卡：仅有 exemplar_urls
  const urls = Array.isArray(st.exemplar_urls)
    ? st.exemplar_urls.filter((u): u is string => typeof u === 'string' && !!u.trim())
    : [];
  return urls.slice(0, STYLE_EXEMPLARS_MAX).map((url, i) => ({
    ref_key: `legacy:${i}`,
    url,
    fit_score: 1 - i * 0.01,
    feature_tags: [],
  }));
}

function buildStyleSummaryInject(st: Record<string, unknown> | undefined): string {
  if (!st) return '';
  const exemplars = readStyleExemplars(st);
  const hints = formatStyleExemplarHints(exemplars);
  const core =
    typeof st.style_summary === 'string' && st.style_summary.trim()
      ? st.style_summary.trim()
      : [
          typeof st.typography_feel === 'string' ? st.typography_feel : '',
          typeof st.composition_bias === 'string' ? st.composition_bias : '',
          typeof st.color_rules === 'string' ? st.color_rules : '',
        ]
          .filter((s) => !!String(s).trim())
          .join('；');
  const tagLine = Array.isArray(st.style_tags)
    ? st.style_tags.filter((t): t is string => typeof t === 'string' && !!t.trim()).join('、')
    : '';
  return [core, tagLine ? `style_tags: ${tagLine}` : '', hints ? `exemplars: ${hints}` : '']
    .filter(Boolean)
    .join('\n');
}

function buildWritingSummaryInject(wr: Record<string, unknown> | undefined): string {
  if (!wr) return '';
  const core =
    typeof wr.voice_summary === 'string' && wr.voice_summary.trim()
      ? wr.voice_summary.trim()
      : '';
  const tone = Array.isArray(wr.tone)
    ? wr.tone.filter((t): t is string => typeof t === 'string' && !!t.trim()).join('、')
    : '';
  const register = typeof wr.register === 'string' ? wr.register.trim() : '';
  const structure =
    typeof wr.structure_bias === 'string' ? wr.structure_bias.trim() : '';
  const lexicon = typeof wr.lexicon_rules === 'string' ? wr.lexicon_rules.trim() : '';
  const rhythm = typeof wr.rhythm_feel === 'string' ? wr.rhythm_feel.trim() : '';
  const avoid = Array.isArray(wr.avoid)
    ? wr.avoid.filter((t): t is string => typeof t === 'string' && !!t.trim()).join('、')
    : '';
  return [
    core,
    tone ? `tone: ${tone}` : '',
    register ? `register: ${register}` : '',
    structure ? `structure: ${structure}` : '',
    lexicon ? `lexicon: ${lexicon}` : '',
    rhythm ? `rhythm: ${rhythm}` : '',
    avoid ? `avoid: ${avoid}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function mergeRefsIntoReferenceImage(
  params: Record<string, unknown>,
  urls: string[],
  type: 'style-reference' | 'character-reference',
  purpose: string
): void {
  if (urls.length === 0) return;
  const existing = Array.isArray(params.referenceImage)
    ? ([...(params.referenceImage as unknown[])] as Array<Record<string, unknown>>)
    : [];
  const have = new Set(
    existing
      .map((r) => (typeof r?.content === 'string' ? r.content.trim() : ''))
      .filter(Boolean)
  );
  for (const url of urls) {
    const u = url.trim();
    if (!u || have.has(u)) continue;
    existing.push({ type, content: u, purpose });
    have.add(u);
  }
  params.referenceImage = existing;
}

function readCharacterAppearanceUrls(ch: Record<string, unknown> | undefined): string[] {
  if (!ch) return [];
  const urls = Array.isArray(ch.appearance_image_urls)
    ? ch.appearance_image_urls.filter((u): u is string => typeof u === 'string' && !!u.trim())
    : [];
  return urls.slice(0, CHARACTER_APPEARANCE_REFS_MAX);
}

export function collectFolderCardAssetDescriptors(
  formSchema?: JsonSchemaV2
): Array<{ fieldName: string; source: FolderCardAssetSource }> {
  const props = schemaProperties(formSchema);
  const out: Array<{ fieldName: string; source: FolderCardAssetSource }> = [];
  for (const [fieldName, defRaw] of Object.entries(props)) {
    if (!defRaw || typeof defRaw !== 'object') continue;
    const def = defRaw as Record<string, unknown>;
    const src = def['x-asset-source'];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const s = src as Record<string, unknown>;
    if (s.from !== 'folder_card') continue;
    const need = s.need as CardAssetNeed;
    if (!need || !(need in DEFAULT_INJECT)) continue;
    out.push({
      fieldName,
      source: {
        from: 'folder_card',
        need,
        pick: s.pick as CardAssetPick | undefined,
        inject_as_param: typeof s.inject_as_param === 'string' ? s.inject_as_param : undefined,
        folder_param: typeof s.folder_param === 'string' ? s.folder_param : undefined,
      },
    });
  }
  return out;
}

async function loadFolder(userId: string, folderId: string): Promise<Folder> {
  const repo = RepositoryFactory.createFolderRepository();
  const folder = await repo.getFolderById(folderId);
  if (!folder || folder.folder_kind !== 'virtual') {
    throw new ValidationError(`虚拟文件夹不存在: ${folderId}`);
  }
  if (folder.user_id !== userId && !folder.is_system) {
    throw new ValidationError('无权访问该文件夹');
  }
  return folder;
}

function assertCardReady(folder: Folder, expectTag: FolderCardTag): void {
  if (folder.card_tag !== expectTag) {
    throw new ValidationError(
      `文件夹「${folder.name}」标签为 ${folder.card_tag ?? '无'}，需要 ${expectTag} 卡`
    );
  }
  if (folder.card_status !== 'ready') {
    throw new ValidationError(
      `文件夹「${folder.name}」尚未解析完成（状态: ${folder.card_status ?? 'idle'}）`
    );
  }
}

export async function resolveCardNeed(
  userId: string,
  folderId: string,
  need: CardAssetNeed,
  pick?: CardAssetPick,
  queryForKb?: string
): Promise<unknown> {
  const folder = await loadFolder(userId, folderId);
  const expectTag = NEED_TAG[need];
  assertCardReady(folder, expectTag);
  const summary = (folder.card_summary ?? {}) as Record<string, unknown>;

  if (need === 'voice_id') {
    const ch = summary.character as Record<string, unknown> | undefined;
    const id = typeof ch?.voice_id === 'string' ? ch.voice_id.trim() : '';
    if (!id) throw new ValidationError(`角色卡「${folder.name}」未绑定 voice_id`);
    return id;
  }

  if (need === 'description') {
    const ch = summary.character as Record<string, unknown> | undefined;
    if (typeof ch?.character_brief === 'string' && ch.character_brief.trim()) {
      return ch.character_brief.trim();
    }
    return typeof ch?.description === 'string' ? ch.description : '';
  }

  if (need === 'appearance_prompt') {
    const ch = summary.character as Record<string, unknown> | undefined;
    return typeof ch?.appearance_prompt === 'string' ? ch.appearance_prompt.trim() : '';
  }

  if (need === 'appearance_images' || need === 'appearance_primary') {
    const ch = summary.character as Record<string, unknown> | undefined;
    const urls = readCharacterAppearanceUrls(ch);
    const picked = pickUrls(
      urls,
      need === 'appearance_primary' ? 'primary' : pick ?? `max:${CHARACTER_APPEARANCE_REFS_MAX}`
    );
    if (need === 'appearance_primary') return picked[0] ?? '';
    return picked;
  }

  if (need === 'style_ref_images') {
    const st = summary.style as Record<string, unknown> | undefined;
    const exemplars = readStyleExemplars(st);
    const urls = exemplars
      .map((e) => e.url)
      .filter((u): u is string => typeof u === 'string' && !!u.trim());
    return pickUrls(urls, pick ?? `max:${STYLE_EXEMPLARS_MAX}`);
  }

  if (need === 'style_exemplar_hints') {
    const st = summary.style as Record<string, unknown> | undefined;
    return formatStyleExemplarHints(readStyleExemplars(st));
  }

  if (need === 'style_summary') {
    const st = summary.style as Record<string, unknown> | undefined;
    return buildStyleSummaryInject(st);
  }

  if (need === 'writing_summary') {
    const wr = summary.writing as Record<string, unknown> | undefined;
    return buildWritingSummaryInject(wr);
  }

  if (need === 'kb_recall') {
    const q = (queryForKb || folder.name).trim();
    if (!q) return '';
    const { virtualFolderIndexService } = await import('../folder-index/virtual-folder-index-service');
    const results = await virtualFolderIndexService.search(userId, folderId, q, 8);
    const list = Array.isArray(results) ? results : [];
    const lines = list
      .map((r: Record<string, unknown>) => String(r.content ?? r.text ?? r.chunk ?? '').trim())
      .filter(Boolean);
    return lines.join('\n\n').slice(0, 3500);
  }

  return undefined;
}

/**
 * 扫描 params 中的 *_folder_id 与 schema x-asset-source，注入既有 params。
 * 手填非空则跳过（手填优先）。
 */
export async function resolveFolderCardAssets(
  ctx: TaskContext,
  formSchema?: JsonSchemaV2
): Promise<TaskContext> {
  const descriptors = collectFolderCardAssetDescriptors(formSchema);
  const nextParams = { ...ctx.params };

  const implicit: Array<{ folderParam: string; need: CardAssetNeed; inject: string }> = [
    { folderParam: 'style_folder_id', need: 'style_ref_images', inject: 'style_ref_images' },
    { folderParam: 'style_folder_id', need: 'style_summary', inject: 'style_summary' },
    { folderParam: 'style_folder_id', need: 'style_exemplar_hints', inject: 'style_exemplar_hints' },
    { folderParam: 'writing_folder_id', need: 'writing_summary', inject: 'writing_summary' },
    { folderParam: 'character_folder_id', need: 'voice_id', inject: 'voice_id' },
    { folderParam: 'character_folder_id', need: 'appearance_primary', inject: 'host_portrait' },
    { folderParam: 'character_folder_id', need: 'appearance_images', inject: 'character_ref_images' },
    { folderParam: 'character_folder_id', need: 'description', inject: 'character_brief' },
    { folderParam: 'character_folder_id', need: 'appearance_prompt', inject: 'appearance_prompt' },
  ];

  const jobs: Array<Promise<void>> = [];

  for (const desc of descriptors) {
    jobs.push(
      (async () => {
        const expectTag = NEED_TAG[desc.source.need];
        const folderParam =
          desc.source.folder_param || DEFAULT_FOLDER_PARAM[expectTag] || 'folder_id';
        const folderId = String(nextParams[folderParam] ?? '').trim();
        if (!folderId) return;

        const injectKey =
          desc.source.inject_as_param || desc.fieldName || DEFAULT_INJECT[desc.source.need];
        if (!isEmptyParam(nextParams[injectKey])) return;

        const queryHint =
          typeof nextParams.topic === 'string'
            ? nextParams.topic
            : typeof nextParams.prompt === 'string'
              ? nextParams.prompt
              : undefined;
        const value = await resolveCardNeed(
          ctx.userId,
          folderId,
          desc.source.need,
          desc.source.pick,
          queryHint
        );
        if (
          value != null &&
          !(typeof value === 'string' && !value) &&
          !(Array.isArray(value) && value.length === 0)
        ) {
          nextParams[injectKey] = value;
        }
      })()
    );
  }

  if (descriptors.length === 0) {
    for (const row of implicit) {
      jobs.push(
        (async () => {
          const folderId = String(nextParams[row.folderParam] ?? '').trim();
          if (!folderId) return;
          if (!isEmptyParam(nextParams[row.inject])) return;
          try {
            const queryHint =
              typeof nextParams.topic === 'string'
                ? nextParams.topic
                : typeof nextParams.prompt === 'string'
                  ? nextParams.prompt
                  : undefined;
            const value = await resolveCardNeed(
              ctx.userId,
              folderId,
              row.need,
              row.need === 'style_ref_images'
                ? `max:${STYLE_EXEMPLARS_MAX}`
                : row.need === 'appearance_images'
                  ? `max:${CHARACTER_APPEARANCE_REFS_MAX}`
                  : 'all',
              queryHint
            );
            if (
              value != null &&
              !(typeof value === 'string' && !value) &&
              !(Array.isArray(value) && value.length === 0)
            ) {
              nextParams[row.inject] = value;
            }
          } catch {
            // 隐式注入失败不阻断
          }
        })()
      );
    }
  }

  await Promise.all(jobs);

  // 风格 / 角色参考图 → referenceImage 像素通路
  const styleFolderId = String(nextParams.style_folder_id ?? '').trim();
  if (styleFolderId) {
    const refs = Array.isArray(nextParams.style_ref_images)
      ? nextParams.style_ref_images.filter((u): u is string => typeof u === 'string' && !!u.trim())
      : [];
    if (refs.length > 0) {
      mergeRefsIntoReferenceImage(
        nextParams,
        refs.slice(0, STYLE_EXEMPLARS_MAX),
        'style-reference',
        'style-folder-card'
      );
    }
  }
  const characterFolderId = String(nextParams.character_folder_id ?? '').trim();
  if (characterFolderId) {
    const refs = Array.isArray(nextParams.character_ref_images)
      ? nextParams.character_ref_images.filter(
          (u): u is string => typeof u === 'string' && !!u.trim()
        )
      : [];
    if (refs.length > 0) {
      mergeRefsIntoReferenceImage(
        nextParams,
        refs.slice(0, CHARACTER_APPEARANCE_REFS_MAX),
        'character-reference',
        'character-folder-card'
      );
    }
  }

  return { ...ctx, params: nextParams };
}
