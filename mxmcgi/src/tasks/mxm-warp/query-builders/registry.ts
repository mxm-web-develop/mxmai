import type { WebSearchQueryBuilder } from './types';

const builders = new Map<string, WebSearchQueryBuilder>();

export function registerWebSearchQueryBuilder(builder: WebSearchQueryBuilder): void {
  builders.set(builder.name, builder);
}

export function resolveWebSearchQueryBuilder(name: string): WebSearchQueryBuilder | undefined {
  const key = String(name ?? '').trim();
  if (!key) return undefined;
  return builders.get(key);
}

export function listWebSearchQueryBuilderNames(): string[] {
  return [...builders.keys()].sort();
}
