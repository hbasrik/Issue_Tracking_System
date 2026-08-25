import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  mediaFileUrl,
  type MediaAttachment,
  type MediaEntityType,
} from '../lib/api';
import { isNonWebImage } from '../lib/mediaKind';

interface MediaGalleryProps {
  entityType: MediaEntityType;
  entityId: string;
  /** When set, the gallery lists every photo for this VIN (Karar 11). */
  listByVin?: string;
}

/** Thumbnail grid + upload for media_attachments (Karar 8). */
export function MediaGallery({ entityType, entityId, listByVin }: MediaGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<MediaAttachment | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = listByVin
        ? await api.listVehicleMedia(listByVin)
        : await api.listMedia(entityType, entityId);
      setItems(res.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load attachments');
      setItems([]);
    }
  }, [entityType, entityId, listByVin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

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
        <h3 className="text-[15px] font-medium">{listByVin ? 'All photos' : 'Attachments'}</h3>
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
          accept="image/*"
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
          {items.map((item) => {
            const isImage = item.mime_type?.startsWith('image/');
            const unreadable = isNonWebImage(
              item.mime_type,
              item.file_name,
              item.storage_path,
            );
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!isImage || unreadable}
                  onClick={() => isImage && !unreadable && setLightbox(item)}
                  className="w-full overflow-hidden rounded-lg border bg-[var(--bg-page)] text-left disabled:cursor-default"
                  style={{ borderColor: 'var(--border)' }}
                  aria-label={
                    unreadable
                      ? `${item.file_name} (tarayıcıda açılamaz)`
                      : isImage
                        ? `Enlarge ${item.file_name}`
                        : item.file_name
                  }
                >
                  {isImage && !unreadable ? (
                    <img
                      src={mediaFileUrl(item.storage_path)}
                      alt={item.file_name}
                      className="h-24 w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-24 flex-col items-center justify-center gap-1 px-2 text-center text-[12px] font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface-2)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>{unreadable ? 'HEIC' : extOf(item.file_name).toUpperCase() || 'FILE'}</span>
                      {unreadable && (
                        <span className="text-[11px] font-normal">
                          Tarayıcıda açılamaz
                        </span>
                      )}
                    </div>
                  )}
                  <div className="p-2">
                    <p className="truncate text-[13px]" title={item.file_name}>
                      {item.file_name}
                    </p>
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      {formatSize(item.file_size)}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-2 text-[13px] text-white"
            onClick={() => setLightbox(null)}
          >
            Close
          </button>
          <img
            src={mediaFileUrl(lightbox.storage_path)}
            alt={lightbox.file_name}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
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
