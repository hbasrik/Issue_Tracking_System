import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { api, ApiError, type LocalFile } from '../api/client';
import { shouldQueueIssueSubmit, isTransportError } from '../../../shared/networkError';
import {
  MAX_PHOTO_BYTES,
  MAX_QUEUE_ITEMS,
  backoffMs,
  isExpired,
  newClientRequestId,
  shouldAutoFlush,
  type QueueItemStatus,
} from './issueReportQueuePolicy';

const STORAGE_KEY = 'karea.issueReportQueue.v1';
const PHOTO_DIR = 'issue-queue';

export type IssueReportPayload = {
  vin: string;
  source_type: string;
  source_station_step_id?: number;
  source_check_item_id?: number;
  station_id?: number;
  issue_type_id?: number;
  severity: string;
  description: string;
  defect_part_id: number;
  defect_type_id: number;
  custom_part_name?: string;
  custom_defect_name?: string;
};

export type QueuedIssueReport = {
  id: string;
  createdAt: string;
  status: QueueItemStatus;
  lastError?: string;
  lastErrorCode?: 'expired' | 'network' | 'http' | 'photo' | 'storage';
  attempts: number;
  nextAttemptAt?: string;
  issueId?: number;
  photoUploaded: boolean;
  photoUri: string | null;
  photoName: string | null;
  photoType: string | null;
  payload: IssueReportPayload;
};

type Store = Record<string, QueuedIssueReport[]>;

export class QueueLimitError extends Error {
  code: 'full' | 'photoTooLarge';
  constructor(code: 'full' | 'photoTooLarge') {
    super(code);
    this.code = code;
  }
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<Store> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function recoverStuck(items: QueuedIssueReport[]): QueuedIssueReport[] {
  return items.map((item) =>
    item.status === 'sending' ? { ...item, status: 'pending' as const } : item,
  );
}

export async function loadQueue(userId: number): Promise<QueuedIssueReport[]> {
  const store = await readStore();
  return recoverStuck(store[String(userId)] ?? []);
}

async function saveUserQueue(
  userId: number,
  items: QueuedIssueReport[],
): Promise<QueuedIssueReport[]> {
  return withLock(async () => {
    const store = await readStore();
    store[String(userId)] = items;
    await writeStore(store);
    return items;
  });
}

async function patchItem(
  userId: number,
  id: string,
  patch: Partial<QueuedIssueReport>,
): Promise<QueuedIssueReport[]> {
  return withLock(async () => {
    const store = await readStore();
    const key = String(userId);
    const items = recoverStuck(store[key] ?? []);
    store[key] = items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    );
    await writeStore(store);
    return store[key];
  });
}

function photoDir(): string {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new Error('document directory unavailable');
  }
  return `${base}${PHOTO_DIR}/`;
}

async function persistPhotoCopy(
  id: string,
  file: LocalFile,
): Promise<{ uri: string; size: number }> {
  const dir = photoDir();
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}${id}.jpg`;
  await FileSystem.copyAsync({ from: file.uri, to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  const size = info.exists && 'size' in info ? Number(info.size) : 0;
  return { uri: dest, size };
}

async function removePhotoFile(uri: string | null): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

export async function enqueueIssueReport(
  userId: number,
  payload: IssueReportPayload,
  photo: LocalFile | null,
  opts?: { id?: string; issueId?: number },
): Promise<QueuedIssueReport> {
  const existing = await loadQueue(userId);
  if (existing.length >= MAX_QUEUE_ITEMS && !opts?.id) {
    throw new QueueLimitError('full');
  }
  const id = opts?.id ?? newClientRequestId();
  const already = existing.find((row) => row.id === id);
  if (!already && existing.length >= MAX_QUEUE_ITEMS) {
    throw new QueueLimitError('full');
  }
  let photoUri = already?.photoUri ?? null;
  let photoName = already?.photoName ?? null;
  let photoType = already?.photoType ?? null;
  if (photo && !photoUri) {
    const copied = await persistPhotoCopy(id, photo);
    if (copied.size > MAX_PHOTO_BYTES) {
      await removePhotoFile(copied.uri);
      throw new QueueLimitError('photoTooLarge');
    }
    photoUri = copied.uri;
    photoName = photo.name;
    photoType = photo.type;
  }
  const item: QueuedIssueReport = {
    id,
    createdAt: already?.createdAt ?? new Date().toISOString(),
    status: 'pending',
    attempts: already?.attempts ?? 0,
    photoUploaded: photo == null,
    photoUri,
    photoName,
    photoType,
    payload,
    issueId: opts?.issueId ?? already?.issueId,
  };
  const next = already
    ? existing.map((row) => (row.id === id ? item : row))
    : [...existing, item];
  await saveUserQueue(userId, next);
  return item;
}

export type SubmitOutcome =
  | { kind: 'sent' }
  | { kind: 'queued'; item: QueuedIssueReport }
  | { kind: 'rejected'; error: unknown };

/**
 * Try the network first. Queue only when the phone never received a 4xx.
 * A 400/401/403/422 is a real form error and must not be stored.
 */
export async function submitOrQueueIssueReport(
  userId: number,
  payload: IssueReportPayload,
  photo: LocalFile | null,
): Promise<SubmitOutcome> {
  const id = newClientRequestId();
  try {
    const created = await api.createIssue(payload, { idempotencyKey: id });
    if (photo) {
      try {
        await api.uploadMedia('ISSUE', String(created.ID), photo);
      } catch (err) {
        if (!shouldQueueIssueSubmit(err)) {
          return { kind: 'rejected', error: err };
        }
        const item = await enqueueIssueReport(userId, payload, photo, {
          id,
          issueId: created.ID,
        });
        return { kind: 'queued', item };
      }
    }
    return { kind: 'sent' };
  } catch (err) {
    if (!shouldQueueIssueSubmit(err)) {
      return { kind: 'rejected', error: err };
    }
    const item = await enqueueIssueReport(userId, payload, photo, { id });
    return { kind: 'queued', item };
  }
}

export async function deleteQueuedReport(
  userId: number,
  id: string,
): Promise<QueuedIssueReport[]> {
  const items = await loadQueue(userId);
  const target = items.find((item) => item.id === id);
  await removePhotoFile(target?.photoUri ?? null);
  return saveUserQueue(
    userId,
    items.filter((item) => item.id !== id),
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'network error';
}

function isNetworkError(err: unknown): boolean {
  return isTransportError(err);
}

async function uploadQueuedPhoto(item: QueuedIssueReport): Promise<void> {
  if (item.photoUploaded || item.issueId == null) return;
  if (!item.photoUri) {
    const listed = await api.listMedia('ISSUE', String(item.issueId));
    if ((listed.items ?? []).length > 0) return;
    throw new Error('queued photo missing');
  }
  const listed = await api.listMedia('ISSUE', String(item.issueId));
  if ((listed.items ?? []).length > 0) return;
  await api.uploadMedia('ISSUE', String(item.issueId), {
    uri: item.photoUri,
    name: item.photoName ?? 'photo.jpg',
    type: item.photoType ?? 'image/jpeg',
  });
}

async function sendOne(
  userId: number,
  item: QueuedIssueReport,
  force: boolean,
): Promise<'done' | QueuedIssueReport> {
  const now = Date.now();
  if (!force && isExpired(item.createdAt, now) && item.issueId == null) {
    const failed: QueuedIssueReport = {
      ...item,
      status: 'failed',
      lastErrorCode: 'expired',
      lastError: 'expired',
    };
    await patchItem(userId, item.id, failed);
    return failed;
  }

  await patchItem(userId, item.id, { status: 'sending', lastError: undefined });

  try {
    let issueId = item.issueId;
    if (issueId == null) {
      const created = await api.createIssue(item.payload, {
        idempotencyKey: item.id,
      });
      issueId = created.ID;
      await patchItem(userId, item.id, { issueId });
    }
    await uploadQueuedPhoto({ ...item, issueId });
    await removePhotoFile(item.photoUri);
    const remaining = (await loadQueue(userId)).filter((row) => row.id !== item.id);
    await saveUserQueue(userId, remaining);
    return 'done';
  } catch (err) {
    const attempts = item.attempts + 1;
    const network = isNetworkError(err);
    const failed: QueuedIssueReport = {
      ...item,
      status: network ? 'pending' : 'failed',
      attempts,
      issueId: item.issueId,
      lastError: network ? undefined : errorMessage(err),
      lastErrorCode:
        errorMessage(err) === 'queued photo missing'
          ? 'photo'
          : network
            ? 'network'
            : 'http',
      nextAttemptAt: new Date(now + backoffMs(attempts - 1)).toISOString(),
    };
    const latest = await loadQueue(userId);
    const current = latest.find((row) => row.id === item.id);
    if (current?.issueId != null) {
      failed.issueId = current.issueId;
    }
    await patchItem(userId, item.id, failed);
    return failed;
  }
}

export async function flushQueue(
  userId: number,
  opts?: { id?: string; force?: boolean },
): Promise<QueuedIssueReport[]> {
  const force = opts?.force === true;
  const now = Date.now();
  let items = await loadQueue(userId);
  const targets = items
    .filter((item) => (opts?.id ? item.id === opts.id : true))
    .filter((item) => shouldAutoFlush(item, now, force))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const item of targets) {
    const result = await sendOne(userId, item, force);
    if (result !== 'done') {
      items = await loadQueue(userId);
    }
  }
  return loadQueue(userId);
}
