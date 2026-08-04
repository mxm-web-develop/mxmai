import React, { useEffect, useMemo, useState } from 'react';
import { Button, Typography, message, Tooltip } from 'antd';
import {
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Lock,
  Plus,
} from 'lucide-react';
import type { TaskTemplateDraft } from './AdminBusiness.types';
import { PageHint, PageHintsBar } from '../components/PageHint';
import {
  CONTRACT_REF_PATH,
  SKILL_MD_PATH,
  buildSkillTreeNodes,
  ensureCoreSkillPack,
  isLockedSkillPath,
  readSkillPackFromDraftExtra,
  type SkillPack,
  type SkillTreeNode,
  upsertSkillFile,
} from './admin-core-skill';
import { SkillAtEditor } from './SkillAtEditor';
import './AdminBusinessCoreSkillTab.css';

export interface AdminBusinessCoreSkillTabProps {
  draft: TaskTemplateDraft | null;
  scope: string;
  type: string;
  subtype: string | null;
  onDraftChange: (d: TaskTemplateDraft) => void;
}

function fileGlyph(path: string) {
  if (path.endsWith('.mjs') || path.endsWith('.js') || path.endsWith('.ts')) {
    return <FileCode2 size={16} strokeWidth={1.75} />;
  }
  return <FileText size={16} strokeWidth={1.75} />;
}

export function AdminBusinessCoreSkillTab({
  draft,
  scope,
  type,
  subtype,
  onDraftChange,
}: AdminBusinessCoreSkillTabProps) {
  const pack = useMemo(() => {
    if (!draft) return null;
    const existing = readSkillPackFromDraftExtra(draft.extra as Record<string, unknown> | undefined);
    const seed =
      draft.prompt?.unifiedTemplate?.trim() ||
      ((draft.extra as { groupOutput?: { itemManuscript?: { systemPrompt?: string } } } | undefined)
        ?.groupOutput?.itemManuscript?.systemPrompt ?? '');
    return ensureCoreSkillPack({
      pack: existing,
      contractSchema: (draft.contractSchema ?? draft.formSchema) as Record<string, unknown>,
      scope,
      type,
      subtype: subtype ?? '',
      seedBody: seed,
    });
  }, [draft, scope, type, subtype]);

  const [selectedPath, setSelectedPath] = useState(SKILL_MD_PATH);
  const [editBuffer, setEditBuffer] = useState('');
  const editBufferRef = React.useRef('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    'references/': true,
    'scripts/': true,
  });

  useEffect(() => {
    if (!pack || !draft) return;
    const prev = readSkillPackFromDraftExtra(draft.extra as Record<string, unknown> | undefined);
    const same =
      prev &&
      JSON.stringify(prev.files) === JSON.stringify(pack.files) &&
      (draft.extra as { skillMode?: string } | undefined)?.skillMode === 'core-skill';
    if (same) return;
    onDraftChange({
      ...draft,
      extra: {
        ...(draft.extra ?? {}),
        skillMode: 'core-skill',
        skillPack: pack,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when pack identity from schema/seed changes
  }, [pack]);

  useEffect(() => {
    if (!pack) return;
    const f = pack.files.find((x) => x.path === selectedPath);
    const content = f?.content ?? '';
    setEditBuffer(content);
    editBufferRef.current = content;
  }, [pack, selectedPath]);

  const nodes = useMemo(() => (pack ? buildSkillTreeNodes(pack) : []), [pack]);
  const locked = isLockedSkillPath(selectedPath);
  const isDir = selectedPath.endsWith('/');
  const selectedTitle = useMemo(() => {
    if (selectedPath === SKILL_MD_PATH) return 'SKILL.md';
    const parts = selectedPath.split('/').filter(Boolean);
    return parts[parts.length - 1] || selectedPath;
  }, [selectedPath]);

  /** @ 联想 / 高亮：包内全部文件路径 */
  const mentionOptions = useMemo(() => {
    if (!pack) return [];
    return pack.files.map((f) => {
      const base = f.path.includes('/') ? f.path.split('/').pop()! : f.path;
      return {
        path: f.path,
        title: base,
        locked: Boolean(f.readonly || isLockedSkillPath(f.path)),
      };
    });
  }, [pack]);

  const commitFile = (nextContent: string) => {
    if (!draft || !pack || locked || isDir) return;
    const nextPack = upsertSkillFile(pack, {
      path: selectedPath,
      content: nextContent,
      readonly: false,
    });
    onDraftChange({
      ...draft,
      extra: {
        ...(draft.extra ?? {}),
        skillMode: 'core-skill',
        skillPack: nextPack,
      },
      prompt: {
        ...draft.prompt,
        unifiedTemplate:
          selectedPath === SKILL_MD_PATH
            ? nextContent.replace(/^---[\s\S]*?\n---\s*/, '').trim() || draft.prompt.unifiedTemplate
            : draft.prompt.unifiedTemplate,
      },
    });
  };

  const addFile = (kind: 'references' | 'scripts') => {
    if (!draft || !pack) return;
    const base = kind === 'references' ? 'references/custom.md' : 'scripts/helper.mjs';
    let path = base;
    let i = 1;
    while (pack.files.some((f) => f.path === path)) {
      path =
        kind === 'references' ? `references/custom-${i}.md` : `scripts/helper-${i}.mjs`;
      i += 1;
    }
    const nextPack = upsertSkillFile(pack, {
      path,
      content: kind === 'references' ? '# Custom reference\n\n' : '// custom script (documentation / hooks)\n',
      readonly: false,
    });
    onDraftChange({
      ...draft,
      extra: { ...(draft.extra ?? {}), skillMode: 'core-skill', skillPack: nextPack },
    });
    setExpanded((prev) => ({ ...prev, [`${kind}/`]: true }));
    setSelectedPath(path);
    message.success(`已创建 ${path.split('/').pop()}`);
  };

  const removeFile = () => {
    if (!draft || !pack || locked || selectedPath === SKILL_MD_PATH || isDir) return;
    const nextPack: SkillPack = {
      version: 1,
      files: pack.files.filter((f) => f.path !== selectedPath),
    };
    onDraftChange({
      ...draft,
      extra: { ...(draft.extra ?? {}), skillMode: 'core-skill', skillPack: nextPack },
    });
    setSelectedPath(SKILL_MD_PATH);
  };

  const toggleFolder = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: SkillTreeNode, depth: number): React.ReactNode => {
    if (node.kind === 'folder') {
      const open = expanded[node.path] !== false;
      return (
        <li key={node.key}>
          <button
            type="button"
            className="admin-core-skill-ios__row is-folder"
            style={{ paddingLeft: 4 + depth * 12 }}
            onClick={() => toggleFolder(node.path)}
            aria-expanded={open}
          >
            <span className={`admin-core-skill-ios__chevron${open ? ' is-open' : ''}`}>
              <ChevronRight size={14} strokeWidth={2.25} />
            </span>
            <span className="admin-core-skill-ios__glyph">
              {open ? <FolderOpen size={17} strokeWidth={1.75} /> : <Folder size={17} strokeWidth={1.75} />}
            </span>
            <span className="admin-core-skill-ios__label">{node.title}</span>
          </button>
          {open && node.children && node.children.length > 0 ? (
            <ul className="admin-core-skill-ios__children">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          ) : null}
          {open && (!node.children || node.children.length === 0) ? (
            <div
              style={{
                padding: '4px 8px 8px 36px',
                fontSize: 12,
                color: 'rgba(60,60,67,0.45)',
              }}
            >
              空文件夹
            </div>
          ) : null}
        </li>
      );
    }

    const active = node.path === selectedPath;
    return (
      <li key={node.key}>
        <button
          type="button"
          className={`admin-core-skill-ios__row${active ? ' is-selected' : ''}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          onClick={() => setSelectedPath(node.path)}
        >
          <span className="admin-core-skill-ios__chevron is-spacer" aria-hidden>
            <ChevronRight size={14} />
          </span>
          <span className="admin-core-skill-ios__glyph is-file">{fileGlyph(node.path)}</span>
          <span className="admin-core-skill-ios__label" title={node.path}>
            {node.title}
          </span>
          {node.locked ? (
            <span className="admin-core-skill-ios__lock" title="平台锁定，不可编辑">
              <Lock size={10} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
              只读
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  if (!draft || !pack) {
    return <Typography.Text type="secondary">请先选择业务</Typography.Text>;
  }

  return (
    <div className="admin-core-skill-ios">
      <div className="page-card-title-row" style={{ fontWeight: 700 }}>
        <span className="page-card-title-row__text">
          {scope === 'text' ? 'Skill' : 'Core Skill'}
        </span>
      </div>
      <PageHintsBar>
        <PageHint
          title="Anthropic Skill 目录"
          description="左侧为包内层级树。编辑时输入 @ 可联想引用包内其它文件，选中后高亮显示。合同与 invoke-* 只读。"
        />
        <PageHint
          title="只读文件"
          description={`${CONTRACT_REF_PATH} 随合同字段 Schema 更新；scripts/invoke-* 按 generator/group/series（或 text）生成，不可改。`}
        />
      </PageHintsBar>

      <div className="admin-core-skill-ios__workspace">
        <aside className="admin-core-skill-ios__sidebar" aria-label="Skill 文件树">
          <div className="admin-core-skill-ios__sidebar-head">
            <span className="admin-core-skill-ios__sidebar-title">文件</span>
            <div className="admin-core-skill-ios__sidebar-actions">
              <Tooltip title="新建 reference">
                <button
                  type="button"
                  className="admin-core-skill-ios__icon-btn"
                  onClick={() => addFile('references')}
                  aria-label="新建 reference"
                >
                  <Plus size={16} strokeWidth={2.25} />
                </button>
              </Tooltip>
              <Tooltip title="新建 script">
                <button
                  type="button"
                  className="admin-core-skill-ios__icon-btn"
                  onClick={() => addFile('scripts')}
                  aria-label="新建 script"
                >
                  <FileCode2 size={15} strokeWidth={2} />
                </button>
              </Tooltip>
            </div>
          </div>
          <ul className="admin-core-skill-ios__tree">{nodes.map((n) => renderNode(n, 0))}</ul>
        </aside>

        <section className="admin-core-skill-ios__editor" aria-label="文件编辑">
          <div className="admin-core-skill-ios__editor-bar">
            <span className="admin-core-skill-ios__editor-path" title={selectedPath}>
              {selectedTitle}
            </span>
            {locked ? (
              <span className="admin-core-skill-ios__lock">
                <Lock size={10} strokeWidth={2.5} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
                只读
              </span>
            ) : null}
            {!locked && selectedPath !== SKILL_MD_PATH && !isDir ? (
              <Button size="small" danger type="text" onClick={removeFile}>
                删除
              </Button>
            ) : null}
          </div>
          <div className="admin-core-skill-ios__editor-body">
            {isDir ? (
              <Typography.Text type="secondary">选择具体文件进行编辑</Typography.Text>
            ) : (
              <SkillAtEditor
                value={editBuffer}
                disabled={locked}
                options={mentionOptions}
                excludePath={selectedPath}
                placeholder="输入 @ 引用包内其它文件…"
                onChange={(v) => {
                  setEditBuffer(v);
                  editBufferRef.current = v;
                }}
                onBlurCommit={() => {
                  if (!locked) commitFile(editBufferRef.current);
                }}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
