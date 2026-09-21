/**
 * Upload derivative sizes — keep in sync with
 * backend/internal/delivery/http/upload_handler.go
 *
 * sm: phone compact list (64 CSS px @3x ≈ 192)
 * md: grid card photo (max measured ~360 CSS px @2x ≈ 720; 800 covers
 *     1024/768 two-column cards and leaves headroom for DPR without
 *     shipping multi‑MB originals)
 */
export const MEDIA_THUMB_SM_MAX_EDGE = 192;
export const MEDIA_THUMB_MD_MAX_EDGE = 800;

export type MediaImageVariant = 'original' | 'sm' | 'md';
