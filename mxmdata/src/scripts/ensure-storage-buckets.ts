/**
 * 按 .env 中 STORAGE_* 三块配置，检查并在对应 backend 上创建缺失的桶。
 * 支持 minio / r2 / aliyun_oss（S3 兼容 CreateBucket API）。
 *
 * 运行：pnpm ensure:buckets
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { loadMonorepoEnv } from '../env';
import { loadStorageConfig, loadUserTempUploadConfig } from '../storage/loadStorageConfig';
import { resolveProviderCredentials } from '../storage/resolveProviderCredentials';
import type { StorageProvider } from '../storage/StorageProvider';
import { STORAGE_PROVIDERS } from '../storage/StorageProvider';

const LOG = '[ensure:buckets]';

/** R2：仅小写字母、数字、连字符 */
const R2_BUCKET_NAME_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/** MinIO / 通用 S3 DNS 桶名 */
const S3_DNS_BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

function collectBucketsByProvider(): Map<StorageProvider, Set<string>> {
  const config = loadStorageConfig();
  const map = new Map<StorageProvider, Set<string>>();

  const add = (provider: StorageProvider, bucket: string) => {
    if (!bucket.trim()) return;
    let set = map.get(provider);
    if (!set) {
      set = new Set();
      map.set(provider, set);
    }
    set.add(bucket.trim());
  };

  for (const domain of ['generated', 'user_upload', 'system_static'] as const) {
    const d = config.domains[domain];
    add(d.provider, d.bucket);
  }

  const userTemp = loadUserTempUploadConfig();
  if (userTemp) {
    add(userTemp.provider, userTemp.bucket);
  }

  return map;
}

function assertValidBucketName(provider: StorageProvider, name: string): void {
  if (name.length < 3 || name.length > 63) {
    throw new Error(`桶名 "${name}" 长度须为 3–63（provider=${provider}）`);
  }

  if (provider === 'r2') {
    if (!R2_BUCKET_NAME_RE.test(name)) {
      throw new Error(
        `桶名 "${name}" 不符合 R2 规则（仅 a-z、0-9、-，禁止下划线）。请改 STORAGE_*_BUCKET。`
      );
    }
    return;
  }

  if (!S3_DNS_BUCKET_RE.test(name)) {
    throw new Error(
      `桶名 "${name}" 不符合 ${provider} 命名规则（小写字母、数字、.-，且首尾为字母或数字）。`
    );
  }
}

function assertProviderCredentials(provider: StorageProvider): void {
  const creds = resolveProviderCredentials(provider);
  if (!creds.endpoint?.trim()) {
    throw new Error(`${provider}: 缺少 endpoint（见 .env 中 MINIO_* / R2_* / OSS_*）`);
  }
  if (!creds.accessKeyId?.trim() || !creds.secretAccessKey?.trim()) {
    throw new Error(`${provider}: 缺少 accessKey / secretKey`);
  }
}

function createS3Client(provider: StorageProvider): S3Client {
  const creds = resolveProviderCredentials(provider);
  return new S3Client({
    region: creds.region,
    endpoint: creds.endpoint,
    forcePathStyle: creds.forcePathStyle ?? true,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
  });
}

async function bucketExists(client: S3Client, name: string): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }));
    return true;
  } catch (err: unknown) {
    const code = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (code === 'NotFound' || code === 'NoSuchBucket' || status === 404) {
      return false;
    }
    throw err;
  }
}

function isAlreadyExistsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('BucketAlreadyOwnedByYou') ||
    msg.includes('BucketAlreadyExists') ||
    msg.includes('AlreadyExists') ||
    msg.includes('already exists')
  );
}

async function ensureProviderBuckets(
  provider: StorageProvider,
  buckets: string[]
): Promise<void> {
  assertProviderCredentials(provider);
  for (const name of buckets) {
    assertValidBucketName(provider, name);
  }

  const creds = resolveProviderCredentials(provider);
  const client = createS3Client(provider);

  console.log(`${LOG} [${provider}] endpoint: ${creds.endpoint}`);
  console.log(`${LOG} [${provider}] 目标桶: ${buckets.join(', ')}`);

  try {
    const listed = await client.send(new ListBucketsCommand({}));
    const existing = new Set((listed.Buckets || []).map((b) => b.Name).filter(Boolean));
    console.log(
      `${LOG} [${provider}] 已有桶:`,
      existing.size ? [...existing].join(', ') : '(无)'
    );
  } catch {
    console.warn(`${LOG} [${provider}] ListBuckets 不可用，改用 HeadBucket 逐个检查`);
  }

  for (const name of buckets) {
    if (await bucketExists(client, name)) {
      console.log(`${LOG} [${provider}] ✓ 已存在: ${name}`);
      continue;
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: name }));
      console.log(`${LOG} [${provider}] ✓ 已创建: ${name}`);
    } catch (err: unknown) {
      if (isAlreadyExistsError(err)) {
        console.log(`${LOG} [${provider}] ✓ 已存在(并发): ${name}`);
        continue;
      }
      throw err;
    }
  }
}

async function main(): Promise<void> {
  loadMonorepoEnv();

  const byProvider = collectBucketsByProvider();
  if (byProvider.size === 0) {
    console.log(`${LOG} 未配置 STORAGE_* 桶，跳过`);
    return;
  }

  const ordered = STORAGE_PROVIDERS.filter((p) => byProvider.has(p));

  for (const provider of ordered) {
    const buckets = [...(byProvider.get(provider) || [])].sort();
    try {
      await ensureProviderBuckets(provider, buckets);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} [${provider}] 失败: ${msg}`);
      throw err;
    }
  }

  console.log(`${LOG} 完成`);
}

main().catch((e) => {
  console.error(`${LOG} 失败:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
