import { downloadApiFile } from "@/lib/api";

const MAX_CACHED_MEDIA = 24;
const MAX_CACHED_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_CACHED_ITEM_BYTES = 5 * 1024 * 1024;
const mediaCache = new Map<string, Blob>();
const mediaRequests = new Map<string, Promise<Blob>>();
let cachedMediaBytes = 0;

function rememberMedia(key: string, blob: Blob) {
  if (blob.size > MAX_CACHED_ITEM_BYTES) return;
  const existing = mediaCache.get(key);
  if (existing) cachedMediaBytes -= existing.size;
  mediaCache.delete(key);
  mediaCache.set(key, blob);
  cachedMediaBytes += blob.size;
  while (mediaCache.size > MAX_CACHED_MEDIA || cachedMediaBytes > MAX_CACHED_MEDIA_BYTES) {
    const oldestKey = mediaCache.keys().next().value;
    if (!oldestKey) break;
    const oldest = mediaCache.get(oldestKey);
    if (oldest) cachedMediaBytes -= oldest.size;
    mediaCache.delete(oldestKey);
  }
}

export function loadInboxMedia(path: string, accessToken: string): Promise<Blob> {
  // Keep cached media scoped to the authenticated session as well as the message.
  const key = `${accessToken}:${path}`;
  const cached = mediaCache.get(key);
  if (cached) {
    mediaCache.delete(key);
    mediaCache.set(key, cached);
    return Promise.resolve(cached);
  }

  const pending = mediaRequests.get(key);
  if (pending) return pending;

  const request = downloadApiFile(path, accessToken)
    .then((blob) => {
      rememberMedia(key, blob);
      return blob;
    })
    .finally(() => mediaRequests.delete(key));
  mediaRequests.set(key, request);
  return request;
}

export function clearInboxMediaCache() {
  mediaCache.clear();
  mediaRequests.clear();
  cachedMediaBytes = 0;
}
