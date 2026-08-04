/**
 * VS Code 风格可折叠 JSON 查看器（Admin 监控室 raw I/O）
 */
import { useCallback, useMemo, useState } from 'react';
import './CollapsibleJsonView.css';

type Props = {
  value: unknown;
  /** 超过该深度的节点默认收起；默认 2 */
  defaultCollapseDepth?: number;
  /** 数组长度超过该值时子项默认收起；默认 8 */
  collapseArrayOver?: number;
  className?: string;
  soft?: boolean;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function previewCollapsed(v: unknown): string {
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (isPlainObject(v)) {
    const n = Object.keys(v).length;
    return n === 0 ? '{}' : `{ ${n} keys }`;
  }
  if (typeof v === 'string') {
    const s = v.length > 48 ? `${v.slice(0, 48)}…` : v;
    return JSON.stringify(s);
  }
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
    return String(v);
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function JsonPrimitive({ value }: { value: unknown }) {
  if (value === null) return <span className="cjv-null">null</span>;
  if (typeof value === 'boolean') return <span className="cjv-bool">{String(value)}</span>;
  if (typeof value === 'number') return <span className="cjv-num">{String(value)}</span>;
  if (typeof value === 'string') {
    return <span className="cjv-str">{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'undefined') return <span className="cjv-null">undefined</span>;
  try {
    return <span className="cjv-str">{JSON.stringify(value)}</span>;
  } catch {
    return <span className="cjv-str">{String(value)}</span>;
  }
}

function JsonNode({
  name,
  value,
  path,
  depth,
  defaultCollapseDepth,
  collapseArrayOver,
  openMap,
  setOpen,
}: {
  name?: string;
  value: unknown;
  path: string;
  depth: number;
  defaultCollapseDepth: number;
  collapseArrayOver: number;
  openMap: Record<string, boolean>;
  setOpen: (path: string, open: boolean) => void;
}) {
  const isArr = Array.isArray(value);
  const isObj = isPlainObject(value);
  const isExpandable = isArr || isObj;

  const childCount = isArr
    ? value.length
    : isObj
      ? Object.keys(value).length
      : 0;

  const defaultOpen =
    depth < defaultCollapseDepth &&
    !(isArr && childCount > collapseArrayOver);

  const open = openMap[path] ?? defaultOpen;

  const toggle = useCallback(() => {
    setOpen(path, !open);
  }, [open, path, setOpen]);

  if (!isExpandable) {
    return (
      <div className="cjv-line" style={{ paddingLeft: depth * 14 }}>
        {name != null ? (
          <>
            <span className="cjv-key">{JSON.stringify(name)}</span>
            <span className="cjv-colon">: </span>
          </>
        ) : null}
        <JsonPrimitive value={value} />
      </div>
    );
  }

  const entries: Array<[string, unknown]> = isArr
    ? value.map((item, i) => [String(i), item])
    : Object.entries(value);

  const bracketOpen = isArr ? '[' : '{';
  const bracketClose = isArr ? ']' : '}';

  return (
    <div className="cjv-node">
      <div
        className="cjv-line cjv-line--toggle"
        style={{ paddingLeft: depth * 14 }}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <span className={`cjv-caret${open ? ' is-open' : ''}`} aria-hidden>
          ▶
        </span>
        {name != null ? (
          <>
            <span className="cjv-key">{isArr && /^\d+$/.test(name) ? name : JSON.stringify(name)}</span>
            <span className="cjv-colon">: </span>
          </>
        ) : null}
        <span className="cjv-bracket">{bracketOpen}</span>
        {!open ? (
          <>
            <span className="cjv-preview"> {previewCollapsed(value)} </span>
            <span className="cjv-bracket">{bracketClose}</span>
          </>
        ) : childCount === 0 ? (
          <span className="cjv-bracket">{bracketClose}</span>
        ) : null}
      </div>
      {open && childCount > 0 ? (
        <>
          {entries.map(([k, v]) => (
            <JsonNode
              key={`${path}.${k}`}
              name={k}
              value={v}
              path={`${path}.${k}`}
              depth={depth + 1}
              defaultCollapseDepth={defaultCollapseDepth}
              collapseArrayOver={collapseArrayOver}
              openMap={openMap}
              setOpen={setOpen}
            />
          ))}
          <div className="cjv-line" style={{ paddingLeft: depth * 14 }}>
            <span className="cjv-bracket">{bracketClose}</span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function CollapsibleJsonView({
  value,
  defaultCollapseDepth = 2,
  collapseArrayOver = 8,
  className,
  soft = false,
}: Props) {
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const setOpen = useCallback((path: string, open: boolean) => {
    setOpenMap((prev) => ({ ...prev, [path]: open }));
  }, []);

  const expandAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) {
        next[path] = true;
        v.forEach((item, i) => walk(item, `${path}.${i}`));
      } else if (isPlainObject(v)) {
        next[path] = true;
        for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
      }
    };
    walk(value, '$');
    setOpenMap(next);
  }, [value]);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = { $: false };
    const walk = (v: unknown, path: string) => {
      if (Array.isArray(v)) {
        next[path] = false;
        v.forEach((item, i) => walk(item, `${path}.${i}`));
      } else if (isPlainObject(v)) {
        next[path] = false;
        for (const [k, child] of Object.entries(v)) walk(child, `${path}.${k}`);
      }
    };
    walk(value, '$');
    setOpenMap(next);
  }, [value]);

  const rootLabel = useMemo(() => {
    if (Array.isArray(value)) return `Array(${value.length})`;
    if (isPlainObject(value)) return `{ ${Object.keys(value).length} keys }`;
    return typeof value;
  }, [value]);

  if (value === undefined) {
    return (
      <pre className={`cjv-root${soft ? ' cjv-root--soft' : ''} ${className ?? ''}`.trim()}>
        （无）
      </pre>
    );
  }

  if (!isPlainObject(value) && !Array.isArray(value)) {
    return (
      <pre className={`cjv-root${soft ? ' cjv-root--soft' : ''} ${className ?? ''}`.trim()}>
        <JsonPrimitive value={value} />
      </pre>
    );
  }

  return (
    <div className={`cjv-root${soft ? ' cjv-root--soft' : ''} ${className ?? ''}`.trim()}>
      <div className="cjv-toolbar">
        <span className="cjv-toolbar__meta">{rootLabel}</span>
        <button type="button" className="cjv-toolbar__btn" onClick={expandAll}>
          全部展开
        </button>
        <button type="button" className="cjv-toolbar__btn" onClick={collapseAll}>
          全部收起
        </button>
      </div>
      <div className="cjv-tree">
        <JsonNode
          value={value}
          path="$"
          depth={0}
          defaultCollapseDepth={defaultCollapseDepth}
          collapseArrayOver={collapseArrayOver}
          openMap={openMap}
          setOpen={setOpen}
        />
      </div>
    </div>
  );
}

/** 文本兜底：尝试 parse JSON，失败则原样 pre */
export function CollapsibleJsonOrText({
  value,
  text,
  soft,
}: {
  value?: unknown;
  text?: string;
  soft?: boolean;
}) {
  if (value !== undefined && value !== null) {
    return <CollapsibleJsonView value={value} soft={soft} />;
  }
  if (text == null || text === '') {
    return (
      <pre className={`cjv-root${soft ? ' cjv-root--soft' : ''}`}>（无）</pre>
    );
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return <CollapsibleJsonView value={parsed} soft={soft} />;
    }
  } catch {
    /* plain text */
  }
  return <pre className={`cjv-root${soft ? ' cjv-root--soft' : ''}`}>{text}</pre>;
}
