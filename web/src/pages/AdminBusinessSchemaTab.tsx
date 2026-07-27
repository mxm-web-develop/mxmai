import { HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Empty, Input, InputNumber, Select, Switch, Tag } from 'antd';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ContractFieldZone, JsonSchema, SchemaFieldRow, TaskTemplateDraft } from './AdminBusiness.types';
import {
  fieldRowsToSchema,
  prettyJson,
  safeJsonParse,
  SYSTEM_SCHEMA_FIELD_SET,
} from './AdminBusiness.utils';
import { SCHEMA_FIELD_TYPE_OPTIONS } from '../shared/schemaFieldTypes';

export interface AdminBusinessSchemaTabProps {
  draft: TaskTemplateDraft | null;
  schemaMode: 'guided' | 'json';
  schemaRows: SchemaFieldRow[];
  schemaJson: string;
  promptVarSearch: string;
  unifiedTemplateMarkup: string;
  promptMarkupGetterRef: React.MutableRefObject<
    ((format: 'pure_string' | 'string' | 'markdown' | 'html') => string) | null
  >;
  missingSchemaVars: string[];
  onSchemaModeChange: (v: 'guided' | 'json') => void;
  onSchemaRowsChange: (v: SchemaFieldRow[] | ((prev: SchemaFieldRow[]) => SchemaFieldRow[])) => void;
  onSchemaJsonChange: (json: string) => void;
  onPromptVarSearchChange: (v: string) => void;
  onSyncToJson: () => void;
  onUnifiedTemplateMarkupChange: (v: string) => void;
  onAddMissingVarsToSchema: () => void;
}

const ZONE_IDS = {
  basic: 'zone:basic',
  business: 'zone:business',
} as const;

function emptyField(zone: ContractFieldZone): SchemaFieldRow {
  return {
    key: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    type: 'string',
    required: false,
    userVisible: zone === 'basic',
    zone,
    enumText: '',
    enumLabelsText: '',
    defaultText: '',
  };
}

function zoneOf(row: SchemaFieldRow): ContractFieldZone {
  return row.zone === 'basic' ? 'basic' : 'business';
}

function partitionByZone(rows: SchemaFieldRow[]): {
  basic: SchemaFieldRow[];
  business: SchemaFieldRow[];
} {
  const basic: SchemaFieldRow[] = [];
  const business: SchemaFieldRow[] = [];
  for (const row of rows) {
    if (zoneOf(row) === 'basic') basic.push(row);
    else business.push(row);
  }
  return { basic, business };
}

function mergeZones(basic: SchemaFieldRow[], business: SchemaFieldRow[]): SchemaFieldRow[] {
  return [...basic, ...business];
}

function applyZoneChange(row: SchemaFieldRow, zone: ContractFieldZone): SchemaFieldRow {
  return {
    ...row,
    zone,
    userVisible: zone === 'basic' ? (row.userVisible ?? true) : false,
  };
}

function FieldCardBody({
  r,
  idx,
  dragHandle,
  onUpdate,
  onRemove,
}: {
  r: SchemaFieldRow;
  idx: number;
  dragHandle?: ReactNode;
  onUpdate: (patch: Partial<SchemaFieldRow>) => void;
  onRemove: () => void;
}) {
  const isSystem = SYSTEM_SCHEMA_FIELD_SET.has(String(r.name || '').trim());
  const type = String(r.type || 'string');
  const typeOptions = SCHEMA_FIELD_TYPE_OPTIONS.filter((o) => o.value !== 'json');
  const zone = zoneOf(r);

  const defaultInput =
    type === 'number' ? (
      <InputNumber
        size="small"
        value={r.defaultText.trim() === '' ? undefined : Number(r.defaultText)}
        onChange={(v) => onUpdate({ defaultText: v == null ? '' : String(v) })}
        style={{ width: '100%' }}
      />
    ) : type === 'boolean' ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Switch
          checked={
            r.defaultText.trim() === ''
              ? false
              : ['true', '1', 'yes'].includes(r.defaultText.trim().toLowerCase())
          }
          onChange={(checked) => onUpdate({ defaultText: checked ? 'true' : 'false' })}
        />
      </div>
    ) : type === 'text' || type === 'multiSelection' ? (
      <Input.TextArea
        value={r.defaultText}
        onChange={(e) => onUpdate({ defaultText: e.target.value })}
        rows={type === 'multiSelection' ? 2 : 1}
        autoSize={{ minRows: type === 'multiSelection' ? 2 : 1, maxRows: 4 }}
        style={{ width: '100%', minWidth: 0, resize: 'none' }}
      />
    ) : (
      <Input size="small" value={r.defaultText} onChange={(e) => onUpdate({ defaultText: e.target.value })} />
    );

  return (
    <div className={`admin-contract-field admin-contract-field--${zone}`}>
      <div className="admin-contract-field__head">
        <div className="admin-contract-field__head-left">
          {dragHandle}
          <Tag color={zone === 'basic' ? 'blue' : 'purple'}>{zone}</Tag>
          <Tag>{type}</Tag>
          <span className="admin-contract-field__title">
            {r.title?.trim() ? r.title : r.name?.trim() ? r.name : `字段 #${idx + 1}`}
          </span>
          {isSystem ? <Tag color="gold">系统</Tag> : null}
        </div>
        <Button danger size="small" disabled={isSystem} onClick={onRemove}>
          删除
        </Button>
      </div>

      <div className="admin-contract-field__grid3">
        <div>
          <div className="admin-contract-field__label">字段名</div>
          <Input
            size="small"
            value={r.name}
            disabled={isSystem}
            placeholder="例如：topic"
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <div>
          <div className="admin-contract-field__label">类型</div>
          <Select
            size="small"
            value={type}
            disabled={isSystem}
            onChange={(v) => onUpdate({ type: v })}
            options={typeOptions}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <div className="admin-contract-field__label">分区 x-zone</div>
          <Select
            size="small"
            value={zone}
            disabled={isSystem}
            style={{ width: '100%' }}
            options={[
              { value: 'basic', label: 'basic · 用户可答' },
              { value: 'business', label: 'business · enrich 回填' },
            ]}
            onChange={(v: ContractFieldZone) => onUpdate(applyZoneChange(r, v))}
          />
        </div>
      </div>

      <div className="admin-contract-field__grid2">
        <div>
          <div className="admin-contract-field__label">标题</div>
          <Input
            size="small"
            value={r.title}
            disabled={isSystem}
            placeholder="展示名"
            onChange={(e) => onUpdate({ title: e.target.value })}
          />
        </div>
        <div>
          <div className="admin-contract-field__label">默认值</div>
          <div style={{ minWidth: 0 }}>{defaultInput}</div>
        </div>
      </div>

      <div>
        <div className="admin-contract-field__label">description（给模型的解读）</div>
        <Input.TextArea
          value={r.description}
          disabled={isSystem}
          placeholder="说明字段用途；input/enrich 模型靠此理解"
          onChange={(e) => onUpdate({ description: e.target.value })}
          autoSize={{ minRows: 2, maxRows: 4 }}
        />
      </div>

      <div className="admin-contract-field__toggles">
        <label>
          <span>必填</span>
          <Switch
            size="small"
            checked={isSystem ? true : !!r.required}
            disabled={isSystem}
            onChange={(v) => onUpdate({ required: v })}
          />
        </label>
        {zone === 'basic' ? (
          <label>
            <span>对用户可见</span>
            <Switch
              size="small"
              checked={isSystem ? false : !!r.userVisible}
              disabled={isSystem}
              onChange={(v) => onUpdate({ userVisible: v })}
            />
          </label>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            business 默认不对用户表单暴露
          </span>
        )}
      </div>

      {type === 'selection' || type === 'multiSelection' ? (
        <div className="admin-contract-field__grid2">
          <div>
            <div className="admin-contract-field__label">枚举（每行一个）</div>
            <Input.TextArea
              value={r.enumText}
              disabled={isSystem}
              onChange={(e) => onUpdate({ enumText: e.target.value })}
              autoSize={{ minRows: 2, maxRows: 6 }}
            />
          </div>
          <div>
            <div className="admin-contract-field__label">枚举展示名</div>
            <Input.TextArea
              value={r.enumLabelsText}
              disabled={isSystem}
              onChange={(e) => onUpdate({ enumLabelsText: e.target.value })}
              autoSize={{ minRows: 2, maxRows: 6 }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SortableFieldCard({
  r,
  idx,
  onUpdate,
  onRemove,
}: {
  r: SchemaFieldRow;
  idx: number;
  onUpdate: (patch: Partial<SchemaFieldRow>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: r.key,
    data: { zone: zoneOf(r) },
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="admin-contract-field-sortable">
      <FieldCardBody
        r={r}
        idx={idx}
        onUpdate={onUpdate}
        onRemove={onRemove}
        dragHandle={
          <button
            type="button"
            className="admin-contract-field__drag"
            aria-label="拖拽调整顺序或分区"
            {...attributes}
            {...listeners}
          >
            <HolderOutlined />
          </button>
        }
      />
    </div>
  );
}

function ZoneColumn({
  zone,
  rows,
  onAdd,
  onUpdateRow,
  onRemoveRow,
}: {
  zone: ContractFieldZone;
  rows: SchemaFieldRow[];
  onAdd: () => void;
  onUpdateRow: (key: string, patch: Partial<SchemaFieldRow>) => void;
  onRemoveRow: (key: string) => void;
}) {
  const title = zone === 'basic' ? 'Basic · 用户可答' : 'Business · enrich 回填';
  const emptyHint =
    zone === 'basic'
      ? '暂无 basic 字段。拖到此处，或点「新增」。用户表单主要填这里。'
      : '暂无 business 字段。拖到此处，或点「新增」。由 enrich 专家 text / 深检索回填。';

  const { setNodeRef, isOver } = useDroppable({
    id: ZONE_IDS[zone],
    data: { zone },
  });

  return (
    <div
      className={`admin-contract-zone admin-contract-zone--${zone}${isOver ? ' admin-contract-zone--over' : ''}`}
    >
      <div className="admin-contract-zone__header">
        <div>
          <div className="admin-contract-zone__title">{title}</div>
          <div className="admin-contract-zone__count">{rows.length} 个字段 · 可拖拽排序</div>
        </div>
        <Button size="small" type="primary" onClick={onAdd}>
          新增
        </Button>
      </div>
      <div ref={setNodeRef} className="admin-contract-zone__body">
        <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
          {rows.length === 0 ? (
            <Empty description={emptyHint} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            rows.map((row, index) => (
              <SortableFieldCard
                key={row.key}
                r={row}
                idx={index}
                onUpdate={(patch) => onUpdateRow(row.key, patch)}
                onRemove={() => onRemoveRow(row.key)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function AdminBusinessSchemaTab({
  draft,
  schemaMode,
  schemaRows,
  schemaJson,
  onSchemaModeChange,
  onSchemaRowsChange,
  onSchemaJsonChange,
}: AdminBusinessSchemaTabProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const { basic, business } = useMemo(() => partitionByZone(schemaRows), [schemaRows]);
  const activeRow = useMemo(
    () => (activeId ? schemaRows.find((r) => r.key === activeId) ?? null : null),
    [activeId, schemaRows],
  );

  const baseSchema = draft?.contractSchema ?? draft?.formSchema ?? {
    type: 'object',
    properties: {},
    required: [],
  };

  const resolveOverZone = (overId: string): ContractFieldZone | null => {
    if (overId === ZONE_IDS.basic) return 'basic';
    if (overId === ZONE_IDS.business) return 'business';
    const hit = schemaRows.find((r) => r.key === overId);
    return hit ? zoneOf(hit) : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === overKey) return;

    const activeItem = schemaRows.find((r) => r.key === activeKey);
    if (!activeItem) return;

    const fromZone = zoneOf(activeItem);
    const toZone = resolveOverZone(overKey);
    if (!toZone) return;

    const parts = partitionByZone(schemaRows);
    const fromList = fromZone === 'basic' ? parts.basic : parts.business;
    const toList = toZone === 'basic' ? parts.basic : parts.business;
    const oldIndex = fromList.findIndex((r) => r.key === activeKey);
    if (oldIndex < 0) return;

    if (fromZone === toZone) {
      // 同区内排序
      const newIndex =
        overKey === ZONE_IDS[toZone]
          ? fromList.length - 1
          : fromList.findIndex((r) => r.key === overKey);
      if (newIndex < 0 || oldIndex === newIndex) return;
      const nextZoneList = arrayMove(fromList, oldIndex, newIndex);
      onSchemaRowsChange(
        toZone === 'basic'
          ? mergeZones(nextZoneList, parts.business)
          : mergeZones(parts.basic, nextZoneList),
      );
      return;
    }

    // 跨区：改 zone，并插入到目标区 over 位置（或末尾）
    const without = fromList.filter((r) => r.key !== activeKey);
    const moved = applyZoneChange(activeItem, toZone);
    const insertAt =
      overKey === ZONE_IDS[toZone]
        ? toList.length
        : Math.max(
            0,
            toList.findIndex((r) => r.key === overKey),
          );
    const nextTarget = [...toList];
    // toList 仍含同源引用；跨区时 toList 不含 active
    const safeInsert = insertAt < 0 ? nextTarget.length : insertAt;
    nextTarget.splice(safeInsert, 0, moved);

    onSchemaRowsChange(
      toZone === 'basic'
        ? mergeZones(nextTarget, without)
        : mergeZones(without, nextTarget),
    );
  };

  const handleUpdateRow = (key: string, patch: Partial<SchemaFieldRow>) => {
    onSchemaRowsChange((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx < 0) return prev;
      const current = prev[idx];
      const nextRow = { ...current, ...patch };

      // 下拉改区：移到目标区末尾，保持区内其余顺序
      if (patch.zone && zoneOf(current) !== zoneOf(nextRow)) {
        const rest = prev.filter((r) => r.key !== key);
        const moved = applyZoneChange(nextRow, zoneOf(nextRow));
        const parts = partitionByZone(rest);
        if (zoneOf(moved) === 'basic') {
          return mergeZones([...parts.basic, moved], parts.business);
        }
        return mergeZones(parts.basic, [...parts.business, moved]);
      }

      return prev.map((r) => (r.key === key ? nextRow : r));
    });
  };

  const handleRemoveRow = (key: string) => {
    onSchemaRowsChange((prev) => prev.filter((r) => r.key !== key));
  };

  const handleAdd = (zone: ContractFieldZone) => {
    onSchemaRowsChange((prev) => {
      const parts = partitionByZone(prev);
      const field = emptyField(zone);
      if (zone === 'basic') return mergeZones([...parts.basic, field], parts.business);
      return mergeZones(parts.basic, [...parts.business, field]);
    });
  };

  return (
    <div className="admin-contract-schema">
      <div className="admin-contract-schema__toolbar">
        <span className="muted">编辑模式</span>
        <Select
          value={schemaMode}
          onChange={onSchemaModeChange}
          style={{ width: 240 }}
          options={[
            { value: 'guided', label: '可视化（竖排双区 · 可拖拽）' },
            { value: 'json', label: '高级（contractSchema JSON）' },
          ]}
        />
        <Button
          onClick={() => {
            const parsed = safeJsonParse<JsonSchema>(schemaJson);
            const nextSchema =
              schemaMode === 'guided'
                ? fieldRowsToSchema(baseSchema, schemaRows)
                : parsed.ok
                  ? parsed.value
                  : baseSchema;
            onSchemaJsonChange(prettyJson(nextSchema));
          }}
        >
          同步到 JSON
        </Button>
      </div>

      {schemaMode === 'guided' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="admin-contract-schema__zones">
            <ZoneColumn
              zone="basic"
              rows={basic}
              onAdd={() => handleAdd('basic')}
              onUpdateRow={handleUpdateRow}
              onRemoveRow={handleRemoveRow}
            />
            <ZoneColumn
              zone="business"
              rows={business}
              onAdd={() => handleAdd('business')}
              onUpdateRow={handleUpdateRow}
              onRemoveRow={handleRemoveRow}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeRow ? (
              <div className="admin-contract-field-sortable admin-contract-field-sortable--overlay">
                <FieldCardBody
                  r={activeRow}
                  idx={0}
                  onUpdate={() => undefined}
                  onRemove={() => undefined}
                  dragHandle={
                    <span className="admin-contract-field__drag admin-contract-field__drag--static">
                      <HolderOutlined />
                    </span>
                  }
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <Input.TextArea
          value={schemaJson}
          onChange={(e) => onSchemaJsonChange(e.target.value)}
          rows={18}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />
      )}
    </div>
  );
}
