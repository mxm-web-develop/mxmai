/**
 * writing mxm-warp 合同审核：仅展示/编辑 contract.business。
 * 字段随业务变化；对探索文集 variants 等常见键提供人话标签（不暴露管线内部键语义以外的机器字段）。
 */
import type { ReactNode } from 'react';
import { Button, Input, InputNumber, Switch, Typography } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import './contract-business-review.css';

export type ContractBusiness = Record<string, unknown>;

export type WarpContractLike = {
  business?: ContractBusiness;
  [k: string]: unknown;
};

export function isWarpContractWithBusiness(json: unknown): json is WarpContractLike {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
  const b = (json as WarpContractLike).business;
  return b != null && typeof b === 'object' && !Array.isArray(b);
}

export function mergeBusinessIntoContract(
  contract: WarpContractLike,
  business: ContractBusiness
): WarpContractLike {
  return { ...contract, business: { ...business } };
}

type Props = {
  business: ContractBusiness;
  disabled?: boolean;
  onChange: (next: ContractBusiness) => void;
};

/** 用户态标签：只覆盖创作语言字段，不映射 taskKey / 路由等内部键 */
const FRIENDLY_LABELS: Record<string, string> = {
  variants: '各路写作方案',
  common_ground: '共同基线',
  id: '编号',
  name: '路线名',
  angle: '切入角度',
  structure_plan: '结构方案',
  style_profile: '风格档案',
  search_focus: '检索切角',
  differentiation: '与其他路的区别',
  skeleton: '结构骨架',
  sections: '章节安排',
  rationale: '为何这样结构',
  heading: '章节标题',
  intent: '本章职责',
  persona: '写手人设',
  voice: '语域语气',
  humor_level: '幽默程度',
  tone_directives: '文笔指令',
  reference_hint: '气质参照',
  facts: '共享事实',
  rules: '公共禁则',
};

function fieldLabel(key: string): string {
  return FRIENDLY_LABELS[key] ?? key;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contract-biz-field">
      <div className="contract-biz-field__label">
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** 根据已有项推断「添加」时的空模板 */
function emptyItemLike(sample: unknown): unknown {
  if (typeof sample === 'string') return '';
  if (typeof sample === 'number') return 0;
  if (typeof sample === 'boolean') return false;
  if (Array.isArray(sample)) return [];
  if (isPlainObject(sample)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sample)) {
      out[k] = emptyItemLike(v);
    }
    return out;
  }
  return '';
}

function formatScalar(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** variants 卡片标题：优先路线名 / 角度 */
function variantCardTitle(item: Record<string, unknown>, index: number): string {
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const angle = typeof item.angle === 'string' ? item.angle.trim() : '';
  if (name && angle) return `${name} · ${angle}`;
  if (name) return name;
  if (angle) return angle;
  return `第 ${index + 1} 路`;
}

type ValueEditorProps = {
  value: unknown;
  disabled?: boolean;
  depth?: number;
  pathKey?: string;
  onChange: (next: unknown) => void;
};

function ValueEditor({ value, disabled, depth = 0, pathKey, onChange }: ValueEditorProps) {
  if (value === null || value === undefined) {
    return (
      <Input
        value=""
        disabled={disabled}
        placeholder="空"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (typeof value === 'boolean') {
    return (
      <Switch checked={value} disabled={disabled} onChange={(checked) => onChange(checked)} />
    );
  }

  if (typeof value === 'number') {
    return (
      <InputNumber
        style={{ width: '100%' }}
        value={value}
        disabled={disabled}
        min={pathKey === 'humor_level' ? 0 : undefined}
        max={pathKey === 'humor_level' ? 10 : undefined}
        onChange={(n) => onChange(typeof n === 'number' ? n : 0)}
      />
    );
  }

  if (typeof value === 'string') {
    const multiline = value.length > 80 || value.includes('\n');
    if (multiline) {
      return (
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 8 }}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }
    return (
      <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    );
  }

  if (Array.isArray(value)) {
    return (
      <ArrayEditor
        value={value}
        disabled={disabled}
        depth={depth}
        pathKey={pathKey}
        onChange={onChange}
      />
    );
  }

  if (isPlainObject(value)) {
    return (
      <ObjectEditor value={value} disabled={disabled} depth={depth} onChange={onChange} />
    );
  }

  return (
    <Input.TextArea
      autoSize={{ minRows: 2, maxRows: 6 }}
      value={formatScalar(value)}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value;
        try {
          onChange(JSON.parse(raw) as unknown);
        } catch {
          onChange(raw);
        }
      }}
    />
  );
}

/** 对象字段优先展示顺序（探索文集） */
const KEY_ORDER = [
  'variants',
  'common_ground',
  'name',
  'angle',
  'structure_plan',
  'style_profile',
  'search_focus',
  'differentiation',
  'skeleton',
  'sections',
  'rationale',
  'persona',
  'voice',
  'humor_level',
  'tone_directives',
  'reference_hint',
  'heading',
  'intent',
  'facts',
  'rules',
  'id',
];

function orderedKeys(obj: Record<string, unknown>): string[] {
  const keys = Object.keys(obj);
  return keys.sort((a, b) => {
    const ia = KEY_ORDER.indexOf(a);
    const ib = KEY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function ObjectEditor({
  value,
  disabled,
  depth = 0,
  onChange,
}: {
  value: Record<string, unknown>;
  disabled?: boolean;
  depth?: number;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const keys = orderedKeys(value);
  if (keys.length === 0) {
    return <Typography.Text type="secondary">（空）</Typography.Text>;
  }

  return (
    <div className={depth > 0 ? 'contract-biz-object contract-biz-object--nested' : 'contract-biz-object'}>
      {keys.map((key) => (
        <Field key={key} label={fieldLabel(key)}>
          <ValueEditor
            value={value[key]}
            disabled={disabled}
            depth={depth + 1}
            pathKey={key}
            onChange={(next) => onChange({ ...value, [key]: next })}
          />
        </Field>
      ))}
    </div>
  );
}

function ArrayEditor({
  value,
  disabled,
  depth = 0,
  pathKey,
  onChange,
}: {
  value: unknown[];
  disabled?: boolean;
  depth?: number;
  pathKey?: string;
  onChange: (next: unknown[]) => void;
}) {
  const sample = value.find((x) => x != null);
  const isVariants = pathKey === 'variants';

  const addItem = () => {
    const template = sample != null ? emptyItemLike(sample) : '';
    onChange([...value, template]);
  };

  if (value.length === 0) {
    return (
      <div className="contract-biz-list">
        <Typography.Text type="secondary">暂无条目</Typography.Text>
        <Button
          type="dashed"
          size="small"
          disabled={disabled}
          icon={<Plus size={14} />}
          onClick={addItem}
        >
          添加一条
        </Button>
      </div>
    );
  }

  return (
    <div className="contract-biz-list">
      {value.map((item, i) => {
        const asObject = isPlainObject(item);
        if (asObject) {
          const title = isVariants ? variantCardTitle(item, i) : `#${i + 1}`;
          return (
            <div
              key={typeof item.id === 'string' ? item.id : i}
              className={`contract-biz-card${isVariants ? ' contract-biz-card--variant' : ''}`}
            >
              <div className="contract-biz-card__head">
                <span className="contract-biz-card__badge">
                  {isVariants ? (
                    <>
                      <em>{String(i + 1).padStart(2, '0')}</em>
                      <strong>{title}</strong>
                    </>
                  ) : (
                    title
                  )}
                </span>
                <button
                  type="button"
                  className="contract-biz-icon-btn"
                  disabled={disabled}
                  aria-label="删除"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ObjectEditor
                value={item}
                disabled={disabled}
                depth={depth + 1}
                onChange={(next) => {
                  const nextArr = [...value];
                  nextArr[i] = next;
                  onChange(nextArr);
                }}
              />
            </div>
          );
        }

        return (
          <div key={i} className="contract-biz-list__row">
            <div className="contract-biz-list__row-grow">
              <ValueEditor
                value={item}
                disabled={disabled}
                depth={depth + 1}
                pathKey={pathKey}
                onChange={(next) => {
                  const nextArr = [...value];
                  nextArr[i] = next;
                  onChange(nextArr);
                }}
              />
            </div>
            <button
              type="button"
              className="contract-biz-icon-btn"
              disabled={disabled}
              aria-label="删除"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <Button
        type="dashed"
        size="small"
        disabled={disabled}
        icon={<Plus size={14} />}
        onClick={addItem}
      >
        添加一条
      </Button>
    </div>
  );
}

export function ContractBusinessReviewEditor({ business, disabled, onChange }: Props) {
  const hasVariants = Array.isArray(business.variants) && business.variants.length > 0;

  return (
    <div className="contract-biz-review">
      <p className="contract-biz-review__intro">
        {hasVariants
          ? '请逐路确认切入角度、结构方案与写手风格。改完后点通过，才会开始分路检索与成稿。'
          : '仅编辑业务字段。不同业务字段不同，以下按当前合同内容展示；基础信息与来源已锁定。'}
      </p>
      {Object.keys(business).length === 0 ? (
        <Typography.Text type="secondary">暂无可编辑内容</Typography.Text>
      ) : (
        <section className="contract-biz-section">
          <ObjectEditor
            value={business}
            disabled={disabled}
            depth={0}
            onChange={(next) => onChange(next)}
          />
        </section>
      )}
    </div>
  );
}
