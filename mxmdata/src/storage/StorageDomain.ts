export const STORAGE_DOMAINS = ['generated', 'user_upload', 'system_static'] as const;

export type StorageDomain = (typeof STORAGE_DOMAINS)[number];

export function isStorageDomain(value: string): value is StorageDomain {
  return (STORAGE_DOMAINS as readonly string[]).includes(value);
}
