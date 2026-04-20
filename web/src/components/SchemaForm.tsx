import { useEffect, useMemo, useRef } from 'react';
import { App, Button, Input, InputNumber, Select, Space, Switch, Typography } from 'antd';
import type { TaskFormConfig } from '../api/client';
import { uploadAssets } from '../api/client';
import './SchemaForm.css';

type JsonSchema = TaskFormConfig['schema'];

export type SchemaFormValue = Record<string, unknown>;

export type SchemaFormProps = {
  schema: JsonSchema | null | undefined;
  uiSchema?: Record<string, unknown> | null | undefined;
  value: SchemaFormValue;
  onChange: (next: SchemaFormValue) => void;
  /** 若为 true：当 schema 变化时会补齐 default 值（不覆盖已有 value） */
  hydrateDefaults?: boolean;
  /**
   * `default`：跟随 `html.dark` 与 App 主题变量。
   * `panel`：用于深色抽屉/浮层内嵌表单，强制浅色文字 + 深色输入（不依赖全局是否为 dark）。
   */
  variant?: 'default' | 'panel';
};

type UiType = 'text' | 'string' | 'number' | 'selection' | 'boolean' | 'referenceImages';

function schemaUiType(def: Record<string, unknown>): UiType {
  const xUi = def['x-ui-type'];
  if (xUi === 'text') return 'text';
  if (xUi === 'string') return 'string';
  if (xUi === 'number') return 'number';
  if (xUi === 'selection') return 'selection';
  if (xUi === 'referenceImages') return 'referenceImages';

  const t = String(def.type ?? 'string');
  if (t === 'boolean') return 'boolean';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'object' || t === 'array') return 'text';
  if (Array.isArray(def.enum) && def.enum.length > 0) return 'selection';
  return 'string';
}

function isUserVisible(def: Record<string, unknown>): boolean {
  return def['x-user-visible'] !== false;
}

function getTitle(name: string, def: Record<string, unknown>): string {
  const t = def.title != null ? String(def.title) : '';
  return t.trim() ? t : name;
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function filterEnumByApplyto(
  def: Record<string, unknown>,
  formValue: SchemaFormValue,
  enums: unknown[]
): unknown[] {
  const byApply = def['x-options-by-applyto'] as Record<string, string[]> | undefined;
  if (!byApply || typeof byApply !== 'object') return enums;
  const applyto = formValue['applyto'];
  const ak = typeof applyto === 'string' ? applyto.trim() : '';
  if (!ak || !Array.isArray(byApply[ak])) return enums;
  const allowed = new Set(byApply[ak]);
  return enums.filter((e) => allowed.has(String(e)));
}

/** 将连续的两个 number 字段合并为一行 */
function groupEntriesForLayout(
  entries: Array<[string, Record<string, unknown>]>
): Array<Array<[string, Record<string, unknown>]>> {
  const rows: Array<Array<[string, Record<string, unknown>]>> = [];
  let i = 0;
  while (i < entries.length) {
    const [n1, d1] = entries[i];
    const u1 = schemaUiType(d1);
    if (u1 === 'number' && i + 1 < entries.length) {
      const [n2, d2] = entries[i + 1];
      if (schemaUiType(d2) === 'number') {
        rows.push([
          [n1, d1],
          [n2, d2],
        ]);
        i += 2;
        continue;
      }
    }
    rows.push([[n1, d1]]);
    i += 1;
  }
  return rows;
}

export function SchemaForm(props: SchemaFormProps) {
  const { message } = App.useApp();
  const { schema, value, onChange, hydrateDefaults = true, variant = 'default' } = props;

  const properties = (schema?.properties ?? {}) as Record<string, unknown>;
  const requiredSet = useMemo(() => new Set((schema?.required ?? []).map(String)), [schema?.required]);

  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!schema?.properties) return;
    const ot = schema.properties.outline_type;
    if (!ot || typeof ot !== 'object') return;
    const byApply = (ot as Record<string, unknown>)['x-options-by-applyto'] as
      | Record<string, string[]>
      | undefined;
    if (!byApply) return;
    const v = valueRef.current;
    const ak = typeof v['applyto'] === 'string' ? v['applyto'].trim() : '';
    const allowed = ak && Array.isArray(byApply[ak]) ? new Set(byApply[ak]) : null;
    if (!allowed) return;
    const cur = v['outline_type'];
    if (cur != null && String(cur) !== '' && !allowed.has(String(cur))) {
      onChange({ ...v, outline_type: undefined });
    }
  }, [value.applyto, schema, onChange]);

  useEffect(() => {
    if (!hydrateDefaults) return;
    if (!schema || !properties || typeof properties !== 'object') return;
    let changed = false;
    const next: SchemaFormValue = { ...value };
    for (const [k, defRaw] of Object.entries(properties)) {
      const def = defRaw && typeof defRaw === 'object' ? (defRaw as Record<string, unknown>) : {};
      if (!isUserVisible(def)) continue;
      if (next[k] !== undefined) continue;
      if (def.default !== undefined) {
        next[k] = def.default;
        changed = true;
      }
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  if (!schema) return null;

  const visibleEntries = Object.entries(properties).filter(([name, defRaw]) => {
    const def = defRaw && typeof defRaw === 'object' ? (defRaw as Record<string, unknown>) : {};
    return !!name && isUserVisible(def);
  }) as Array<[string, Record<string, unknown>]>;

  const layoutRows = groupEntriesForLayout(visibleEntries);

  const rootClass = `schema-form schema-form--${variant}`;

  const renderField = (name: string, def: Record<string, unknown>) => {
    const uiType = schemaUiType(def);
    const title = getTitle(name, def);
    const desc = def.description != null ? String(def.description) : '';
    const required = requiredSet.has(name);
    const v = value[name];

    const label = (
      <div className="schema-form__label">
        <span>{title}</span>
        {required ? <span className="schema-form__required">*</span> : null}
      </div>
    );

    const help =
      desc.trim() !== '' ? <div className="schema-form__help">{desc}</div> : null;

    const setField = (nextVal: unknown) => onChange({ ...value, [name]: nextVal });

    if (uiType === 'referenceImages') {
      const arrRaw = Array.isArray(v) ? v : [];
      const rows = arrRaw
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
        .filter(Boolean) as Array<Record<string, unknown>>;

      const allowedTypes = ['main-subject', 'background', 'outfits', 'color-reference', 'style-reference'] as const;
      const typeOptions = allowedTypes.map((t) => ({ value: t, label: t }));

      const updateRow = (idx: number, patch: Partial<{ content: string; type: string; purpose: string }>) => {
        const next = rows.map((r, i) => {
          if (i !== idx) return r;
          const cur = r as Record<string, unknown>;
          const updated: Record<string, unknown> = { ...cur, ...patch };
          // 兼容：强制字段存在
          if (typeof updated.type !== 'string' || !updated.type) updated.type = 'main-subject';
          if (typeof updated.content !== 'string') updated.content = '';
          if (updated.purpose != null && typeof updated.purpose !== 'string') updated.purpose = String(updated.purpose);
          return updated;
        });
        setField(next);
      };

      const removeRow = (idx: number) => {
        const next = rows.filter((_, i) => i !== idx);
        setField(next);
      };

      const addRow = () => {
        const next = [...rows, { content: '', type: 'main-subject', purpose: '' }];
        setField(next);
      };

      const fileToDataUri = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('读取文件失败'));
          reader.onload = () => {
            const res = reader.result;
            if (typeof res === 'string' && res.startsWith('data:')) resolve(res);
            else reject(new Error('无法转换为 Base64 data URI'));
          };
          reader.readAsDataURL(file);
        });
      };

      const uploadIntoRow = async (idx: number, file: File) => {
        try {
          const res = await uploadAssets(file);
          if (res.error) throw new Error(res.error);
          const body = res.data as unknown as { data?: { url?: string } } | { url?: string } | undefined;
          const url = (body as any)?.data?.url ?? (body as any)?.url;
          if (!url || typeof url !== 'string') throw new Error('上传成功但未返回 url');
          updateRow(idx, { content: url });
          message.success('参考图已上传（URL 模式）');
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      };

      const toBase64IntoRow = async (idx: number, file: File) => {
        try {
          const dataUri = await fileToDataUri(file);
          updateRow(idx, { content: dataUri });
          message.success('参考图已写入 Base64（直传模式）');
        } catch (e) {
          message.error(e instanceof Error ? e.message : String(e));
        }
      };

      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              提示：若下游模型为云接口且无法访问内网存储，请优先用“Base64 直传”；URL 模式用于未来存储上云/公网可达场景。
            </Typography.Text>
            {rows.length === 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                暂无参考图，点击下方添加
              </Typography.Text>
            ) : null}
            {rows.map((r, idx) => {
              const content = typeof r.content === 'string' ? r.content : '';
              const t = typeof r.type === 'string' ? r.type : 'main-subject';
              const purpose = typeof r.purpose === 'string' ? r.purpose : '';
              return (
                <div
                  key={`ref-${idx}`}
                  style={{
                    border: '1px solid rgba(148,163,184,0.25)',
                    borderRadius: 10,
                    padding: 10,
                    background: 'rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 8 }}>
                      <Input
                        value={content}
                        placeholder="粘贴图片 URL（或先上传自动填充）"
                        onChange={(e) => updateRow(idx, { content: e.target.value })}
                      />
                      <Select
                        value={allowedTypes.includes(t as any) ? t : 'main-subject'}
                        options={typeOptions}
                        onChange={(sv) => updateRow(idx, { type: sv })}
                      />
                    </div>
                    <Input
                      value={purpose}
                      placeholder="用途说明（可选）：例如 主图模特/衣服面料细节/背景光线氛围"
                      onChange={(e) => updateRow(idx, { purpose: e.target.value })}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            void uploadIntoRow(idx, f);
                            // allow re-upload same file
                            e.currentTarget.value = '';
                          }}
                        />
                        <Button size="small">上传为 URL</Button>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            void toBase64IntoRow(idx, f);
                            e.currentTarget.value = '';
                          }}
                        />
                        <Button size="small">上传为 Base64</Button>
                      </label>
                      <Button size="small" danger onClick={() => removeRow(idx)}>
                        删除该图
                      </Button>
                    </div>
                  </Space>
                </div>
              );
            })}
            <Button onClick={addRow}>+ 添加参考图</Button>
          </Space>
        </div>
      );
    }

    if (uiType === 'boolean') {
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Switch checked={!!v} onChange={(checked) => setField(checked)} />
        </div>
      );
    }

    if (uiType === 'number') {
      const n = toNumberOrUndefined(v);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <InputNumber value={n} onChange={(nv) => setField(nv ?? undefined)} style={{ width: '100%' }} />
        </div>
      );
    }

    if (uiType === 'selection') {
      let enums = Array.isArray(def.enum) ? (def.enum as unknown[]) : [];
      enums = filterEnumByApplyto(def, value, enums);
      const labels = Array.isArray(def['x-enum-labels']) ? (def['x-enum-labels'] as unknown[]) : [];
      const options = enums
        .map((ev, idx) => {
          const valueStr = String(ev);
          const labelStr = labels[idx] != null && String(labels[idx]).trim() ? String(labels[idx]) : valueStr;
          return { value: valueStr, label: labelStr };
        })
        .filter((o) => o.value.trim() !== '');
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Select
            value={v != null && String(v).trim() !== '' ? String(v) : undefined}
            allowClear
            placeholder="请选择"
            options={options}
            onChange={(sv) => setField(sv)}
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (uiType === 'text') {
      const t = String(def.type ?? 'string');
      const isJsonLike = t === 'object' || t === 'array';
      const display =
        isJsonLike && v != null && typeof v !== 'string'
          ? (() => {
              try {
                return JSON.stringify(v, null, 2);
              } catch {
                return String(v);
              }
            })()
          : v != null
            ? String(v)
            : '';
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Input.TextArea
            value={display}
            onChange={(e) => {
              const nextText = e.target.value;
              if (!isJsonLike) {
                setField(nextText);
                return;
              }
              try {
                const parsed = JSON.parse(nextText);
                setField(parsed);
              } catch {
                setField(nextText);
              }
            }}
            rows={4}
          />
        </div>
      );
    }

    const useTextArea =
      def['x-ui-type'] === 'textarea' ||
      name === 'prompt' ||
      String(def.format ?? '') === 'textarea';
    if (useTextArea) {
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Input.TextArea
            value={v != null ? String(v) : ''}
            onChange={(e) => setField(e.target.value)}
            autoSize={{ minRows: name === 'prompt' ? 6 : 4, maxRows: 16 }}
          />
        </div>
      );
    }
    return (
      <div key={name} className="schema-form__field">
        {label}
        {help}
        <Input value={v != null ? String(v) : ''} onChange={(e) => setField(e.target.value)} />
      </div>
    );
  };

  return (
    <div className={rootClass}>
      {layoutRows.map((row, rowIdx) => {
        if (row.length === 2) {
          return (
            <div key={`row-${rowIdx}`} className="schema-form__row-2">
              {renderField(row[0][0], row[0][1])}
              {renderField(row[1][0], row[1][1])}
            </div>
          );
        }
        return <div key={row[0][0]}>{renderField(row[0][0], row[0][1])}</div>;
      })}
    </div>
  );
}
