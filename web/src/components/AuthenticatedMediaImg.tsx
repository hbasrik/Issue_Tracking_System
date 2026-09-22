import { useEffect, useRef, useState } from 'react';
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
  /**
   * When false, skip network fetch until the element intersects the viewport
   * (Issues board first paint). Default true for lightbox / detail callers.
   */
  lazy?: boolean;
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

function cacheKey(
  storagePath: string,
  variant: MediaImageVariant | undefined,
  thumb: boolean | undefined,
  token: string,
): string {
  const v = variant ?? (thumb ? 'sm' : 'original');
  return `${token}|${v}|${storagePath}`;
}

/** Session-lifetime blob URLs so Issues auto-refresh does not re-fetch. */
const blobUrlCache = new Map<string, string>();

/**
 * Loads /uploads/* with the session Bearer token (browser <img> cannot).
 * Uses HTTP cache (force-cache) plus an in-memory blob map so remounts /
 * silent list refreshes do not re-download immutable media.
 * With lazy=true, fetch waits until the placeholder enters the viewport.
 */
export function AuthenticatedMediaImg({
  storagePath,
  variant,
  thumb,
  alt = '',
  className,
  style,
  onClick,
  lazy = false,
}: Props) {
  const { token } = useAuth();
  const rootRef = useRef<HTMLSpanElement | HTMLImageElement | null>(null);
  const [inView, setInView] = useState(!lazy);
  const [src, setSrc] = useState<string | null>(() => {
    if (!token || !storagePath) return null;
    return blobUrlCache.get(cacheKey(storagePath, variant, thumb, token)) ?? null;
  });

  useEffect(() => {
    if (!lazy || inView) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, inView]);

  useEffect(() => {
    if (!token || !storagePath || !inView) {
      if (!token || !storagePath) setSrc(null);
      return;
    }
    const key = cacheKey(storagePath, variant, thumb, token);
    const cached = blobUrlCache.get(key);
    if (cached) {
      setSrc(cached);
      return;
    }
    const url = resolveUrl(storagePath, variant, thumb);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'force-cache',
        });
        if (!res.ok) throw new Error(`media ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(key, objectUrl);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath, variant, thumb, token, inView]);

  if (!src) {
    return (
      <span
        ref={rootRef as React.RefObject<HTMLSpanElement>}
        className={className}
        style={style}
        aria-hidden
      >
        …
      </span>
    );
  }
  return (
    <img
      ref={rootRef as React.RefObject<HTMLImageElement>}
      src={src}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
    />
  );
}
