import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Input, InputNumber, Select, Slider, Space, Switch, Typography } from 'antd';
import type { TaskFormConfig } from '../api/client';
import { EshopGarmentBatchField } from './schema-form/EshopGarmentBatchField';
import { GridStoryboardImagesField } from './schema-form/GridStoryboardImagesField';
import { ReferenceImagesField } from './schema-form/ReferenceImagesField';
import { deriveFormStockSearchDefault } from './schema-form/referenceImagesUtils';
import { KbRecallField } from './schema-fields/KbRecallField';
import { MxmKbInputField } from './schema-fields/MxmKbInputField';
import { TextFileOrPasteField } from './schema-fields/TextFileOrPasteField';
import { MinimaxVoiceField } from './schema-fields/MinimaxVoiceField';
import { DialogueCastField } from './schema-fields/DialogueCastField';
import { MediaUploadField, type MediaUploadMode } from './schema-fields/MediaUploadField';
import { ColorPickerField } from './schema-fields/ColorPickerField';
import { WebSearchField } from './schema-fields/WebSearchField';
import { DomainSearchField } from './schema-fields/DomainSearchField';
import { CheckboxGroupField, type CheckboxGroupSection } from './schema-fields/CheckboxGroupField';
import { FolderCardAtField } from './knowledge-base/FolderCardAtField';
import type { FolderCardTag } from '../api/client';
import { userFacingCopy } from '../lib/uiCopyHygiene';
import './SchemaForm.css';

type JsonSchema = TaskFormConfig['schema'];

export type SchemaFormValue = Record<string, unknown>;

export type SchemaFormProps = {
  schema: JsonSchema | null | undefined;
  uiSchema?: Record<string, unknown> | null | undefined;
  value: SchemaFormValue;
  onChange: (next: SchemaFormValue) => void;
  /** 若为 true:当 schema 变化时会补齐 default 值(不覆盖已有 value) */
  hydrateDefaults?: boolean;
  /**
   * `default`:跟随 `html.dark` 与 App 主题变量。
   * `panel`:用于抽屉/侧栏内嵌表单，跟随全局亮色/暗色主题。
   */
  variant?: 'default' | 'panel';
  /** 任务 ID：临时参考图上传时写入 metadata，供任务完成后清理 */
  taskId?: string;
  /**
   * Task V2 页顶栏已有「任务名称（列表展示）」→ metadata.label；
   * 为 true 时隐藏 formSchema 中的 `label` 字段，避免重复表单项。
   */
  hideMetadataLabel?: boolean;
};

type UiType =
  | 'text'
  | 'string'
  | 'number'
  | 'scale'
  | 'selection'
  | 'multiSelection'
  | 'checkboxGroup'
  | 'boolean'
  | 'referenceImages'
  | 'image'
  | 'mediaUpload'
  | 'eshopGarmentBatch'
  | 'gridStoryboardImages'
  | 'kbRecall'
  | 'mxmKbInput'
  | 'textFileOrPaste'
  | 'minimaxVoice'
  | 'voiceoverAudio'
  | 'webSearch'
  | 'domainSearch'
  | 'colorPicker'
  | 'folderCard';

/** `type: array` + `items: { type: string, enum }` → 多选下拉 */
function arrayItemsStringEnum(def: Record<string, unknown>): string[] {
  if (String(def.type) !== 'array') return [];
  const raw = def.items;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const it = raw as Record<string, unknown>;
  if (String(it.type) !== 'string') return [];
  const en = it.enum;
  if (!Array.isArray(en) || en.length === 0) return [];
  return en.map((x) => String(x));
}

function schemaUiType(name: string, def: Record<string, unknown>): UiType {
  const lower = name.toLowerCase();
  // Heuristic first: these fields are upload cards even if old DB rows still mark x-ui-type as text.
  if (lower === 'model_image' || lower === 'referenceimage' || lower === 'reference_image') {
    console.log('[SchemaForm] force referenceImages by field name', { name, xUiType: def['x-ui-type'], type: def.type });
    return 'referenceImages';
  }

  const xUi = def['x-ui-type'];
  if (xUi === 'text') return 'text';
  if (xUi === 'string') return 'string';
  if (xUi === 'number') return 'number';
  if (xUi === 'scale') return 'scale';
  if (xUi === 'selection') {
    if (def['x-multiple'] === true || String(def.type) === 'array') return 'multiSelection';
    return 'selection';
  }
  if (xUi === 'multiSelection') return 'multiSelection';
  if (xUi === 'checkboxGroup') return 'checkboxGroup';
  if (xUi === 'referenceImages') return 'referenceImages';
  if (xUi === 'eshopGarmentBatch') return 'eshopGarmentBatch';
  if (xUi === 'gridStoryboardImages') return 'gridStoryboardImages';
  if (xUi === 'kbRecall') return 'kbRecall';
  if (xUi === 'mxmKbInput') return 'mxmKbInput';
  if (xUi === 'textFileOrPaste') return 'textFileOrPaste';
  if (xUi === 'minimaxVoice') return 'minimaxVoice';
  if (xUi === 'voiceoverAudio') return 'voiceoverAudio';
  if (xUi === 'webSearch') return 'webSearch';
  if (xUi === 'domainSearch') return 'domainSearch';
  if (xUi === 'colorPicker') return 'colorPicker';
  if (xUi === 'folderCard') return 'folderCard';
  if (xUi === 'image') return 'image';
  if (
    xUi === 'imageUpload' ||
    xUi === 'fileUpload' ||
    xUi === 'audioUpload' ||
    xUi === 'documentUpload'
  ) {
    return 'mediaUpload';
  }
  /** JSON Schema `type: boolean` 的显式开关样式（与隐式 `type:boolean` 一致，均走 antd Switch） */
  if (xUi === 'switch') return 'boolean';

  const t = String(def.type ?? 'string');
  if (t === 'boolean') return 'boolean';
  if (t === 'number' || t === 'integer') return 'number';
  if (t === 'array' && arrayItemsStringEnum(def).length > 0) return 'multiSelection';
  if (t === 'object' || t === 'array') return 'text';
  if (Array.isArray(def.enum) && def.enum.length > 0) return 'selection';
  return 'string';
}

function resolveFormFieldPath(root: SchemaFormValue, path: string): string | undefined {
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' && cur.trim() ? cur.trim() : undefined;
}

function isUserVisible(def: Record<string, unknown>): boolean {
  return def['x-user-visible'] !== false;
}

/** x-show-when / x-hide-when 控制显隐 */
function isHiddenByWhen(def: Record<string, unknown>, formValue: SchemaFormValue): boolean {
  const showWhen = def['x-show-when'];
  if (showWhen && typeof showWhen === 'object' && !Array.isArray(showWhen)) {
    for (const [key, expected] of Object.entries(showWhen as Record<string, unknown>)) {
      if (formValue[key] !== expected) return true;
    }
  }
  const hideWhen = def['x-hide-when'];
  if (!hideWhen || typeof hideWhen !== 'object' || Array.isArray(hideWhen)) return false;
  for (const [key, expected] of Object.entries(hideWhen as Record<string, unknown>)) {
    if (formValue[key] === expected) return true;
  }
  return false;
}

function getTitle(name: string, def: Record<string, unknown>): string {
  const t = def.title != null ? String(def.title) : '';
  return userFacingCopy(t.trim() ? t : name, name);
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function buildEnumSelectOptions(
  def: Record<string, unknown>,
  enums: unknown[],
  value: SchemaFormValue
): Array<{ value: string; label: string }> {
  const filtered = filterEnumByApplyto(def, value, enums);
  const labels = Array.isArray(def['x-enum-labels']) ? (def['x-enum-labels'] as unknown[]) : [];
  return filtered
    .map((ev, idx) => {
      const valueStr = String(ev);
      const labelStr = labels[idx] != null && String(labels[idx]).trim() ? String(labels[idx]) : valueStr;
      return { value: valueStr, label: labelStr };
    })
    .filter((o) => o.value.trim() !== '');
}

function buildCheckboxGroupSections(
  def: Record<string, unknown>,
  options: Array<{ value: string; label: string }>
): CheckboxGroupSection[] | undefined {
  const rawGroups = def['x-option-groups'];
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return undefined;
  const byValue = new Map(options.map((o) => [o.value, o]));
  const sections: CheckboxGroupSection[] = [];
  for (const group of rawGroups) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) continue;
    const g = group as Record<string, unknown>;
    const label = String(g.label ?? '').trim();
    const items = Array.isArray(g.items) ? g.items.map(String) : [];
    const groupOptions = items
      .map((value) => byValue.get(value))
      .filter((o): o is { value: string; label: string } => Boolean(o));
    if (groupOptions.length > 0) sections.push({ label, options: groupOptions });
  }
  return sections.length > 0 ? sections : undefined;
}

function resolveTextareaRows(
  name: string,
  def: Record<string, unknown>,
  uiSchema: Record<string, unknown> | null | undefined
): { minRows: number; maxRows: number } {
  const uiField = (uiSchema as Record<string, Record<string, unknown>> | undefined)?.[name];
  const uiOptions = (uiField?.['ui:options'] as Record<string, unknown> | undefined) ?? {};
  const minRowsRaw =
    toNumberOrUndefined(def['x-min-rows']) ??
    (typeof uiOptions.rows === 'number' ? Math.floor(uiOptions.rows) : undefined);
  const maxRowsRaw = toNumberOrUndefined(def['x-max-rows']);
  const minRows = minRowsRaw ?? (name === 'prompt' ? 6 : 4);
  const maxRows = maxRowsRaw ?? Math.max(minRows + 4, 16);
  return { minRows, maxRows };
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
    const u1 = schemaUiType(n1, d1);
    if (u1 === 'number' && i + 1 < entries.length) {
      const [n2, d2] = entries[i + 1];
      if (schemaUiType(n2, d2) === 'number') {
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
  const { t } = useTranslation();
  const { schema, uiSchema, value, onChange, hydrateDefaults = true, variant = 'default', taskId: formTaskId, hideMetadataLabel = false } = props;

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
    if (hideMetadataLabel && name === 'label') return false;
    const def = defRaw && typeof defRaw === 'object' ? (defRaw as Record<string, unknown>) : {};
    return !!name && isUserVisible(def) && !isHiddenByWhen(def, value);
  }) as Array<[string, Record<string, unknown>]>;

  const layoutRows = groupEntriesForLayout(visibleEntries);

  const rootClass =
    variant === 'panel'
      ? 'schema-form schema-form--panel mxm-form-surface'
      : `schema-form schema-form--${variant}`;

  const renderField = (name: string, def: Record<string, unknown>) => {
    const uiType = schemaUiType(name, def);
    const title = getTitle(name, def);
    const desc = userFacingCopy(def.description != null ? String(def.description) : '');
    const titleText = userFacingCopy(
      def.title != null ? String(def.title) : name,
      name
    );
    const required = requiredSet.has(name);
    const v = value[name];

    const label = (
      <div className="schema-form__label">
        <span>{titleText || title}</span>
        {required ? <span className="schema-form__required">*</span> : null}
      </div>
    );

    const help =
      desc.trim() !== '' ? <div className="schema-form__help">{desc}</div> : null;

    const setField = (nextVal: unknown) => {
      const next = { ...valueRef.current, [name]: nextVal };
      valueRef.current = next;
      onChange(next);
    };

    if (uiType === 'referenceImages') {
      const arrRaw = Array.isArray(v) ? v : [];
      const rows = arrRaw
        .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
        .filter(Boolean) as Array<Record<string, unknown>>;

      return (
        <ReferenceImagesField
          key={name}
          fieldName={name}
          fieldDef={def}
          title={label}
          help={help}
          rows={rows}
          formTaskId={formTaskId}
          stockSearchDefault={deriveFormStockSearchDefault(valueRef.current)}
          onChange={(next) => setField(next)}
        />
      );
    }

    if (uiType === 'folderCard') {
      const tagRaw = String(def['x-card-tag'] ?? 'writing').trim();
      const cardTag = (
        ['style', 'writing', 'character', 'knowledge'].includes(tagRaw) ? tagRaw : 'writing'
      ) as FolderCardTag;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <FolderCardAtField
            cardTag={cardTag}
            mode="pick"
            value={typeof v === 'string' && v.trim() ? v : null}
            onChange={(id) => setField(id ?? '')}
          />
        </div>
      );
    }

    if (uiType === 'image' || uiType === 'mediaUpload') {
      // 旧 `x-ui-type: image` 兼容：视作 mediaUpload mode=image。
      // 新写法 `x-ui-type: imageUpload | fileUpload | audioUpload | documentUpload`。
      const xUi = (def['x-ui-type'] as string) || '';
      const mode: MediaUploadMode = (() => {
        if (xUi === 'fileUpload') return 'file';
        if (xUi === 'audioUpload') return 'audio';
        if (xUi === 'documentUpload') return 'document';
        return 'image';
      })();
      const enableLibrary =
        def['x-enable-library'] === true || (mode === 'image' || mode === 'audio');
      const enableKnowledgeFolder = (def['x-enable-knowledge-folder'] ?? def['x-enable-virtual-folder']) !== false;
      /** 音频上传：带回来源 taskId，自动剪辑可引入该任务已持久化的 TTS 字幕 */
      const bindVoiceoverSourceTask = mode === 'audio';
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <MediaUploadField
            value={typeof v === 'string' ? v : ''}
            mode={mode}
            onChange={(url) => setField(url)}
            enableLibrary={enableLibrary}
            enableKnowledgeFolder={enableKnowledgeFolder}
            formTaskId={formTaskId}
            onSourceTaskIdChange={
              bindVoiceoverSourceTask
                ? (taskId) => {
                    const next = { ...valueRef.current };
                    if (taskId) next.voiceover_source_task_id = taskId;
                    else delete next.voiceover_source_task_id;
                    valueRef.current = next;
                    onChange(next);
                  }
                : undefined
            }
            onDurationHint={
              bindVoiceoverSourceTask
                ? (sec) => {
                    if (sec != null && sec > 0) {
                      const next = { ...valueRef.current, audio_duration_seconds: sec };
                      valueRef.current = next;
                      onChange(next);
                    } else {
                      const next = { ...valueRef.current };
                      delete next.audio_duration_seconds;
                      valueRef.current = next;
                      onChange(next);
                    }
                  }
                : undefined
            }
          />
        </div>
      );
    }

    if (uiType === 'boolean') {
      return (
        <div key={name} className="schema-form__field schema-form__field--switch">
          <div className="schema-form__switch-row">
            <div className="schema-form__switch-copy">
              {label}
              {help}
            </div>
            <Switch checked={!!v} onChange={(checked) => setField(checked)} />
          </div>
        </div>
      );
    }

    if (uiType === 'colorPicker') {
      const preset =
        def.default != null && typeof def.default === 'string' ? String(def.default) : undefined;
      const disabled = isHiddenByWhen(def, value);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <ColorPickerField
            value={v}
            preset={preset}
            disabled={disabled}
            allowEmpty={!required}
            placeholder={preset ?? '#002FA7'}
            onChange={(hex) => setField(hex)}
          />
        </div>
      );
    }

    if (uiType === 'number') {
      const n = toNumberOrUndefined(v);
      const min = typeof def.minimum === 'number' ? def.minimum : undefined;
      const max = typeof def.maximum === 'number' ? def.maximum : undefined;
      const step =
        typeof def.multipleOf === 'number' && def.multipleOf > 0
          ? def.multipleOf
          : min != null && max != null && max - min <= 2
            ? 0.1
            : 1;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <InputNumber
            value={n}
            min={min}
            max={max}
            step={step}
            onChange={(nv) => setField(nv ?? undefined)}
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (uiType === 'scale') {
      const min = typeof def.minimum === 'number' ? def.minimum : 1;
      const max = typeof def.maximum === 'number' ? def.maximum : 10;
      const labels = Array.isArray(def['x-enum-labels'])
        ? (def['x-enum-labels'] as unknown[]).map(String)
        : [];
      const nRaw = toNumberOrUndefined(v);
      const n =
        nRaw != null && Number.isFinite(nRaw)
          ? Math.min(max, Math.max(min, Math.round(nRaw)))
          : typeof def.default === 'number'
            ? Math.min(max, Math.max(min, Math.round(def.default)))
            : Math.round((min + max) / 2);
      const labelIdx = n - min;
      const hint =
        labelIdx >= 0 && labelIdx < labels.length
          ? (() => {
              const raw = labels[labelIdx]!.trim();
              const sep = raw.indexOf('·');
              return sep > 0 ? raw.slice(sep + 1).trim() || raw : raw;
            })()
          : null;
      return (
        <div key={name} className="schema-form__field schema-form__field--scale">
          {label}
          {help}
          <div className="schema-form__scale-readout">
            <span className="schema-form__scale-num">{n}</span>
            {hint ? <span className="schema-form__scale-hint">{hint}</span> : null}
          </div>
          <Slider
            min={min}
            max={max}
            step={1}
            value={n}
            tooltip={{ open: false }}
            onChange={(nv) => setField(typeof nv === 'number' ? nv : min)}
          />
          <div className="schema-form__scale-ends">
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>
      );
    }

    if (uiType === 'selection') {
      const enums = Array.isArray(def.enum) ? (def.enum as unknown[]) : [];
      const options = buildEnumSelectOptions(def, enums, value);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Select
            value={v != null && String(v).trim() !== '' ? String(v) : undefined}
            allowClear
            placeholder={t('form.selectPlaceholder')}
            options={options}
            onChange={(sv) => setField(sv)}
            style={{ width: '100%' }}
          />
        </div>
      );
    }

    if (uiType === 'eshopGarmentBatch') {
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <EshopGarmentBatchField value={v} def={def} onChange={(next) => setField(next)} />
        </div>
      );
    }

    if (uiType === 'gridStoryboardImages') {
      const supportsLastFrame = def['x-supports-last-frame'] !== false;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <GridStoryboardImagesField
            value={v}
            supportsLastFrame={supportsLastFrame}
            onChange={(next) => setField(next)}
          />
        </div>
      );
    }

    if (uiType === 'kbRecall') {
      const maxItems =
        typeof def['x-max-items'] === 'number' && def['x-max-items'] > 0
          ? Math.floor(def['x-max-items'] as number)
          : 5;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <KbRecallField value={v} maxItems={maxItems} onChange={(next) => setField(next)} />
        </div>
      );
    }

    if (uiType === 'mxmKbInput') {
      const uiField = (uiSchema as Record<string, Record<string, unknown>> | undefined)?.[name];
      const uiOptions = (uiField?.['ui:options'] as Record<string, unknown> | undefined) ?? {};
      const rows =
        typeof uiOptions.rows === 'number' && uiOptions.rows > 0
          ? Math.floor(uiOptions.rows)
          : typeof def['x-rows'] === 'number' && (def['x-rows'] as number) > 0
            ? Math.floor(def['x-rows'] as number)
            : 5;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <MxmKbInputField value={v} rows={rows} onChange={(next) => setField(next)} />
        </div>
      );
    }

    if (uiType === 'textFileOrPaste') {
      const uiField = (uiSchema as Record<string, Record<string, unknown>> | undefined)?.[name];
      const uiOptions = (uiField?.['ui:options'] as Record<string, unknown> | undefined) ?? {};
      const rows =
        typeof uiOptions.rows === 'number' && uiOptions.rows > 0
          ? Math.floor(uiOptions.rows)
          : 8;
      const accept =
        typeof def['x-accept'] === 'string' && def['x-accept'].trim()
          ? String(def['x-accept']).trim()
          : typeof uiOptions.accept === 'string'
            ? String(uiOptions.accept)
            : undefined;
      const maxChars =
        typeof def['x-max-chars'] === 'number' && def['x-max-chars'] > 0
          ? Math.floor(def['x-max-chars'] as number)
          : undefined;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <TextFileOrPasteField
            value={v}
            rows={rows}
            accept={accept}
            maxChars={maxChars}
            onChange={(next) => setField(next)}
          />
        </div>
      );
    }

    if (uiType === 'minimaxVoice') {
      const voiceModel =
        typeof def['x-voice-model'] === 'string' && def['x-voice-model'].trim()
          ? String(def['x-voice-model']).trim()
          : 'speech-2.8-hd';
      const cloneFolderId =
        (typeof def['x-clone-folder-id'] === 'string' && def['x-clone-folder-id'].trim()
          ? String(def['x-clone-folder-id']).trim()
          : undefined) ||
        (typeof def['x-clone-folder-from'] === 'string'
          ? resolveFormFieldPath(value, String(def['x-clone-folder-from']))
          : undefined);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <MinimaxVoiceField
            value={v}
            voiceModel={voiceModel}
            cloneFolderId={cloneFolderId}
            onChange={(next) => setField(next)}
            onPersonaSuggest={(persona, meta) => {
              if (!Object.prototype.hasOwnProperty.call(properties, 'host_persona')) return;
              if (meta?.status === 'loading') return;
              const patched = { ...valueRef.current, host_persona: persona };
              valueRef.current = patched;
              onChange(patched);
            }}
          />
        </div>
      );
    }

    if (uiType === 'dialogueCast') {
      const speakerCount = Number(value.speaker_count ?? valueRef.current.speaker_count ?? 2) || 2;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <DialogueCastField
            value={Array.isArray(v) ? (v as any) : undefined}
            speakerCount={speakerCount}
            onChange={(next) => {
              setField(next);
              if (Object.prototype.hasOwnProperty.call(properties, 'speaker_count')) {
                const patched = { ...valueRef.current, cast: next, speaker_count: next.length };
                valueRef.current = patched;
                onChange(patched);
              }
            }}
          />
        </div>
      );
    }

    if (uiType === 'voiceoverAudio') {
      // 兼容旧 `x-ui-type: voiceoverAudio`：统一走 MediaUploadField audio。
      // 新写法 `x-ui-type: audioUpload`。
      const enableLibrary =
        def['x-enable-library'] === true || true;
      const enableKnowledgeFolder = (def['x-enable-knowledge-folder'] ?? def['x-enable-virtual-folder']) !== false;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <MediaUploadField
            mode="audio"
            value={typeof v === 'string' ? v : ''}
            onChange={(url) => setField(url)}
            enableLibrary={enableLibrary}
            enableKnowledgeFolder={enableKnowledgeFolder}
            formTaskId={formTaskId}
            onSourceTaskIdChange={(taskId) => {
              const next = { ...valueRef.current };
              if (taskId) next.voiceover_source_task_id = taskId;
              else delete next.voiceover_source_task_id;
              valueRef.current = next;
              onChange(next);
            }}
            onDurationHint={(sec) => {
              if (sec != null && sec > 0) {
                const next = { ...valueRef.current, audio_duration_seconds: sec };
                valueRef.current = next;
                onChange(next);
              } else {
                const next = { ...valueRef.current };
                delete next.audio_duration_seconds;
                valueRef.current = next;
                onChange(next);
              }
            }}
          />
        </div>
      );
    }

    if (uiType === 'domainSearch') {
      const maxItems =
        typeof def['x-max-items'] === 'number' && def['x-max-items'] > 0
          ? Math.floor(def['x-max-items'] as number)
          : 5;
      const autoHint =
        def['x-auto-from-prompt'] === true || def['x-auto-from'] === 'prompt'
          ? t('form.schema.autoFromWritingTopic')
          : undefined;
      const propsDef = def.properties as Record<string, Record<string, unknown>> | undefined;
      const depthDef = propsDef?.searchDepth;
      const depthEnum = Array.isArray(depthDef?.enum)
        ? (depthDef.enum as unknown[])
            .map(String)
            .filter((d): d is 'quick' | 'standard' | 'deep' =>
              d === 'quick' || d === 'standard' || d === 'deep'
            )
        : undefined;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <DomainSearchField
            value={v}
            enumSearchDepths={depthEnum}
            maxItems={maxItems}
            autoFromHint={autoHint}
            onChange={(next) => setField(next)}
          />
        </div>
      );
    }

    if (uiType === 'webSearch') {
      const maxItems =
        typeof def['x-max-items'] === 'number' && def['x-max-items'] > 0
          ? Math.floor(def['x-max-items'] as number)
          : 5;
      const autoHint =
        def['x-auto-from-prompt'] === true || def['x-auto-from'] === 'prompt'
          ? t('form.schema.autoFromWritingTopic')
          : undefined;
      const propsDef = def.properties as Record<string, Record<string, unknown>> | undefined;
      const depthDef = propsDef?.searchDepth;
      const depthEnum = Array.isArray(depthDef?.enum)
        ? (depthDef.enum as unknown[])
            .map(String)
            .filter((d): d is 'quick' | 'standard' | 'deep' =>
              d === 'quick' || d === 'standard' || d === 'deep'
            )
        : undefined;
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <WebSearchField
            value={v}
            enumSearchDepths={depthEnum}
            maxItems={maxItems}
            autoFromHint={autoHint}
            onChange={(next) => setField(next)}
          />
        </div>
      );
    }

    if (uiType === 'multiSelection') {
      const enums: unknown[] = arrayItemsStringEnum(def);
      const options = buildEnumSelectOptions(def, enums, value);
      const arrRaw = Array.isArray(v) ? v.map(String).filter((s) => s.trim() !== '') : [];
      const maxItems = toNumberOrUndefined(def.maxItems);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Select
            mode="multiple"
            value={arrRaw}
            allowClear={!required}
            placeholder={t('form.multiSelectPlaceholder')}
            options={options}
            style={{ width: '100%' }}
            onChange={(vals) => {
              const next = Array.isArray(vals) ? vals.map(String) : [];
              const uniq = def.uniqueItems === true ? Array.from(new Set(next)) : next;
              const capped =
                maxItems != null && maxItems > 0 && uniq.length > maxItems ? uniq.slice(0, maxItems) : uniq;
              setField(capped);
            }}
          />
        </div>
      );
    }

    if (uiType === 'checkboxGroup') {
      const enums: unknown[] = arrayItemsStringEnum(def);
      const options = buildEnumSelectOptions(def, enums, value);
      const sections = buildCheckboxGroupSections(def, options);
      const arrRaw = Array.isArray(v) ? v.map(String).filter((s) => s.trim() !== '') : [];
      const maxItems = toNumberOrUndefined(def.maxItems);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <CheckboxGroupField
            value={arrRaw}
            options={options}
            sections={sections}
            maxItems={maxItems}
            onChange={(next) => setField(next)}
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
      const { minRows, maxRows } = resolveTextareaRows(name, def, uiSchema);
      return (
        <div key={name} className="schema-form__field">
          {label}
          {help}
          <Input.TextArea
            value={v != null ? String(v) : ''}
            onChange={(e) => setField(e.target.value)}
            autoSize={{ minRows, maxRows }}
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
