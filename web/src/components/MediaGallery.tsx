import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type MediaAttachment,
  type MediaEntityType,
} from '../lib/api';

interface MediaGalleryProps {
  entityType: MediaEntityType;
  entityId: string;
}

/** Thumbnail grid + upload for media_attachments (Karar 8). */
export function MediaGallery({ entityType, entityId }: MediaGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.listMedia(entityType, entityId);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load attachments');
      setItems([]);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadMedia(entityType, entityId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium">Attachments</h3>
        <button
          type="button"
          disabled={busy || !entityId}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border px-3 py-1.5 text-[13px] disabled:opacity-60"
          style={{ borderColor: 'var(--border)' }}
        >
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p className="mt-2 text-[13px]" style={{ color: 'var(--status-not-ok)' }}>
          {error}
        </p>
      )}
      {items.length === 0 && !error && (
        <p className="mt-3 text-[13px] text-[var(--text-secondary)]">
          No attachments yet
        </p>
      )}
      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="overflow-hidden rounded-lg border bg-[var(--bg-page)] p-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <Thumbnail mime={item.mime_type} name={item.file_name} />
              <p className="mt-2 truncate text-[13px]" title={item.file_name}>
                {item.file_name}
              </p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {formatSize(item.file_size)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumbnail({ mime, name }: { mime: string; name: string }) {
  const isImage = mime.startsWith('image/');
  return (
    <div
      className="flex h-20 items-center justify-center rounded-md text-[12px] font-medium"
      style={{
        backgroundColor: 'var(--bg-surface-2)',
        color: isImage ? 'var(--accent)' : 'var(--text-secondary)',
      }}
      aria-hidden
    >
      {isImage ? 'IMG' : extOf(name).toUpperCase() || 'FILE'}
    </div>
  );
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).slice(0, 4) : '';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
