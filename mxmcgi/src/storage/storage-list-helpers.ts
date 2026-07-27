import type { Request } from 'express';
import { RepositoryFactory, type StorageObjectRecord, type StorageUploadSource } from '@mxmai/mxmdata';
import { resolveStorageObjectAccessUrls } from './user-upload-url';

export function parseUploadSource(raw: unknown): StorageUploadSource | undefined {
  const v = String(raw ?? '').toLowerCase();
  if (v === 'self' || v === 'partner' || v === 'all') return v;
  return undefined;
}

export function mapStorageObjectListItem(item: StorageObjectRecord, url: string) {
  return {
    id: item.id,
    purpose: item.purpose,
    storageMode: item.storage_mode,
    folderId: item.folder_id,
    partnerAppId: item.partner_app_id,
    partnerEndUserId: item.partner_end_user_id,
    url,
    contentType: item.content_type,
    sizeBytes: item.size_bytes,
    originalName: item.original_name,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
    endUserLabel: null as string | null,
  };
}

export async function mapStorageObjectListItems(items: StorageObjectRecord[]) {
  const urls = await resolveStorageObjectAccessUrls(items);
  return items.map((item, i) => mapStorageObjectListItem(item, urls[i] ?? ''));
}

/** @deprecated 单条映射；列表请用 mapStorageObjectListItems */
export async function mapStorageObjectListItemLegacy(item: StorageObjectRecord) {
  const [mapped] = await mapStorageObjectListItems([item]);
  return mapped;
}

export async function enrichEndUserLabels<
  T extends { partnerEndUserId: string | null; endUserLabel: string | null },
>(items: T[], partnerAppId?: string): Promise<T[]> {
  const endUserIds = [
    ...new Set(items.map((i) => i.partnerEndUserId).filter((id): id is string => Boolean(id))),
  ];
  if (endUserIds.length === 0) return items;

  const partnerRepo = RepositoryFactory.createPartnerRepository();
  const labelById = new Map<string, string>();

  if (partnerAppId) {
    const endUsers = await partnerRepo.findEndUsersByIds(endUserIds);
    for (const eu of endUsers) {
      if (eu.partner_app_id !== partnerAppId) continue;
      const label = eu.display_name ?? eu.external_id ?? eu.id.slice(0, 8);
      labelById.set(eu.id, label);
    }
  } else {
    const endUsers = await partnerRepo.findEndUsersByIds(endUserIds);
    for (const eu of endUsers) {
      const label = eu.display_name ?? eu.external_id ?? eu.id.slice(0, 8);
      labelById.set(eu.id, label);
    }
  }

  return items.map((item) => {
    if (!item.partnerEndUserId) return item;
    return {
      ...item,
      endUserLabel: labelById.get(item.partnerEndUserId) ?? item.partnerEndUserId.slice(0, 8),
    };
  });
}

export function getPartnerUploadContext(req: Request): {
  partnerAppId: string;
  partnerEndUserId: string;
} | null {
  const partnerAppId = (req.headers['x-partner-app-id'] as string | undefined)?.trim();
  const partnerEndUserId = (req.headers['x-partner-end-user-id'] as string | undefined)?.trim();
  if (!partnerAppId || !partnerEndUserId) return null;
  return { partnerAppId, partnerEndUserId };
}
