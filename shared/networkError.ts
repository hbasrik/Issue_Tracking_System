/**
 * Split "the phone could not reach the API" from "the API rejected the
 * payload". Queue / cache fallbacks use the former; the latter must surface
 * as a real validation error and must not be queued.
 *
 * Transport:
 *   - no HTTP response (fetch TypeError, AbortError, RN "Failed to fetch")
 *   - ApiError status 0 (our timeout wrapper)
 *   - 408 / 5xx (transient; factory proxy blips)
 *
 * Rejection:
 *   - 400–499 except 408 (invalid body, auth, not found, conflict)
 */
export function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const n = Number((err as { status: unknown }).status);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function errorMessageOf(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return '';
}

export function isTransportError(err: unknown): boolean {
  const status = errorStatus(err);
  if (status === 0 || status === 408) return true;
  if (status != null && status >= 500) return true;
  if (status != null && status >= 400 && status < 500) return false;
  if (err instanceof TypeError) return true;
  const name = err instanceof Error ? err.name : '';
  if (name === 'AbortError') return true;
  const msg = errorMessageOf(err).toLowerCase();
  return (
    msg === 'network unavailable' ||
    msg.includes('fetch failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('network error') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('internet connection appears to be offline')
  );
}

export function isClientRejection(err: unknown): boolean {
  const status = errorStatus(err);
  return status != null && status >= 400 && status < 500 && status !== 408;
}

/** After a failed create/upload: queue only when the phone never got a 4xx. */
export function shouldQueueIssueSubmit(err: unknown): boolean {
  if (isClientRejection(err)) return false;
  return isTransportError(err);
}
