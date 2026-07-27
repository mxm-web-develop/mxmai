import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import type { JsonSchemaV2 } from './types';
import { ValidationError } from './errors';

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
});
addFormats(ajv);

const compiled = new WeakMap<object, ValidateFunction>();

export function validateWithJsonSchema(schema: JsonSchemaV2, data: unknown): void {
  if (!schema || typeof schema !== 'object') {
    throw new ValidationError('formSchema 无效：必须是 JSON Schema 对象');
  }
  let validate = compiled.get(schema as unknown as object);
  if (!validate) {
    validate = ajv.compile(schema);
    compiled.set(schema as unknown as object, validate);
  }
  const ok = validate(data);
  if (!ok) {
    const detail =
      validate.errors
        ?.slice(0, 5)
        .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim())
        .join('; ') ?? '';
    throw new ValidationError(
      `参数校验失败（JSON Schema）${detail ? ` — ${detail}` : ''}`,
      validate.errors ?? null
    );
  }
}

