'use client';

import type { JsonSchema, JsonSchemaProperty } from '@/adapters/types';
import type { SchemaFormValue } from '@/lib/schema-utils';
import { hasEshopGarmentBatch, isUserVisible, syncEshopBatchDerivedFields } from '@/lib/schema-utils';
import { ReferenceImagesField } from './ReferenceImagesField';
import { EshopGarmentBatchField } from './EshopGarmentBatchField';
import { SelectionField } from './SelectionField';
import { NumberField } from './NumberField';
import { BooleanField } from './BooleanField';
import { TextField } from './TextField';

function SchemaField({
  fieldKey,
  def,
  value,
  onChange,
  fieldHints,
}: {
  fieldKey: string;
  def: JsonSchemaProperty;
  value: unknown;
  onChange: (next: unknown) => void;
  fieldHints?: Record<string, string>;
}) {
  const ui = def['x-ui-type'];

  if (ui === 'referenceImages') {
    return (
      <ReferenceImagesField
        fieldKey={fieldKey}
        def={def}
        value={value}
        onChange={onChange as (v: unknown) => void}
      />
    );
  }
  if (ui === 'eshopGarmentBatch') {
    return (
      <EshopGarmentBatchField
        fieldKey={fieldKey}
        def={def}
        value={value}
        onChange={onChange as (v: unknown) => void}
      />
    );
  }
  if (ui === 'selection') {
    return (
      <SelectionField
        fieldKey={fieldKey}
        def={def}
        value={value}
        onChange={onChange as (v: string) => void}
        fieldHints={fieldHints}
      />
    );
  }
  if (ui === 'number') {
    return (
      <NumberField fieldKey={fieldKey} def={def} value={value} onChange={onChange as (v: number) => void} />
    );
  }
  if (ui === 'boolean' || ui === 'switch' || def.type === 'boolean') {
    return (
      <BooleanField fieldKey={fieldKey} def={def} value={value} onChange={onChange as (v: boolean) => void} />
    );
  }
  if (ui === 'text' || (def.type === 'string' && fieldKey === 'prompt')) {
    return (
      <TextField fieldKey={fieldKey} def={def} value={value} onChange={onChange as (v: string) => void} multiline />
    );
  }

  return (
    <TextField fieldKey={fieldKey} def={def} value={value} onChange={onChange as (v: string) => void} />
  );
}

export function MobileSchemaForm({
  schema,
  values,
  onChange,
  fieldKeys,
  fieldHints,
}: {
  schema: JsonSchema;
  values: SchemaFormValue;
  onChange: (next: SchemaFormValue) => void;
  fieldKeys?: string[];
  fieldHints?: Record<string, string>;
}) {
  const props = schema.properties ?? {};
  const keys =
    fieldKeys ??
    Object.keys(props).filter((k) => {
      const def = props[k];
      return def && isUserVisible(def);
    });

  const needsDerived = hasEshopGarmentBatch(schema);

  const handleChange = (next: SchemaFormValue) => {
    onChange(needsDerived ? syncEshopBatchDerivedFields(next) : next);
  };

  const displayValues = needsDerived ? syncEshopBatchDerivedFields(values) : values;

  return (
    <div className="space-y-6">
      {keys.map((key) => {
        const def = props[key];
        if (!def || !isUserVisible(def)) return null;
        return (
          <SchemaField
            key={key}
            fieldKey={key}
            def={def}
            value={displayValues[key]}
            onChange={(next) => handleChange({ ...displayValues, [key]: next })}
            fieldHints={fieldHints}
          />
        );
      })}
    </div>
  );
}
