/**
 * Legacy object key resolution for dual-read compatibility (P2)
 */

export function isLegacyUserUploadKeyForUser(key: string, userId: string): boolean {
  if (key.startsWith(`upload/${userId}/`)) return true;
  if (key.startsWith(`upload/temp/${userId}/`)) return true;
  if (key.startsWith(`${userId}/upload/`)) return true;
  if (key.startsWith(`temp/${userId}/`)) return true;
  if (key.startsWith(`knowledge/${userId}/`)) return true;
  // R2 flat reference keys (no user prefix) — allowed only when served via objectId route
  return false;
}

export function assertUserCanAccessUploadKey(key: string, userId: string): boolean {
  return isLegacyUserUploadKeyForUser(key, userId);
}
