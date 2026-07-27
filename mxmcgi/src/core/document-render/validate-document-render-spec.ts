import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import specSchema from './document-render-spec.v1.schema.json';
import type { DocumentPdfRenderer, DocumentRenderSpecV1 } from './types';

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);

const validateSpec = ajv.compile(specSchema);

const MARKDOWN_FORBIDDEN_BLOCKS = new Set(['twoColumn']);
const STYLED_FORBIDDEN_BLOCKS = new Set<string>();

export interface ValidateDocumentRenderSpecResult {
  ok: true;
  spec: DocumentRenderSpecV1;
}

export interface ValidateDocumentRenderSpecError {
  ok: false;
  errors: string[];
}

export type ValidateDocumentRenderSpecOutcome =
  | ValidateDocumentRenderSpecResult
  | ValidateDocumentRenderSpecError;

function collectBlockTypes(blocks: DocumentRenderSpecV1['blocks'], out: Set<string>): void {
  for (const block of blocks) {
    out.add(block.type);
    if (block.type === 'twoColumn') {
      if (Array.isArray(block.left)) collectBlockTypes(block.left, out);
      if (Array.isArray(block.right)) collectBlockTypes(block.right, out);
    }
  }
}

export function validateDocumentRenderSpec(
  data: unknown,
  renderer: DocumentPdfRenderer
): ValidateDocumentRenderSpecOutcome {
  const errors: string[] = [];

  if (!validateSpec(data)) {
    errors.push(ajv.errorsText(validateSpec.errors, { separator: '; ' }));
    return { ok: false, errors };
  }

  const spec = data as DocumentRenderSpecV1;
  const blockTypes = new Set<string>();
  collectBlockTypes(spec.blocks, blockTypes);

  if (renderer === 'markdown') {
    for (const forbidden of MARKDOWN_FORBIDDEN_BLOCKS) {
      if (blockTypes.has(forbidden)) {
        errors.push(`renderer=markdown 不允许 block 类型: ${forbidden}`);
      }
    }
    if (spec.page.backgroundImage?.trim()) {
      errors.push('renderer=markdown 不允许 page.backgroundImage');
    }
  }

  if (renderer === 'styled') {
    for (const forbidden of STYLED_FORBIDDEN_BLOCKS) {
      if (blockTypes.has(forbidden)) {
        errors.push(`renderer=styled 不允许 block 类型: ${forbidden}`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, spec };
}

export function parseLayoutLlmOutput(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('layout LLM 输出为空');
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(jsonText.slice(start, end + 1)) as unknown;
    }
    throw new Error('layout LLM 输出不是合法 JSON');
  }
}
