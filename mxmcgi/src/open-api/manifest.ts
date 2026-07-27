import type { PublishedApiInputDoc, PublishedApiKind, PublishedApiRecord } from '@mxmai/mxmdata';
import type { JsonSchemaV2 } from '../tasks/types';

export interface PublishedApiManifest {
  slug: string;
  title: string;
  description: string | null;
  kind: PublishedApiKind;
  schemaVersion: number;
  authentication: {
    type: 'bearer';
    header: 'Authorization';
    prefix: 'mxm_';
  };
  endpoints: {
    schema: string;
    run: string;
    jobStatus: string;
  };
  inputSchema: JsonSchemaV2;
  inputDoc: PublishedApiInputDoc;
  async: true;
  polling: {
    pathTemplate: string;
    intervalMs: number;
  };
  curlExamples: {
    getManifest: string;
    run: string;
    pollJob: string;
  };
}

function sampleRunBody(
  kind: PublishedApiKind,
  inputDoc: PublishedApiInputDoc,
  inputSchema: JsonSchemaV2
): Record<string, unknown> {
  if (kind === 'smartflow') {
    const ex = inputDoc.examples;
    const input_data =
      (ex && typeof ex === 'object' && 'input_data' in ex
        ? (ex as { input_data?: Record<string, unknown> }).input_data
        : undefined) ?? {};
    return { input_data };
  }
  const ex = inputDoc.examples;
  if (ex && typeof ex === 'object' && 'params' in ex && typeof (ex as { params?: unknown }).params === 'object') {
    return { params: (ex as { params: Record<string, unknown> }).params };
  }
  const props = (inputSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(inputSchema.required) ? inputSchema.required.map(String) : [];
  const params: Record<string, unknown> = {};
  for (const key of required) {
    const p = props[key];
    if (!p) {
      params[key] = '';
      continue;
    }
    if (p.default !== undefined) params[key] = p.default;
    else if (Array.isArray(p.enum) && p.enum.length > 0) params[key] = p.enum[0];
    else if (p.type === 'array') params[key] = [];
    else if (p.type === 'boolean') params[key] = false;
    else if (p.type === 'number' || p.type === 'integer') params[key] = 0;
    else params[key] = '';
  }
  return { params };
}

function baseUrlFromReq(req?: { headers?: Record<string, unknown> }): string {
  const env = process.env.PUBLIC_API_BASE_URL || process.env.GATEWAY_PUBLIC_URL || '';
  if (env) return env.replace(/\/$/, '');
  return 'https://your-gateway.example.com';
}

export function buildPublishedApiManifest(
  record: PublishedApiRecord,
  opts?: { baseUrl?: string }
): PublishedApiManifest {
  const base = (opts?.baseUrl || baseUrlFromReq()).replace(/\/$/, '');
  const slug = record.slug;
  const schemaPath = `/api/v1/open/${slug}`;
  const runPath = `/api/v1/open/${slug}/run`;
  const jobPath = `/api/v1/open/${slug}/jobs/{jobId}`;

  const authHeader = 'Authorization: Bearer mxm_YOUR_API_KEY';
  const inputSchema = record.input_schema_snapshot as JsonSchemaV2;
  const inputDoc = record.input_doc ?? {};
  const runBody = sampleRunBody(record.kind, inputDoc, inputSchema);
  const runBodyJson = JSON.stringify(runBody);

  return {
    slug,
    title: record.title,
    description: record.description,
    kind: record.kind,
    schemaVersion: record.schema_version,
    authentication: { type: 'bearer', header: 'Authorization', prefix: 'mxm_' },
    endpoints: {
      schema: schemaPath,
      run: runPath,
      jobStatus: jobPath,
    },
    inputSchema,
    inputDoc,
    async: true,
    polling: {
      pathTemplate: jobPath,
      intervalMs: 2000,
    },
    curlExamples: {
      getManifest: `curl -sS "${base}${schemaPath}" -H "${authHeader}"`,
      run: `curl -sS -X POST "${base}${runPath}" -H "Content-Type: application/json" -H "${authHeader}" -d '${runBodyJson.replace(/'/g, "'\\''")}'`,
      pollJob: `curl -sS "${base}${jobPath.replace('{jobId}', 'JOB_ID')}" -H "${authHeader}"`,
    },
  };
}
