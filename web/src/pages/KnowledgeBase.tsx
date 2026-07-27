import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  App,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  notification,
} from 'antd';
import { useTranslation } from 'react-i18next';
import {
  addKnowledgeFolderStorageLink,
  addKnowledgeFolderTaskLink,
  createKnowledgeFolder,
  deleteKnowledgeFolder,
  getKnowledgeFolderItems,
  getKnowledgeFolders,
  peekKnowledgeFolderItems,
  removeKnowledgeFolderLink,
  updateKnowledgeFolderCardTag,
  updateKnowledgeFolderItemFeatureTags,
  type FolderCardTag,
  type FolderItem,
  type KnowledgeFolderContentItem,
  type KnowledgeFolderLinkItem,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useKnowledgeBaseParse } from '../context/KnowledgeBaseParseContext';
import { useAuthMediaPreview } from '../hooks/useAuthMediaPreview';
import {
  AssetCenterPageHeader,
  AssetCenterSidebar,
  KnowledgeFolderTreeSidebar,
} from '../components/asset-center';
import { KnowledgeFolderContentList } from '../components/knowledge-base/KnowledgeFolderContentList';
import { KnowledgeFolderLinkPicker } from '../components/knowledge-base/KnowledgeFolderLinkPicker';
import { useKnowledgeFolderLinkPreview } from '../components/knowledge-base/useKnowledgeFolderLinkPreview';

const CARD_TAG_OPTIONS: Array<{ value: FolderCardTag | ''; label: string }> = [
  { value: '', label: '普通管理（不解析）' },
  { value: 'style', label: '视觉风格' },
  { value: 'writing', label: '语感文风' },
  { value: 'character', label: '角色卡' },
  { value: 'knowledge', label: '知识卡' },
];

function cardStatusColor(status?: string) {
  switch (status) {
    case 'ready':
      return 'green';
    case 'parsing':
      return 'blue';
    case 'stale':
      return 'orange';
    case 'failed':
      return 'red';
    default:
      return 'default';
  }
}

function cardStatusLabel(status?: string) {
  switch (status) {
    case 'ready':
      return '已解析';
    case 'parsing':
      return '解析中';
    case 'stale':
      return '需重解析';
    case 'failed':
      return '解析失败';
    default:
      return '未解析';
  }
}

function readString(obj: Record<string, unknown>, key: string, fallback = ''): string {
  const v = obj[key];
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    const value = (v as { value?: unknown }).value;
    return typeof value === 'string' ? value : fallback;
  }
  return fallback;
}

const PROVENANCE_COLOR: Record<'extracted' | 'inferred' | 'user', string> = {
  extracted: 'blue',
  inferred: 'default',
  user: 'gold',
};

function provColor(provenance?: string): string {
  if (provenance === 'extracted' || provenance === 'user' || provenance === 'inferred') {
    return PROVENANCE_COLOR[provenance];
  }
  return 'default';
}

/** 单字段行：label + 文字 + provenance tag */
function FieldRow({
  label,
  value,
  provenance,
}: {
  label: string;
  value: string | string[] | undefined;
  provenance?: string;
}) {
  if (value == null || value === '') return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
      <div style={{ minWidth: 86, color: 'var(--text-muted, #64748b)', fontSize: 12, paddingTop: 1 }}>
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.55 }}>
        {Array.isArray(value) ? (
          <Space size={4} wrap>
            {value.map((s, i) => (
              <Tag key={`${label}-${i}`} style={{ marginInlineStart: 0 }}>
                {s}
              </Tag>
            ))}
          </Space>
        ) : (
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span>
        )}
      </div>
      {provenance ? (
        <Tag color={provColor(provenance)} style={{ marginInlineStart: 0, fontSize: 11, lineHeight: '18px' }}>
          {provenance}
        </Tag>
      ) : null}
    </div>
  );
}

/** 读取带 provenance 包装的字段（{ value, provenance } 或裸值） */
function getProv<T>(
  o: Record<string, unknown>,
  key: string
): { value: T | undefined; provenance?: string } {
  const raw = o[key];
  if (raw == null) return { value: undefined };
  if (typeof raw === 'object' && !Array.isArray(raw) && 'value' in (raw as Record<string, unknown>)) {
    return {
      value: (raw as { value: T }).value,
      provenance: (raw as { provenance?: string }).provenance,
    };
  }
  return { value: raw as T };
}

/** 章节标题 */
function Section({
  title,
  children,
  count,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h4
        style={{
          margin: '0 0 8px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-main, #0f172a)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {title}
        {typeof count === 'number' ? (
          <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>
            · {count} 项
          </span>
        ) : null}
      </h4>
      {children}
    </section>
  );
}

function CharacterCardBody({
  ch,
  folderName,
}: {
  ch: Record<string, unknown>;
  folderName: string;
}) {
  const name = readString(ch, 'display_name') || folderName;
  const aliases = getProv<string[]>(ch, 'aliases');
  const species = getProv<string>(ch, 'species_or_race');
  const gender = getProv<string>(ch, 'gender_presentation');
  const ageBand = getProv<string>(ch, 'age_band');
  const physique = getProv<string>(ch, 'physique');
  const face = getProv<string>(ch, 'face');
  const hair = getProv<string>(ch, 'hair');
  const distinctiveMarks = getProv<string[]>(ch, 'distinctive_marks');
  const clothingDefault = getProv<string>(ch, 'clothing_default');
  const clothingPreferences = getProv<string[]>(ch, 'clothing_preferences');
  const colorAffinities = getProv<string[]>(ch, 'color_affinities');
  const personality = getProv<string>(ch, 'personality');
  const background = getProv<string>(ch, 'background');
  const speechStyle = getProv<string>(ch, 'speech_style');
  const likes = getProv<string[]>(ch, 'likes');
  const dislikes = getProv<string[]>(ch, 'dislikes');
  const relationships = getProv<string[]>(ch, 'relationships');
  const abilities = getProv<string[]>(ch, 'abilities');
  const characterBrief =
    (typeof ch.character_brief === 'string' && ch.character_brief) ||
    (typeof ch.description === 'string' && ch.description) ||
    '';
  const appearancePrompt =
    typeof ch.appearance_prompt === 'string' ? ch.appearance_prompt : '';
  const voiceId = typeof ch.voice_id === 'string' ? ch.voice_id : '';
  const primaryRef = typeof ch.appearance_primary_ref === 'string' ? ch.appearance_primary_ref : '';
  const appearanceRefIds = Array.isArray(ch.appearance_ref_ids)
    ? (ch.appearance_ref_ids as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  const mediaAssets: Array<{
    refKey: string;
    url?: string;
    mediaKind?: string;
    panelHints?: string[];
    isMultiPanel?: boolean;
    suitability?: { identity_lock?: number; costume_ref?: number; expression_ref?: number };
  }> = [];
  if (Array.isArray(ch.media_assets)) {
    for (const m of ch.media_assets as Array<Record<string, unknown>>) {
      const refKey = typeof m.ref_key === 'string' ? (m.ref_key as string) : '';
      if (!refKey) continue;
      mediaAssets.push({
        refKey,
        url: typeof m.url === 'string' ? (m.url as string) : undefined,
        mediaKind: typeof m.media_kind === 'string' ? (m.media_kind as string) : undefined,
        panelHints: Array.isArray(m.panel_hints)
          ? (m.panel_hints as unknown[]).filter((t): t is string => typeof t === 'string')
          : undefined,
        isMultiPanel: m.is_multi_panel === true,
        suitability:
          m.suitability && typeof m.suitability === 'object' && !Array.isArray(m.suitability)
            ? (m.suitability as { identity_lock?: number; costume_ref?: number; expression_ref?: number })
            : undefined,
      });
    }
  }

  const hasBasics =
    aliases.value || species.value || gender.value || ageBand.value;
  const hasAppearance =
    physique.value ||
    face.value ||
    hair.value ||
    (distinctiveMarks.value && distinctiveMarks.value.length > 0) ||
    clothingDefault.value ||
    (clothingPreferences.value && clothingPreferences.value.length > 0) ||
    (colorAffinities.value && colorAffinities.value.length > 0);
  const hasPersonality =
    personality.value ||
    background.value ||
    speechStyle.value ||
    (likes.value && likes.value.length > 0) ||
    (dislikes.value && dislikes.value.length > 0) ||
    (relationships.value && relationships.value.length > 0) ||
    (abilities.value && abilities.value.length > 0);

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Tag color="purple" style={{ fontWeight: 600 }}>
          {name}
        </Tag>
        <Tag>refs {appearanceRefIds.length}/10</Tag>
        {mediaAssets.filter((m) => m.isMultiPanel).length > 0 ? (
          <Tag color="blue">multi-panel ×{mediaAssets.filter((m) => m.isMultiPanel).length}</Tag>
        ) : null}
        {voiceId ? <Tag>voice {voiceId}</Tag> : null}
        {primaryRef ? (
          <Tooltip title="主形象参考（最清晰正面 / 全身 / 模卡）">
            <Tag color="cyan">primary · {primaryRef}</Tag>
          </Tooltip>
        ) : null}
      </div>

      {hasBasics ? (
        <Section title="基础信息">
          {aliases.value && aliases.value.length > 0 ? (
            <FieldRow label="别名 / Aliases" value={aliases.value} provenance={aliases.provenance} />
          ) : null}
          <FieldRow label="物种 / Race" value={species.value} provenance={species.provenance} />
          <FieldRow label="性别表达" value={gender.value} provenance={gender.provenance} />
          <FieldRow label="年龄段" value={ageBand.value} provenance={ageBand.provenance} />
        </Section>
      ) : null}

      {hasAppearance ? (
        <Section title="外貌 / Appearance">
          <FieldRow label="体态" value={physique.value} provenance={physique.provenance} />
          <FieldRow label="面部" value={face.value} provenance={face.provenance} />
          <FieldRow label="发型 / 发色" value={hair.value} provenance={hair.provenance} />
          {distinctiveMarks.value && distinctiveMarks.value.length > 0 ? (
            <FieldRow
              label="辨识特征"
              value={distinctiveMarks.value}
              provenance={distinctiveMarks.provenance}
            />
          ) : null}
          <FieldRow
            label="默认服装"
            value={clothingDefault.value}
            provenance={clothingDefault.provenance}
          />
          {clothingPreferences.value && clothingPreferences.value.length > 0 ? (
            <FieldRow
              label="服装偏好"
              value={clothingPreferences.value}
              provenance={clothingPreferences.provenance}
            />
          ) : null}
          {colorAffinities.value && colorAffinities.value.length > 0 ? (
            <FieldRow
              label="色彩偏好"
              value={colorAffinities.value}
              provenance={colorAffinities.provenance}
            />
          ) : null}
        </Section>
      ) : null}

      {hasPersonality ? (
        <Section title="性格 / Personality">
          <FieldRow
            label="性格"
            value={personality.value}
            provenance={personality.provenance}
          />
          <FieldRow
            label="背景"
            value={background.value}
            provenance={background.provenance}
          />
          <FieldRow
            label="说话风格"
            value={speechStyle.value}
            provenance={speechStyle.provenance}
          />
          {likes.value && likes.value.length > 0 ? (
            <FieldRow label="喜欢" value={likes.value} provenance={likes.provenance} />
          ) : null}
          {dislikes.value && dislikes.value.length > 0 ? (
            <FieldRow
              label="不喜欢"
              value={dislikes.value}
              provenance={dislikes.provenance}
            />
          ) : null}
          {relationships.value && relationships.value.length > 0 ? (
            <FieldRow
              label="人际关系"
              value={relationships.value}
              provenance={relationships.provenance}
            />
          ) : null}
          {abilities.value && abilities.value.length > 0 ? (
            <FieldRow
              label="能力"
              value={abilities.value}
              provenance={abilities.provenance}
            />
          ) : null}
        </Section>
      ) : null}

      {characterBrief ? (
        <Section title="写作注入 · character_brief">
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(15,23,42,0.04)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            {characterBrief}
          </div>
        </Section>
      ) : null}

      {appearancePrompt ? (
        <Section title="生图注入 · appearance_prompt">
          <div
            style={{
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(15,23,42,0.04)',
              border: '1px solid rgba(148,163,184,0.14)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 12,
            }}
          >
            {appearancePrompt}
          </div>
        </Section>
      ) : null}

      {mediaAssets.length > 0 ? (
        <Section title="形象参考素材" count={mediaAssets.length}>
          <div
            style={{
              border: '1px solid rgba(148,163,184,0.18)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {mediaAssets.map((m, i) => (
              <MediaAssetCard
                key={m.refKey}
                m={m}
                primaryRef={primaryRef}
                isLast={i === mediaAssets.length - 1}
              />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function StyleExemplarThumb({ url, refKey }: { url?: string; refKey: string }) {
  const { previewUrl, loading, failed } = useAuthMediaPreview(url);
  if (!url) return null;
  return (
    <div
      style={{
        width: 64,
        height: 64,
        flexShrink: 0,
        borderRadius: 6,
        overflow: 'hidden',
        background: 'rgba(15,23,42,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {previewUrl && !loading && !failed ? (
        <img
          src={previewUrl}
          alt={refKey}
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span className="muted" style={{ fontSize: 9 }}>
          {loading ? '…' : '×'}
        </span>
      )}
    </div>
  );
}

function MediaAssetCard({
  m,
  primaryRef,
  isLast = false,
}: {
  m: {
    refKey: string;
    url?: string;
    mediaKind?: string;
    panelHints?: string[];
    isMultiPanel?: boolean;
    suitability?: { identity_lock?: number; costume_ref?: number; expression_ref?: number };
  };
  primaryRef: string;
  isLast?: boolean;
}) {
  const { previewUrl, loading, failed } = useAuthMediaPreview(m.url);
  const score = (n: number | undefined) => (typeof n === 'number' ? Math.round(n * 100) : null);
  const idN = score(m.suitability?.identity_lock);
  const cosN = score(m.suitability?.costume_ref);
  const expN = score(m.suitability?.expression_ref);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderBottom: isLast ? 'none' : '1px solid rgba(148,163,184,0.14)',
        background: m.refKey === primaryRef ? 'rgba(14,165,233,0.04)' : undefined,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'rgba(15,23,42,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {previewUrl && !loading && !failed ? (
          <img
            src={previewUrl}
            alt={m.mediaKind ?? 'reference'}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span className="muted" style={{ fontSize: 10 }}>
            {loading ? '…' : '×'}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          {m.mediaKind ? (
            <Tag color="blue" style={{ marginInlineStart: 0, fontSize: 11 }}>
              {m.mediaKind}
            </Tag>
          ) : null}
          {m.isMultiPanel ? (
            <Tag style={{ marginInlineStart: 0, fontSize: 11 }}>multi-panel</Tag>
          ) : null}
          {m.refKey === primaryRef ? (
            <Tag color="cyan" style={{ marginInlineStart: 0, fontSize: 11 }}>
              primary
            </Tag>
          ) : null}
          {m.panelHints?.map((h, i) => (
            <Tag key={`${m.refKey}-hint-${i}`} style={{ marginInlineStart: 0, fontSize: 11 }}>
              {h}
            </Tag>
          ))}
        </div>
        <div
          className="muted"
          style={{
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-all',
            lineHeight: 1.35,
          }}
          title={m.refKey}
        >
          {m.refKey}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
          paddingInlineStart: 4,
        }}
      >
        <SuitabilityInline label="id" v={idN} />
        <SuitabilityInline label="costume" v={cosN} />
        <SuitabilityInline label="expression" v={expN} />
      </div>
    </div>
  );
}

function SuitabilityInline({ label, v }: { label: string; v: number | null }) {
  if (v == null) {
    return (
      <div style={{ textAlign: 'right', minWidth: 52 }}>
        <div className="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>
          {label}
        </div>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          —
        </div>
      </div>
    );
  }
  const tier = v >= 80 ? '#10b981' : v >= 60 ? '#38bdf8' : v >= 40 ? '#f59e0b' : '#94a3b8';
  return (
    <div style={{ textAlign: 'right', minWidth: 52 }}>
      <div className="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>
        {label}
      </div>
      <div style={{ color: tier, fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
        {v}
      </div>
    </div>
  );
}

function KnowledgeDetailView({
  folder,
}: {
  folder: {
    name: string;
    card_summary?: Record<string, unknown> | null;
    knowledge_base_id?: string | null;
    indexed_at?: string | null;
    index_status?: string | null;
  };
}) {
  const summary = (folder.card_summary ?? {}) as { knowledge?: { doc_count?: number; topic?: string } };
  const knowledge = summary.knowledge ?? {};
  const docCount = typeof knowledge.doc_count === 'number' ? knowledge.doc_count : null;
  const topic = typeof knowledge.topic === 'string' ? knowledge.topic : '';
  return (
    <div style={{ paddingTop: 4 }}>
      <div
        style={{
          marginBottom: 16,
          padding: '12px 14px',
          borderRadius: 10,
          background:
            'linear-gradient(135deg, rgba(14,165,233,0.10), rgba(56,189,248,0.04))',
          border: '1px solid rgba(14,165,233,0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Tag color="cyan" style={{ marginInlineStart: 0, fontWeight: 600 }}>
            知识库
          </Tag>
          <strong style={{ fontSize: 14 }}>{folder.name}</strong>
        </div>
        <FieldRow label="topic" value={topic} />
        <FieldRow
          label="doc_count"
          value={docCount == null ? undefined : `${docCount} 个文档块`}
        />
        <FieldRow label="knowledge_base_id" value={folder.knowledge_base_id ?? undefined} />
        <FieldRow label="indexed_at" value={folder.indexed_at ?? undefined} />
        <FieldRow
          label="index_status"
          value={folder.index_status ?? undefined}
        />
      </div>
      <Section title="召回" count={docCount ?? undefined}>
        <Typography.Text type="secondary">
          知识卡内容在生成时可注入。推荐用 @ 引用本知识库文件夹；表单「知识库召回」为旧路径，将随业务改版废弃。
        </Typography.Text>
      </Section>
    </div>
  );
}

function StyleCardBody({
  st,
  folderName,
}: {
  st: Record<string, unknown>;
  folderName: string;
}) {
  const styleSummary = typeof st.style_summary === 'string' ? st.style_summary : '';
  const styleTags = Array.isArray(st.style_tags) ? (st.style_tags as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const theme = typeof st.theme === 'string' ? st.theme : '';
  const mood = Array.isArray(st.mood) ? (st.mood as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const colorRules = typeof st.color_rules === 'string' ? st.color_rules : '';
  const typography = st.typography && typeof st.typography === 'object' ? (st.typography as Record<string, unknown>) : null;
  const composition = typeof st.composition === 'string' ? st.composition : '';
  const lighting = typeof st.lighting === 'string' ? st.lighting : '';
  const materials = Array.isArray(st.materials) ? (st.materials as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const designElements = Array.isArray(st.design_elements) ? (st.design_elements as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const motif = typeof st.motif === 'string' ? st.motif : '';
  const avoid = Array.isArray(st.avoid) ? (st.avoid as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const donts = Array.isArray(st.donts) ? (st.donts as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const avoidAll = [...avoid, ...donts.filter((d) => !avoid.includes(d))];
  const featureTags = Array.isArray(st.feature_tags) ? (st.feature_tags as unknown[]).filter((s): s is string => typeof s === 'string') : [];

  const palettes: Array<{ name?: string; roles?: string[]; colors: Array<{ hex: string; kind?: string; note?: string }> }> = [];
  if (Array.isArray(st.palettes)) {
    for (const p of st.palettes as Array<Record<string, unknown>>) {
      const colors: Array<{ hex: string; kind?: string; note?: string }> = [];
      if (Array.isArray(p.colors)) {
        for (const c of p.colors as Array<Record<string, unknown>>) {
          if (typeof c.hex === 'string') {
            colors.push({
              hex: c.hex as string,
              kind: typeof c.kind === 'string' ? (c.kind as string) : undefined,
              note: typeof c.note === 'string' ? (c.note as string) : undefined,
            });
          }
        }
      }
      palettes.push({
        name: typeof p.name === 'string' ? (p.name as string) : undefined,
        roles: Array.isArray(p.roles) ? (p.roles as unknown[]).filter((s): s is string => typeof s === 'string') : undefined,
        colors,
      });
    }
  }

  const exemplars = Array.isArray(st.exemplars)
    ? (st.exemplars as Array<Record<string, unknown>>)
        .filter((e) => !!e && typeof e === 'object')
        .map((e) => ({
          refKey: typeof e.ref_key === 'string' ? (e.ref_key as string) : '',
          url: typeof e.url === 'string' ? (e.url as string) : undefined,
          fitScore: typeof e.fit_score === 'number' ? (e.fit_score as number) : 0,
          featureTags: Array.isArray(e.feature_tags)
            ? (e.feature_tags as unknown[]).filter((t): t is string => typeof t === 'string')
            : [],
          caption: typeof e.caption === 'string' ? (e.caption as string) : '',
        }))
        .filter((e) => e.refKey)
    : [];

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Tag color="blue" style={{ fontWeight: 600 }}>
          {folderName}
        </Tag>
        <Tag>Top {exemplars.length} 样例</Tag>
        {featureTags.slice(0, 4).map((t, i) => (
          <Tag key={`feat-${i}`} style={{ marginInlineStart: 0 }}>
            {t}
          </Tag>
        ))}
      </div>

      {styleSummary ? (
        <Section title="视觉风格综述 · style_summary">
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(15,23,42,0.04)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            {styleSummary}
          </div>
        </Section>
      ) : null}

      {(styleTags.length > 0 || theme || mood.length > 0) ? (
        <Section title="风格定义">
          {styleTags.length > 0 ? <FieldRow label="style_tags" value={styleTags} /> : null}
          {theme ? <FieldRow label="theme" value={theme} /> : null}
          {mood.length > 0 ? <FieldRow label="mood" value={mood} /> : null}
          {motif ? <FieldRow label="motif" value={motif} /> : null}
        </Section>
      ) : null}

      {palettes.length > 0 ? (
        <Section title="调色板" count={palettes.length}>
          {palettes.map((p, i) => (
            <div key={`palette-${i}`} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <strong style={{ fontSize: 12 }}>{p.name ?? `Palette ${i + 1}`}</strong>
                {p.roles?.map((r, j) => (
                  <Tag key={`role-${i}-${j}`} style={{ marginInlineStart: 0, fontSize: 11 }}>
                    {r}
                  </Tag>
                ))}
              </div>
              <Space size={6} wrap>
                {p.colors.map((c, j) => (
                  <span
                    key={`${c.hex}-${j}`}
                    title={`${c.hex}${c.note ? ' · ' + c.note : ''}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: '1px solid rgba(148,163,184,0.20)',
                      background: 'rgba(15,23,42,0.04)',
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: c.hex,
                        border: '1px solid rgba(15, 23, 42, 0.12)',
                      }}
                    />
                    {c.kind === 'gradient' ? '◐' : '●'} {c.hex}
                    {c.note ? <span className="muted"> · {c.note}</span> : null}
                  </span>
                ))}
              </Space>
            </div>
          ))}
        </Section>
      ) : null}

      {(colorRules || typography || composition || lighting) ? (
        <Section title="工艺 / Craft">
          {colorRules ? <FieldRow label="color_rules" value={colorRules} /> : null}
          {composition ? <FieldRow label="composition" value={composition} /> : null}
          {lighting ? <FieldRow label="lighting" value={lighting} /> : null}
          {typography ? (
            <FieldRow
              label="typography"
              value={
                Object.entries(typography)
                  .map(([k, v]) => `${k}: ${String(v ?? '').trim()}`)
                  .join(' · ')
              }
            />
          ) : null}
          {materials.length > 0 ? <FieldRow label="materials" value={materials} /> : null}
          {designElements.length > 0 ? <FieldRow label="design_elements" value={designElements} /> : null}
        </Section>
      ) : null}

      {avoidAll.length > 0 ? (
        <Section title="避免 / DON'Ts">
          <Space size={4} wrap>
            {avoidAll.map((d, i) => (
              <Tag key={`avoid-${i}`} color="red" style={{ marginInlineStart: 0 }}>
                {d}
              </Tag>
            ))}
          </Space>
        </Section>
      ) : null}

      {exemplars.length > 0 ? (
        <Section title="Top 样例（按结合度）" count={exemplars.length}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {exemplars.map((e, i) => (
              <div
                key={e.refKey}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(15,23,42,0.04)',
                  border: '1px solid rgba(148,163,184,0.14)',
                }}
              >
                <StyleExemplarThumb url={e.url} refKey={e.refKey} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>#{i + 1}</strong>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: (e.fitScore >= 0.8 ? '#10b981' : e.fitScore >= 0.6 ? '#38bdf8' : '#f59e0b'),
                      }}
                    >
                      {(e.fitScore * 100).toFixed(0)}%
                    </span>
                    {e.featureTags.map((t, j) => (
                      <Tag key={`${e.refKey}-tag-${j}`} style={{ marginInlineStart: 0, fontSize: 11 }}>
                        {t}
                      </Tag>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
                    {e.refKey}
                  </div>
                  {e.caption ? (
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.86, lineHeight: 1.5 }}>
                      {e.caption}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </Space>
        </Section>
      ) : null}
    </div>
  );
}

function WritingCardBody({
  wr,
  folderName,
}: {
  wr: Record<string, unknown>;
  folderName: string;
}) {
  const voiceSummary = typeof wr.voice_summary === 'string' ? wr.voice_summary : '';
  const tone = Array.isArray(wr.tone)
    ? (wr.tone as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const register = typeof wr.register === 'string' ? wr.register : '';
  const genreTags = Array.isArray(wr.genre_tags)
    ? (wr.genre_tags as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const structureBias = typeof wr.structure_bias === 'string' ? wr.structure_bias : '';
  const lexiconRules = typeof wr.lexicon_rules === 'string' ? wr.lexicon_rules : '';
  const rhythmFeel = typeof wr.rhythm_feel === 'string' ? wr.rhythm_feel : '';
  const personPov = typeof wr.person_pov === 'string' ? wr.person_pov : '';
  const rhetoricBias = Array.isArray(wr.rhetoric_bias)
    ? (wr.rhetoric_bias as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const avoid = Array.isArray(wr.avoid)
    ? (wr.avoid as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const variants = Array.isArray(wr.variants)
    ? (wr.variants as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const exemplars = Array.isArray(wr.exemplars)
    ? (wr.exemplars as Array<Record<string, unknown>>)
        .filter((e) => !!e && typeof e === 'object')
        .map((e) => ({
          refKey: typeof e.ref_key === 'string' ? e.ref_key : '',
          title: typeof e.title === 'string' ? e.title : '',
          fitScore: typeof e.fit_score === 'number' ? e.fit_score : 0,
          featureTags: Array.isArray(e.feature_tags)
            ? (e.feature_tags as unknown[]).filter((t): t is string => typeof t === 'string')
            : [],
        }))
        .filter((e) => e.refKey)
    : [];

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Tag color="purple" style={{ fontWeight: 600 }}>
          {folderName}
        </Tag>
        <Tag>Top {exemplars.length} 样例</Tag>
        {genreTags.slice(0, 4).map((t, i) => (
          <Tag key={`genre-${i}`} style={{ marginInlineStart: 0 }}>
            {t}
          </Tag>
        ))}
      </div>

      {voiceSummary ? (
        <Section title="语感综述 · voice_summary">
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(15,23,42,0.04)',
              border: '1px solid rgba(148,163,184,0.14)',
            }}
          >
            {voiceSummary}
          </div>
        </Section>
      ) : null}

      {(tone.length > 0 || register || personPov || rhythmFeel) ? (
        <Section title="语气 / 语域 / 节奏">
          {tone.length > 0 ? <FieldRow label="tone" value={tone} /> : null}
          {register ? <FieldRow label="register" value={register} /> : null}
          {personPov ? <FieldRow label="person_pov" value={personPov} /> : null}
          {rhythmFeel ? <FieldRow label="rhythm_feel" value={rhythmFeel} /> : null}
        </Section>
      ) : null}

      {(structureBias || lexiconRules || rhetoricBias.length > 0) ? (
        <Section title="结构 / 用词 / 修辞">
          {structureBias ? <FieldRow label="structure_bias" value={structureBias} /> : null}
          {lexiconRules ? <FieldRow label="lexicon_rules" value={lexiconRules} /> : null}
          {rhetoricBias.length > 0 ? <FieldRow label="rhetoric_bias" value={rhetoricBias} /> : null}
        </Section>
      ) : null}

      {variants.length > 0 ? (
        <Section title="变体">
          <FieldRow label="variants" value={variants} />
        </Section>
      ) : null}

      {avoid.length > 0 ? (
        <Section title="避免 / DON'Ts">
          <Space size={4} wrap>
            {avoid.map((d, i) => (
              <Tag key={`avoid-${i}`} color="red" style={{ marginInlineStart: 0 }}>
                {d}
              </Tag>
            ))}
          </Space>
        </Section>
      ) : null}

      {exemplars.length > 0 ? (
        <Section title="Top 样例（按结合度）" count={exemplars.length}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {exemplars.map((e, i) => (
              <div
                key={e.refKey}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(15,23,42,0.04)',
                  border: '1px solid rgba(148,163,184,0.14)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>#{i + 1}</strong>
                  {e.title ? <span style={{ fontSize: 13 }}>{e.title}</span> : null}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color:
                        e.fitScore >= 0.8 ? '#10b981' : e.fitScore >= 0.6 ? '#38bdf8' : '#f59e0b',
                    }}
                  >
                    {(e.fitScore * 100).toFixed(0)}%
                  </span>
                  {e.featureTags.map((t, j) => (
                    <Tag key={`${e.refKey}-tag-${j}`} style={{ marginInlineStart: 0, fontSize: 11 }}>
                      {t}
                    </Tag>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 4, wordBreak: 'break-all' }}>
                  {e.refKey}
                </div>
              </div>
            ))}
          </Space>
        </Section>
      ) : null}
    </div>
  );
}

export default function KnowledgeBase() {
  const { t } = useTranslation();
  const { modal } = App.useApp();
  const { isLoggedIn } = useAuth();
  const {
    job: parseJob,
    isParsing,
    startParse,
    pendingViewFolderId,
    clearPendingView,
  } = useKnowledgeBaseParse();

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<KnowledgeFolderContentItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [linkCounts, setLinkCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const selectedInitializedRef = useRef(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'list' | 'data'>('list');

  const indexing = isParsing && parseJob?.folderId === selectedFolderId;

  const { openLink, previewModals } = useKnowledgeFolderLinkPreview();

  const loadFolders = useCallback(async (force = false) => {
    if (!isLoggedIn) return;
    const list = await getKnowledgeFolders(force ? { force: true } : undefined);
    setFolders(list);
    if (!selectedInitializedRef.current && list.length > 0) {
      selectedInitializedRef.current = true;
      setSelectedFolderId(list[0].id);
    }
  }, [isLoggedIn]);

  const loadFolderItems = useCallback(async (folderId: string, force = false) => {
    const cached = !force ? peekKnowledgeFolderItems(folderId) : undefined;
    if (cached?.items) {
      setItems(cached.items);
      if (cached.folder) setCurrentFolder(cached.folder as FolderItem);
      setLinkCounts((prev) => ({ ...prev, [folderId]: cached.links_count ?? 0 }));
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }
    try {
      const data = await getKnowledgeFolderItems(folderId, force ? { force: true } : undefined);
      setItems(data.items ?? []);
      if (data.folder) setCurrentFolder(data.folder as FolderItem);
      setLinkCounts((prev) => ({ ...prev, [folderId]: data.links_count ?? 0 }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) void loadFolders();
  }, [isLoggedIn, loadFolders]);

  useEffect(() => {
    if (selectedFolderId) void loadFolderItems(selectedFolderId);
    else {
      setItems([]);
      setCurrentFolder(null);
    }
  }, [selectedFolderId, loadFolderItems]);

  useEffect(() => {
    // 从全局挂窗点「查看解析数据」跳回时，选中对应夹并打开详情
    if (!pendingViewFolderId) return;
    setSelectedFolderId(pendingViewFolderId);
    setDetailTab('data');
    clearPendingView();
  }, [pendingViewFolderId, clearPendingView]);

  const handledFinishRef = useRef<number | null>(null);
  useEffect(() => {
    // 解析终态后刷新当前夹（即使用户曾切走过路由）
    if (!parseJob?.finishedAt) return;
    if (handledFinishRef.current === parseJob.finishedAt) return;
    if (
      parseJob.terminal !== 'success' &&
      parseJob.terminal !== 'error' &&
      parseJob.terminal !== 'timeout'
    ) {
      return;
    }
    handledFinishRef.current = parseJob.finishedAt;
    const folderId = parseJob.folderId;
    void loadFolders(true);
    if (selectedFolderId === folderId) {
      void loadFolderItems(folderId, true);
    }
  }, [
    parseJob?.finishedAt,
    parseJob?.terminal,
    parseJob?.folderId,
    selectedFolderId,
    loadFolders,
    loadFolderItems,
  ]);

  const getItemCount = useCallback(
    (folderId: string | null) => {
      if (!folderId) return 0;
      return linkCounts[folderId] ?? 0;
    },
    [linkCounts]
  );

  const displayedItems = useMemo(() => {
    // 平铺结构：内容区不展示子文件夹入口
    let list = items.filter((it) => it.type !== 'dir');
    if (searchKeyword.trim()) {
      const q = searchKeyword.trim().toLowerCase();
      list = list.filter((it) => {
        return it.name.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
      });
    }
    return list;
  }, [items, searchKeyword]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const res = await createKnowledgeFolder(newFolderName.trim(), null);
    if (res.error) {
      notification.error({ message: res.error, placement: 'top' });
      return;
    }
    setCreateOpen(false);
    setNewFolderName('');
    notification.success({ message: t('assets.knowledgeBase.folderCreated'), placement: 'top' });
    await loadFolders(true);
    const created = res.data?.data;
    if (created?.id) setSelectedFolderId(created.id);
  };

  const openCreateModal = () => {
    setNewFolderName('');
    setCreateOpen(true);
  };

  const handleDeleteFolder = (folderId: string) => {
    modal.confirm({
      title: t('assets.knowledgeBase.deleteFolderTitle'),
      content: t('assets.knowledgeBase.deleteFolderContent'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const res = await deleteKnowledgeFolder(folderId);
        if (res.error) {
          notification.error({ message: res.error, placement: 'top' });
          return;
        }
        if (selectedFolderId === folderId) setSelectedFolderId(null);
        await loadFolders(true);
        notification.success({ message: t('assets.knowledgeBase.deleted'), placement: 'top' });
      },
    });
  };

  const handleRemoveLink = (item: KnowledgeFolderLinkItem) => {
    if (!selectedFolderId) return;
    modal.confirm({
      title: t('assets.knowledgeBase.removeLinkTitle'),
      content: t('assets.knowledgeBase.removeLinkContent', { name: item.name }),
      okButtonProps: { danger: true },
      onOk: async () => {
        const refType = item.ref_type;
        const res = await removeKnowledgeFolderLink(selectedFolderId, item.id, refType);
        if (res.error) {
          notification.error({ message: res.error, placement: 'top' });
          return;
        }
        await loadFolderItems(selectedFolderId);
        notification.success({ message: t('assets.knowledgeBase.linkRemoved'), placement: 'top' });
      },
    });
  };

  const handleAddLinks = async (selectedIds: string[], mode: 'task' | 'upload') => {
    if (!selectedFolderId || selectedIds.length === 0) return;
    let ok = 0;
    for (const id of selectedIds) {
      const res =
        mode === 'task'
          ? await addKnowledgeFolderTaskLink(selectedFolderId, id)
          : await addKnowledgeFolderStorageLink(selectedFolderId, id);
      if (!res.error) ok += 1;
    }
    setAddLinkOpen(false);
    await loadFolderItems(selectedFolderId);
    await loadFolders(true);
    notification.success({
      message: t('assets.knowledgeBase.linksAdded', { count: ok }),
      placement: 'top',
    });
  };

  const handleIndexFolder = async (opts?: { skipTagCheck?: boolean }) => {
    if (!selectedFolderId) return;
    const tagNow =
      folders.find((f) => f.id === selectedFolderId)?.card_tag ??
      currentFolder?.card_tag ??
      null;
    if (!opts?.skipTagCheck && !tagNow) {
      notification.warning({
        message: '请先打标（视觉风格/语感文风/角色/知识）后再解析',
        placement: 'top',
      });
      return;
    }
    const folderName =
      folders.find((f) => f.id === selectedFolderId)?.name ??
      currentFolder?.name ??
      '';
    await startParse({
      folderId: selectedFolderId,
      folderName,
      cardTag: (tagNow ?? '') as FolderCardTag | '',
    });
  };

  const handleCardTagChange = async (value: FolderCardTag | '') => {
    if (!selectedFolderId) return;
    const tag = value === '' ? null : value;
    // 乐观更新，避免切换后顶部仍显示旧标签
    setFolders((prev) =>
      prev.map((f) =>
        f.id === selectedFolderId
          ? { ...f, card_tag: tag, card_status: tag ? 'idle' : 'idle' }
          : f
      )
    );
    setCurrentFolder((prev) =>
      prev && prev.id === selectedFolderId
        ? { ...prev, card_tag: tag, card_status: tag ? 'idle' : 'idle' }
        : prev
    );
    const res = await updateKnowledgeFolderCardTag(selectedFolderId, tag);
    if (res.error) {
      notification.error({ message: res.error, placement: 'top' });
      await loadFolders(true);
      return;
    }
    const updated =
      (res.data as { data?: FolderItem } | FolderItem | undefined) &&
      'id' in (res.data as object)
        ? (res.data as FolderItem)
        : (res.data as { data?: FolderItem } | undefined)?.data;
    if (updated?.id) {
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)));
      setCurrentFolder((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
    }
    notification.success({
      message: tag ? `已打标为${CARD_TAG_OPTIONS.find((o) => o.value === tag)?.label}` : '已清除标签',
      placement: 'top',
    });
    await loadFolders(true);
    await loadFolderItems(selectedFolderId, true);
    if (tag) {
      void handleIndexFolder({ skipTagCheck: true });
    }
  };

  // 以侧栏列表为准（含 card_tag），items 接口补齐详情
  const selectedFolder = useMemo(() => {
    const fromList = folders.find((f) => f.id === selectedFolderId) ?? null;
    if (!fromList && !currentFolder) return null;
    if (!fromList) return currentFolder;
    if (!currentFolder || currentFolder.id !== fromList.id) return fromList;
    return { ...currentFolder, ...fromList };
  }, [folders, selectedFolderId, currentFolder]);

  const indexStatus = selectedFolder?.index_status ?? 'none';
  const cardTag = selectedFolder?.card_tag ?? null;
  const cardStatus = selectedFolder?.card_status ?? 'idle';

  const styleExemplars = useMemo(() => {
    if (cardTag !== 'style' && cardTag !== 'writing') return [];
    const packKey = cardTag === 'writing' ? 'writing' : 'style';
    const pack = (selectedFolder?.card_summary as Record<string, { exemplars?: unknown }> | null)?.[
      packKey
    ];
    const raw = Array.isArray(pack?.exemplars) ? pack!.exemplars! : [];
    return raw
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .slice(0, 5)
      .map((e) => ({
        ref_key: String(e.ref_key ?? ''),
        fit_score: typeof e.fit_score === 'number' ? e.fit_score : 0,
        feature_tags: Array.isArray(e.feature_tags)
          ? e.feature_tags.filter((t): t is string => typeof t === 'string')
          : [],
      }))
      .filter((e) => e.ref_key);
  }, [cardTag, selectedFolder?.card_summary]);

  const characterCardView = useMemo(() => {
    if (cardTag !== 'character') return null;
    const ch = (selectedFolder?.card_summary as { character?: Record<string, unknown> } | null)
      ?.character;
    if (!ch) return null;
    const name =
      ch.display_name && typeof ch.display_name === 'object'
        ? String((ch.display_name as { value?: string }).value ?? '')
        : typeof ch.display_name === 'string'
          ? ch.display_name
          : '';
    const brief =
      typeof ch.character_brief === 'string'
        ? ch.character_brief
        : typeof ch.description === 'string'
          ? ch.description
          : '';
    const media = Array.isArray(ch.media_assets) ? ch.media_assets : [];
    const multi = media.filter(
      (m): m is Record<string, unknown> =>
        !!m && typeof m === 'object' && (m as { is_multi_panel?: boolean }).is_multi_panel === true
    );
    const refCount = Array.isArray(ch.appearance_ref_ids) ? ch.appearance_ref_ids.length : 0;
    return { name, brief: brief.slice(0, 280), multiPanelCount: multi.length, refCount };
  }, [cardTag, selectedFolder?.card_summary]);

  const handleSaveFeatureTags = async (link: KnowledgeFolderLinkItem, tags: string[]) => {
    if (!selectedFolderId || !link.folder_item_id) {
      notification.error({ message: '无法保存标签：缺少条目 ID', placement: 'top' });
      return;
    }
    const res = await updateKnowledgeFolderItemFeatureTags(
      selectedFolderId,
      link.folder_item_id,
      tags
    );
    if (res.error) {
      notification.error({ message: res.error, placement: 'top' });
      throw new Error(res.error);
    }
    const saved =
      (res.data as { data?: { feature_tags?: string[] } } | undefined)?.data?.feature_tags ?? tags;
    setItems((prev) =>
      prev.map((it) => {
        if (it.type !== 'link') return it;
        if (it.ref_type !== link.ref_type || it.id !== link.id) return it;
        return { ...it, feature_tags: saved };
      })
    );
    // 同步侧栏/当前夹 card_summary 中 exemplars 标签（若在 Top5）
    setCurrentFolder((prev) => {
      if (!prev || prev.id !== selectedFolderId) return prev;
      const summary = { ...(prev.card_summary ?? {}) } as Record<string, unknown>;
      const packKey = prev.card_tag === 'writing' ? 'writing' : 'style';
      const packRaw = summary[packKey];
      if (!packRaw || typeof packRaw !== 'object' || Array.isArray(packRaw)) return prev;
      const pack = { ...(packRaw as Record<string, unknown>) };
      const refKey = `${link.ref_type}:${link.id}`;
      if (Array.isArray(pack.exemplars)) {
        pack.exemplars = pack.exemplars.map((ex) => {
          if (!ex || typeof ex !== 'object') return ex;
          const e = ex as Record<string, unknown>;
          if (String(e.ref_key) !== refKey) return ex;
          return { ...e, feature_tags: saved };
        });
      }
      summary[packKey] = pack;
      return { ...prev, card_summary: summary };
    });
  };

  return (
    <section className="page-card asset-center asset-center--vf">
      <AssetCenterPageHeader
        title={t('assets.knowledgeBase.title')}
        hint={{
          title: t('assets.knowledgeBase.hintTitle'),
          description:
            '平铺资产夹。打标为视觉风格/语感文风/角色/知识后才会解析；任务表单可通过挂卡注入参考图、语感、音色与知识。',
        }}
        stats={
          selectedFolder ? (
            <>
              {cardTag ? (
                <Tag color="blue">
                  {CARD_TAG_OPTIONS.find((o) => o.value === cardTag)?.label ?? cardTag}
                </Tag>
              ) : (
                <Tag>普通夹</Tag>
              )}
              {cardTag ? (
                <Tag color={cardStatusColor(cardStatus)}>{cardStatusLabel(cardStatus)}</Tag>
              ) : null}
              {/* 「已向量化 / 索引中 / 需重索引」这些 tag 只对有 embedding 的业务才有意义
                  （card_tag=knowledge 或无 tag 的通用 emb 流程）。character / style / writing 是
                  LLM 汇总，没有向量库，向量化概念不适用。 */}
              {(cardTag === 'knowledge' || cardTag === null || cardTag === '') &&
              indexStatus === 'indexed' ? (
                <Tag color="green">{t('assets.knowledgeBase.indexed')}</Tag>
              ) : null}
              {(cardTag === 'knowledge' || cardTag === null || cardTag === '') &&
              indexStatus === 'stale' ? (
                <Tag color="orange">{t('assets.knowledgeBase.stale')}</Tag>
              ) : null}
              {(cardTag === 'knowledge' || cardTag === null || cardTag === '') &&
              indexStatus === 'indexing' ? (
                <Tag color="blue">{t('assets.knowledgeBase.indexing')}</Tag>
              ) : null}
              {selectedFolder.is_system ? <Tag color="gold">系统共享</Tag> : null}
            </>
          ) : null
        }
        actions={
          <>
            {selectedFolderId ? (
              <Select
                size="middle"
                style={{ minWidth: 168 }}
                value={cardTag ?? ''}
                options={CARD_TAG_OPTIONS}
                onChange={(v) => void handleCardTagChange(v as FolderCardTag | '')}
                disabled={!isLoggedIn || !!selectedFolder?.is_system}
              />
            ) : null}
            <Button
              type="primary"
              size="middle"
              className="asset-center-btn-add"
              disabled={!isLoggedIn || !selectedFolderId}
              onClick={() => setAddLinkOpen(true)}
            >
              {t('assets.knowledgeBase.addLink')}
            </Button>
            <Button
              className="asset-center-btn-index"
              disabled={!selectedFolderId || indexing || !cardTag}
              loading={indexing}
              onClick={() => void handleIndexFolder()}
            >
              <span className="ui-label--full">
                {indexing
                  ? '解析中…'
                  : cardStatus === 'stale'
                    ? '重新解析'
                    : cardTag
                      ? '解析此卡'
                      : '先打标再解析'}
              </span>
              <span className="ui-label--short">{indexing ? '解析中' : '解析'}</span>
            </Button>
            <Button
              className="asset-center-btn-refresh"
              disabled={!selectedFolderId || (loading && items.length === 0)}
              onClick={() => selectedFolderId && void loadFolderItems(selectedFolderId, true)}
            >
              {t('common.refresh')}
            </Button>
          </>
        }
      />

      <div className="asset-center-layout">
        <AssetCenterSidebar
          title="文件夹"
          onNewFolder={openCreateModal}
        >
          <KnowledgeFolderTreeSidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelect={setSelectedFolderId}
            onDeleteFolder={handleDeleteFolder}
            getItemCount={getItemCount}
          />
        </AssetCenterSidebar>

        <div className="asset-center-main">
          <div className="asset-filters">
            {selectedFolder ? (
              <div className="asset-folder-heading">
                <h3 className="asset-folder-heading__name">{selectedFolder.name}</h3>
                {cardTag ? (
                  <span className={`asset-folder-chip asset-folder-chip--${cardTag}`}>
                    {CARD_TAG_OPTIONS.find((o) => o.value === cardTag)?.label}
                  </span>
                ) : (
                  <span className="asset-folder-chip asset-folder-chip--plain">普通管理</span>
                )}
                {((cardTag === 'style' || cardTag === 'writing') &&
                  (styleExemplars.length > 0 ||
                    selectedFolder?.card_status === 'ready')) ||
                (cardTag === 'character' && Boolean(characterCardView)) ||
                (cardTag === 'knowledge' && selectedFolder?.index_status === 'indexed') ? (
                  <Button
                    size="small"
                    type={detailTab === 'data' ? 'primary' : 'default'}
                    onClick={() =>
                      setDetailTab((t) => (t === 'data' ? 'list' : 'data'))
                    }
                  >
                    {detailTab === 'data' ? '返回资源列表' : '查看解析数据'}
                  </Button>
                ) : null}
                <span className="muted" style={{ fontSize: 12 }}>
                  {cardTag === 'character' && characterCardView
                    ? `refs ${characterCardView.refCount}/10${
                        characterCardView.multiPanelCount > 0
                          ? ` · multi-panel ×${characterCardView.multiPanelCount}`
                          : ''
                      }`
                    : (cardTag === 'style' || cardTag === 'writing') && styleExemplars.length > 0
                      ? `Top ${styleExemplars.length} 样例`
                      : ''}
                </span>
              </div>
            ) : null}
            {detailTab === 'list' ? (
              <Input
                placeholder={t('assets.knowledgeBase.searchPlaceholder')}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{ width: 220, marginLeft: 'auto' }}
                allowClear
              />
            ) : null}
          </div>

          {detailTab === 'data' && selectedFolder ? (
            <div
              className="vf-detail-scroll"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: 4,
              }}
            >
              {cardTag === 'character' &&
              (selectedFolder.card_summary as { character?: Record<string, unknown> } | null)?.character ? (
                <CharacterCardBody
                  ch={
                    (selectedFolder.card_summary as { character: Record<string, unknown> }).character
                  }
                  folderName={selectedFolder.name}
                />
              ) : cardTag === 'style' &&
                (selectedFolder.card_summary as { style?: Record<string, unknown> } | null)?.style ? (
                <StyleCardBody
                  st={(selectedFolder.card_summary as { style: Record<string, unknown> }).style}
                  folderName={selectedFolder.name}
                />
              ) : cardTag === 'writing' &&
                (selectedFolder.card_summary as { writing?: Record<string, unknown> } | null)
                  ?.writing ? (
                <WritingCardBody
                  wr={(selectedFolder.card_summary as { writing: Record<string, unknown> }).writing}
                  folderName={selectedFolder.name}
                />
              ) : cardTag === 'knowledge' ? (
                <KnowledgeDetailView folder={selectedFolder} />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无解析数据"
                />
              )}
            </div>
          ) : !isLoggedIn ? (
            <div className="asset-center-empty">
              <p className="muted">{t('assets.knowledgeBase.pleaseLogin')}</p>
            </div>
          ) : !selectedFolderId ? (
            <div className="asset-center-empty">
              <Empty description={t('assets.knowledgeBase.selectOrCreate')} />
            </div>
          ) : (
            <div className="vf-content-scroll">
              <KnowledgeFolderContentList
                items={displayedItems}
                loading={loading}
                refreshing={refreshing}
                emptyDescription={
                  searchKeyword.trim()
                    ? t('assets.knowledgeBase.noMatch')
                    : t('assets.knowledgeBase.emptyFolder')
                }
                onOpenDir={() => undefined}
                onOpenLink={(link) => void openLink(link)}
                onRemoveLink={handleRemoveLink}
                enableFeatureTags={
                  (cardTag === 'style' || cardTag === 'writing') && !selectedFolder?.is_system
                }
                onSaveFeatureTags={handleSaveFeatureTags}
              />
            </div>
          )}
        </div>
      </div>

      {previewModals}

      <Modal
        title={t('assets.knowledgeBase.createFolderTitle')}
        open={createOpen}
        onOk={() => void handleCreateFolder()}
        onCancel={() => setCreateOpen(false)}
        okText={t('assets.knowledgeBase.create')}
      >
        <Input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder={t('assets.knowledgeBase.folderNamePlaceholder')}
          maxLength={50}
          onPressEnter={() => void handleCreateFolder()}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          {t('assets.knowledgeBase.createAsRoot')}
        </p>
      </Modal>

      <KnowledgeFolderLinkPicker
        open={addLinkOpen}
        onClose={() => setAddLinkOpen(false)}
        onConfirm={handleAddLinks}
      />
    </section>
  );
}
