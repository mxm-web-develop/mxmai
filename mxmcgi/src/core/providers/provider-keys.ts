/**
 * Provider API Key 解析：数组模式，优先使用第一个
 * 优先从 DB 读取（Admin 配置），无则从 .env 解析（*_API_KEY / *_API_KEYS）
 * 安全：key_value 仅在此模块内部使用，禁止写入日志或返回给前端
 */

export type ProviderKeyKind =
  | 'deer'
  | 'replicate'
  | 'ppio'
  | 'openai'
  | 'openrouter'
  | 'qhai'
  | 'jiekou'
  | 'google'
  | 'anthropic'
  | 'qwen'
  | 'volc'
  | 'minimax'
  | 'atlascloud'
  | 'maxplan';
export type OfficialService = 'openai' | 'google' | 'anthropic' | 'minimax' | 'qwen' | 'volc';

const ENV_MAP: Record<string, { single: string; multi: string }> = {
  deer: { single: 'DEERAPI_API_KEY', multi: 'DEERAPI_API_KEYS' },
  replicate: { single: 'REPLICATE_API_TOKEN', multi: 'REPLICATE_API_TOKENS' },
  ppio: { single: 'PPIO_API_KEY', multi: 'PPIO_API_KEYS' },
  openai: { single: 'OPENAI_API_KEY', multi: 'OPENAI_API_KEYS' },
  google: { single: 'GOOGLE_API_KEY', multi: 'GOOGLE_API_KEYS' },
  anthropic: { single: 'ANTHROPIC_API_KEY', multi: 'ANTHROPIC_API_KEYS' },
  minimax: { single: 'MINIMAX_API_KEY', multi: 'MINIMAX_API_KEYS' },
  qwen: { single: 'QWEN_API_KEY', multi: 'QWEN_API_KEYS' },
  volc: { single: 'VOLC_API_KEY', multi: 'VOLC_API_KEYS' },
  atlascloud: { single: 'ATLASCLOUD_API_KEY', multi: 'ATLASCLOUD_API_KEYS' },
  maxplan: { single: 'MAXPLAN_API_KEY', multi: 'MAXPLAN_API_KEYS' },
  openrouter: { single: 'OPENROUTER_API_KEY', multi: 'OPENROUTER_API_KEYS' },
  qhai: { single: 'QHAI_API_KEY', multi: 'QHAI_API_KEYS' },
  jiekou: { single: 'JIEKOU_API_KEY', multi: 'JIEKOU_API_KEYS' },
};

function parseEnvKeys(singleVar: string, multiVar: string): string[] {
  const multi = process.env[multiVar];
  if (multi != null && String(multi).trim() !== '') {
    return multi
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
  const single = process.env[singleVar];
  if (single != null && String(single).trim() !== '') {
    return [single.trim()];
  }
  return [];
}

function getEnvKeysFallback(provider: ProviderKeyKind, _service?: OfficialService | string): string[] {
  const key = provider;
  const singleVar = ENV_MAP[key]?.single;
  const multiVar = ENV_MAP[key]?.multi;
  if (!singleVar || !multiVar) return [];
  return parseEnvKeys(singleVar, multiVar);
}

/**
 * 获取指定 provider（及 optional service）的 API key 数组，按使用顺序（第一个优先）
 * **默认**：优先使用 DB 中 Admin 配置的 key；仅当 DB 无可用 key 或查询失败时回退 .env
 */
export async function getProviderKeys(provider: ProviderKeyKind, service?: OfficialService | string | null): Promise<string[]> {
  try {
    const { RepositoryFactory } = await import('@mxmai/mxmdata');
    const repo = RepositoryFactory.createProviderApiKeyRepository();
    const serviceNorm = service ? String(service).toLowerCase() : null;
    let dbKeys = await repo.listKeysForProvider(provider, serviceNorm ?? undefined);
    // replicate / ppio 无子 service：listKeysForProvider(undefined) 只匹配 service 为空；
    // Admin 若误填了 Service 字段会查不到，此处再按 provider 全量兜底。
    if ((!dbKeys || dbKeys.length === 0) && !serviceNorm && (provider === 'replicate' || provider === 'ppio')) {
      dbKeys = await repo.listAllActiveKeysForProvider(provider);
    }
    if (dbKeys && dbKeys.length > 0) {
      return dbKeys.map((r: { key_value: string }) => r.key_value);
    }
  } catch (_e) {
    // DB 不可用或表未建时回退 .env
  }
  return getEnvKeysFallback(provider, service);
}

/**
 * Deer 专用：与 getProviderKeys('deer') 相同，但语义上强调「以 Admin/数据库为准」。
 * 多 key 时按 priority 升序，供 429 等场景轮换。
 */
export async function getDeerProviderKeys(service?: OfficialService | string | null): Promise<string[]> {
  return getProviderKeys('deer', service);
}

/**
 * 取第一个 key（兼容现有单 key 调用方）
 */
export async function getFirstProviderKey(provider: ProviderKeyKind, service?: OfficialService | string): Promise<string | null> {
  const keys = await getProviderKeys(provider, service);
  return keys.length > 0 ? keys[0] : null;
}
