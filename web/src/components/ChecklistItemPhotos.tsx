import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import type { MediaAttachment } from '../lib/api';
import { isNonWebImage } from '../lib/mediaKind';
import { AuthenticatedMediaImg } from './AuthenticatedMediaImg';

/** Thumbnails of every photo already attached to one checklist item. */
export function ChecklistItemPhotos({ photos }: { photos: MediaAttachment[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<MediaAttachment | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const shown = photos.filter(
    (p) => p.mime_type?.startsWith('image/') && !isNonWebImage(p.mime_type, p.file_name, p.storage_path),
  );
  if (shown.length === 0) return null;

  return (
    <div className="mt-2" data-checklist-photos={shown.length}>
      <ul className="flex flex-wrap gap-2" aria-label={t('media.photos')}>
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(p)}
              className="block overflow-hidden rounded-lg border"
              style={{ borderColor: 'var(--border)' }}
              aria-label={t('issueDetail.enlarge', { name: p.file_name })}
            >
              <AuthenticatedMediaImg
                storagePath={p.storage_path}
                variant="sm"
                alt={p.file_name}
                className="h-16 w-16 object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('media.viewer')}
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white/10 px-3 py-2 text-[13px] text-white"
            onClick={() => setOpen(null)}
          >
            {t('common.close')}
          </button>
          <AuthenticatedMediaImg
            storagePath={open.storage_path}
            alt={open.file_name}
            className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
