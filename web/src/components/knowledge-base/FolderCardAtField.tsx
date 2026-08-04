/**
 * 知识卡引用：两种模式
 * - pick：只选卡（推荐 chips + 搜索过滤），无自由文本、无 @
 * - compose：语气手填 + @ 挂卡（行业日报「其他」等）
 * 禁止独立「空白输入框手填 ID」式挂卡。
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Tag } from 'antd';
import {
  getKnowledgeFolders,
  getSystemKnowledgeFolders,
  type FolderCardTag,
  type FolderItem,
} from '../../api/client';
import { useKnowledgeBaseParse } from '../../context/KnowledgeBaseParseContext';
import './folder-card-at-field.css';

export type FolderCardMode = 'pick' | 'compose';

export type FolderCardAtFieldProps = {
  cardTag: FolderCardTag;
  value?: string | null;
  onChange?: (folderId: string | null, folder?: FolderItem | null) => void;
  /** 与文本同框时：当前文本（语气说明等）；仅 compose */
  textValue?: string;
  onTextChange?: (text: string) => void;
  /**
   * true → compose（文本 + @卡）；false → pick（只选卡）
   * 也可用 mode 显式指定；mode 优先。
   */
  withText?: boolean;
  /** 显式模式；优先于 withText */
  mode?: FolderCardMode;
  textPlaceholder?: string;
  /** 推荐短文案 chips（点击写入 text）；仅 compose */
  textRecommendations?: string[];
  disabled?: boolean;
  className?: string;
  includeSystem?: boolean;
  autoFocus?: boolean;
};

const CARD_LABEL: Record<FolderCardTag, string> = {
  style: '视觉风格',
  writing: '语感文风',
  character: '角色',
  knowledge: '知识',
};

const PICK_CHIP_LIMIT = 24;

function statusMark(f: FolderItem): string {
  if (f.card_status === 'ready') return '就绪';
  if (f.card_status === 'parsing') return '解析中';
  if (f.card_status === 'failed') return '失败';
  return '未就绪';
}

function resolveMode(mode: FolderCardMode | undefined, withText: boolean): FolderCardMode {
  if (mode === 'pick' || mode === 'compose') return mode;
  return withText ? 'compose' : 'pick';
}

export function FolderCardAtField({
  cardTag,
  value,
  onChange,
  textValue = '',
  onTextChange,
  withText = false,
  mode: modeProp,
  textPlaceholder,
  textRecommendations = [],
  disabled,
  className,
  includeSystem = true,
  autoFocus,
}: FolderCardAtFieldProps) {
  const resolvedMode = resolveMode(modeProp, withText);
  const isPick = resolvedMode === 'pick';
  const { requestViewResult } = useKnowledgeBaseParse();
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [options, setOptions] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [pickQuery, setPickQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const mine = await getKnowledgeFolders({ force: true });
        const filtered = mine.filter((f) => f.card_tag === cardTag);
        let merged = filtered;
        if (includeSystem) {
          const sys = await getSystemKnowledgeFolders(cardTag);
          const seen = new Set(filtered.map((f) => f.id));
          merged = [...filtered, ...sys.filter((s) => !seen.has(s.id))];
        }
        merged.sort((a, b) => {
          const ra = a.card_status === 'ready' ? 0 : 1;
          const rb = b.card_status === 'ready' ? 0 : 1;
          if (ra !== rb) return ra - rb;
          if (Boolean(a.is_system) !== Boolean(b.is_system)) return a.is_system ? -1 : 1;
          return (a.name || '').localeCompare(b.name || '', 'zh');
        });
        if (!cancelled) setOptions(merged);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardTag, includeSystem]);

  const selected = useMemo(
    () => options.find((f) => f.id === value) ?? null,
    [options, value]
  );

  const kindLabel = CARD_LABEL[cardTag];

  const pickFiltered = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const pool = options.filter((f) => f.card_status !== 'failed');
    if (!q) {
      // 默认只展示就绪卡；搜索时可看到解析中
      return pool.filter((f) => f.card_status === 'ready').slice(0, PICK_CHIP_LIMIT);
    }
    return pool
      .filter((f) => (f.name || '').toLowerCase().includes(q))
      .slice(0, PICK_CHIP_LIMIT);
  }, [options, pickQuery]);

  const recommended = useMemo(
    () => options.filter((f) => f.card_status === 'ready').slice(0, 6),
    [options]
  );

  const mentionHits = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    const pool = options.filter((f) => f.card_status !== 'failed');
    if (!q) return pool.slice(0, 12);
    return pool
      .filter((f) => (f.name || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [options, mentionQuery]);

  const readyCount = useMemo(
    () => options.filter((f) => f.card_status === 'ready').length,
    [options]
  );

  const pickCard = (f: FolderItem) => {
    if (f.card_status !== 'ready') return;
    onChange?.(f.id, f);
    setMentionOpen(false);
    setMentionQuery('');
    if (!isPick && textValue.includes('@')) {
      const cleaned = textValue.replace(/@([^\s@]*)$/, '').trimEnd();
      onTextChange?.(cleaned);
    }
  };

  const clearCard = () => onChange?.(null, null);

  const onComposeInputChange = (raw: string) => {
    onTextChange?.(raw);
    const at = raw.match(/(?:^|[\s\n])@([^\s@]*)$/);
    if (at) {
      setMentionOpen(true);
      setMentionQuery(at[1] ?? '');
    } else {
      setMentionOpen(false);
      setMentionQuery('');
    }
  };

  const openMention = () => {
    setMentionOpen(true);
    setMentionQuery('');
    const el = inputRef.current;
    if (!isPick && el && 'value' in el) {
      const next = `${textValue}${textValue && !/\s$/.test(textValue) ? ' ' : ''}@`;
      onTextChange?.(next);
      requestAnimationFrame(() => {
        el.focus();
        const len = next.length;
        if ('setSelectionRange' in el) el.setSelectionRange(len, len);
      });
    }
  };

  const composePlaceholder =
    textPlaceholder || `写几句语气偏好，或输入 @ 选择${kindLabel}卡`;

  // ── pick：只选卡 ──────────────────────────────────────────
  if (isPick) {
    return (
      <div className={`folder-card-at folder-card-at--pick${className ? ` ${className}` : ''}`}>
        {loading ? (
          <p className="folder-card-at__empty">正在加载{kindLabel}卡…</p>
        ) : options.length === 0 ? (
          <p className="folder-card-at__empty">
            暂无{kindLabel}卡。请先在{' '}
            <button
              type="button"
              className="folder-card-at__link"
              disabled={disabled}
              onClick={() => requestViewResult()}
            >
              知识库
            </button>{' '}
            创建并解析「{kindLabel}」素材。
          </p>
        ) : readyCount === 0 ? (
          <p className="folder-card-at__empty">
            有卡但尚未就绪。请到{' '}
            <button
              type="button"
              className="folder-card-at__link"
              disabled={disabled}
              onClick={() => requestViewResult()}
            >
              知识库
            </button>{' '}
            等待解析完成后再选。
          </p>
        ) : (
          <>
            {options.length > 6 ? (
              <div className="folder-card-at__search">
                <input
                  type="search"
                  className="folder-card-at__search-input"
                  disabled={disabled}
                  autoFocus={autoFocus}
                  placeholder={`搜索${kindLabel}卡…`}
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  aria-label={`搜索${kindLabel}卡`}
                />
              </div>
            ) : null}

            <div className="folder-card-at__recs" aria-label={`可选${kindLabel}`}>
              <span className="folder-card-at__recs-label">
                {pickQuery.trim() ? '搜索结果' : `推荐${kindLabel}`}
              </span>
              {pickFiltered.length === 0 ? (
                <p className="folder-card-at__empty">没有匹配的{kindLabel}卡</p>
              ) : (
                <div className="folder-card-at__recs-chips" role="listbox">
                  {pickFiltered.map((f) => {
                    const ready = f.card_status === 'ready';
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="option"
                        aria-selected={value === f.id}
                        className={
                          value === f.id
                            ? 'folder-card-at__chip folder-card-at__chip--active'
                            : ready
                              ? 'folder-card-at__chip'
                              : 'folder-card-at__chip folder-card-at__chip--muted'
                        }
                        disabled={disabled || !ready}
                        title={ready ? f.name : `${f.name}（${statusMark(f)}）`}
                        onClick={() => pickCard(f)}
                      >
                        {f.is_system ? '★ ' : ''}
                        {f.name}
                        {!ready ? ` · ${statusMark(f)}` : ''}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {selected ? (
          <div className="folder-card-at__selected">
            <Tag
              closable={!disabled}
              onClose={(e) => {
                e.preventDefault();
                clearCard();
              }}
              color="blue"
            >
              {selected.name}
              {selected.is_system ? ' · 系统' : ''}
            </Tag>
            <span className="folder-card-at__status">{statusMark(selected)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  // ── compose：文本 + @ 挂卡 ────────────────────────────────
  return (
    <div className={`folder-card-at folder-card-at--compose${className ? ` ${className}` : ''}`}>
      {textRecommendations.length > 0 ? (
        <div className="folder-card-at__recs" aria-label="推荐语气">
          <span className="folder-card-at__recs-label">推荐语气</span>
          <div className="folder-card-at__recs-chips">
            {textRecommendations.map((t) => (
              <button
                key={t}
                type="button"
                className="folder-card-at__chip"
                disabled={disabled}
                onClick={() => onTextChange?.(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {recommended.length > 0 ? (
        <div className="folder-card-at__recs" aria-label={`推荐${kindLabel}`}>
          <span className="folder-card-at__recs-label">推荐{kindLabel}</span>
          <div className="folder-card-at__recs-chips">
            {recommended.map((f) => (
              <button
                key={f.id}
                type="button"
                className={
                  value === f.id
                    ? 'folder-card-at__chip folder-card-at__chip--active'
                    : 'folder-card-at__chip'
                }
                disabled={disabled}
                onClick={() => pickCard(f)}
              >
                {f.is_system ? '★ ' : ''}
                {f.name}
              </button>
            ))}
          </div>
        </div>
      ) : loading ? (
        <p className="folder-card-at__empty">正在加载{kindLabel}卡…</p>
      ) : (
        <p className="folder-card-at__empty">
          暂无可用的{kindLabel}卡。可先在知识库打标「{kindLabel}」并解析文章。
        </p>
      )}

      {selected ? (
        <div className="folder-card-at__selected">
          <Tag
            closable={!disabled}
            onClose={(e) => {
              e.preventDefault();
              clearCard();
            }}
            color="blue"
          >
            @{selected.name}
            {selected.is_system ? ' · 系统' : ''}
          </Tag>
          <span className="folder-card-at__status">{statusMark(selected)}</span>
        </div>
      ) : null}

      <div className="folder-card-at__composer">
        <textarea
          ref={inputRef as RefObject<HTMLTextAreaElement>}
          className="folder-card-at__input"
          rows={2}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={composePlaceholder}
          value={textValue}
          onChange={(e) => onComposeInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMentionOpen(false);
          }}
        />
        <button
          type="button"
          className="folder-card-at__at-btn"
          disabled={disabled}
          title={`@ 引用${kindLabel}卡`}
          onClick={openMention}
        >
          @
        </button>
      </div>

      {mentionOpen ? (
        <ul className="folder-card-at__menu" role="listbox" aria-label={`${kindLabel}卡列表`}>
          {mentionHits.length === 0 ? (
            <li className="folder-card-at__menu-empty">没有匹配的{kindLabel}卡</li>
          ) : (
            mentionHits.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="folder-card-at__menu-item"
                  disabled={disabled || f.card_status !== 'ready'}
                  onClick={() => pickCard(f)}
                >
                  <span className="folder-card-at__menu-name">
                    {f.is_system ? '★ ' : ''}
                    {f.name}
                  </span>
                  <span className="folder-card-at__menu-meta">{statusMark(f)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default FolderCardAtField;
