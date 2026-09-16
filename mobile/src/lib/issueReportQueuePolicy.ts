/**
 * Limits, backoff, and expiry for the issue-report offline queue.
 *
 * Why these numbers:
 * - 20 records: a shift of failed submits without filling the device.
 * - 4 MB/photo: already JPEG-compressed by prepareUploadImage; 20×4 MB = 80 MB cap.
 * - 7 days: factory Wi-Fi outages are hours, not weeks. Older rows stop auto-
 *   retry so a forgotten draft does not hammer the API after the operator
 *   moved on. They are not deleted silently — the user must retry or remove.
 */

export const MAX_QUEUE_ITEMS = 20;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000] as const;

export type QueueItemStatus = 'pending' | 'sending' | 'failed';

export function newClientRequestId(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function backoffMs(failedAttempts: number): number {
  const i = Math.max(0, Math.min(failedAttempts, BACKOFF_MS.length - 1));
  return BACKOFF_MS[i];
}

export function isExpired(createdAt: string, nowMs: number): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return nowMs - created >= MAX_AGE_MS;
}

export function shouldAutoFlush(item: {
  status: QueueItemStatus;
  createdAt: string;
  nextAttemptAt?: string;
  issueId?: number;
}, nowMs: number, force: boolean): boolean {
  if (item.status === 'sending') return false;
  if (force) return true;
  if (isExpired(item.createdAt, nowMs) && item.issueId == null) return false;
  if (item.nextAttemptAt) {
    const next = Date.parse(item.nextAttemptAt);
    if (!Number.isNaN(next) && next > nowMs) return false;
  }
  return true;
}
