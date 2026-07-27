/**
 * 知识卡引用：推荐 chips + 输入框内 @ 联想选卡。
 * 禁止独立「莫名其妙提示词 + 空白输入框」式挂卡。
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Tag } from 'antd';
import {
  getKnowledgeFolders,
  getSystemKnowledgeFolders,
  type FolderCardTag,
  type FolderItem,
} from '../../api/client';
import './folder-card-at-field.css';

export type FolderCardAtFieldProps = {
  cardTag: FolderCardTag;
  value?: string | null;
  onChange?: (folderId: string | null, folder?: FolderItem | null) => void;
  /** 与文本同框时：当前文本（语气说明等） */
  textValue?: string;
  onTextChange?: (text: string) => void;
  /** true：文本 + @卡；false：仅选卡（仍用 @ / 推荐，不用裸 Select） */
  withText?: boolean;
  textPlaceholder?: string;
  /** 推荐短文案 chips（点击写入 text） */
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

function statusMark(f: FolderItem): string {
  if (f.card_status === 'ready') return '就绪';
  if (f.card_status === 'parsing') return '解析中';
  if (f.card_status === 'failed') return '失败';
  return '未就绪';
}

export function FolderCardAtField({
  cardTag,
  value,
  onChange,
  textValue = '',
  onTextChange,
  withText = false,
  textPlaceholder,
  textRecommendations = [],
  disabled,
  className,
  includeSystem = true,
  autoFocus,
}: FolderCardAtFieldProps) {
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const [options, setOptions] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

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
        // 就绪优先，系统卡靠前一点
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

  const kindLabel = CARD_LABEL[cardTag];

  const pickCard = (f: FolderItem) => {
    onChange?.(f.id, f);
    setMentionOpen(false);
    setMentionQuery('');
    if (withText && textValue.includes('@')) {
      // 去掉尚未完成的 @查询片段
      const cleaned = textValue.replace(/@([^\s@]*)$/, '').trimEnd();
      onTextChange?.(cleaned);
    }
  };

  const clearCard = () => onChange?.(null, null);

  const onInputChange = (raw: string) => {
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
    if (withText && el && 'value' in el) {
      const next = `${textValue}${textValue && !/\s$/.test(textValue) ? ' ' : ''}@`;
      onTextChange?.(next);
      requestAnimationFrame(() => {
        el.focus();
        const len = next.length;
        if ('setSelectionRange' in el) el.setSelectionRange(len, len);
      });
    }
  };

  const placeholder =
    textPlaceholder ||
    (withText
      ? `写几句语气偏好，或输入 @ 选择${kindLabel}卡`
      : `输入 @ 搜索并选择${kindLabel}卡`);

  return (
    <div className={`folder-card-at${className ? ` ${className}` : ''}`}>
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
        {withText ? (
          <textarea
            ref={inputRef as RefObject<HTMLTextAreaElement>}
            className="folder-card-at__input"
            rows={2}
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={textValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMentionOpen(false);
            }}
          />
        ) : (
          <input
            ref={inputRef as RefObject<HTMLInputElement>}
            className="folder-card-at__input folder-card-at__input--single"
            disabled={disabled}
            autoFocus={autoFocus}
            placeholder={placeholder}
            value={mentionOpen ? `@${mentionQuery}` : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes('@')) {
                setMentionOpen(true);
                setMentionQuery(v.replace(/^[^@]*@/, ''));
              } else if (v.trim()) {
                setMentionOpen(true);
                setMentionQuery(v.trim());
              } else {
                setMentionOpen(false);
                setMentionQuery('');
              }
            }}
            onFocus={() => {
              if (options.length) setMentionOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMentionOpen(false);
            }}
          />
        )}
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
                  disabled={disabled}
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
