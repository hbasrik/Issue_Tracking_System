import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  mediaFileUrl,
  mediaThumbUrl,
  mediaCardThumbUrl,
} from '../lib/api';
import type { MediaImageVariant } from '../../../shared/mediaThumbs';

type Props = {
  storagePath: string;
  /**
   * Image derivative: sm (list), md (grid card), original (fullscreen).
   * Legacy `thumb` maps to sm when variant is omitted.
   */
  variant?: MediaImageVariant;
  /** @deprecated Prefer variant="sm". */
  thumb?: boolean;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
};

function resolveUrl(
  storagePath: string,
  variant: MediaImageVariant | undefined,
  thumb: boolean | undefined,
): string {
  const v = variant ?? (thumb ? 'sm' : 'original');
  if (v === 'sm') return mediaThumbUrl(storagePath);
  if (v === 'md') return mediaCardThumbUrl(storagePath);
  return mediaFileUrl(storagePath);
}

/**
 * Loads /uploads/* with the session Bearer token (browser <img> cannot).
 * Revokes the object URL on unmount / path change.
 */
export function AuthenticatedMediaImg({
  storagePath,
  variant,
  thumb,
  alt = '',
  className,
  style,
  onClick,
}: Props) {
  const { token } = useAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !storagePath) {
      setSrc(null);
      return;
    }
    const url = resolveUrl(storagePath, variant, thumb);
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`media ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storagePath, variant, thumb, token]);

  if (!src) {
    return (
      <span className={className} style={style} aria-hidden>
        …
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
    />
  );
}
