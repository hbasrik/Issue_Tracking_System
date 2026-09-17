/**
 * Split "the phone could not reach the API" from "the API rejected the
 * payload" from "the session must be refreshed".
 *
 * Transport (queue / retry, banner = offline):
 *   - no HTTP response (fetch TypeError, AbortError)
 *   - ApiError status 0 (timeout wrapper)
 *   - 408
 *   - 5xx still retried as transient, but any HTTP status means the
 *     phone reached the server (banner = online)
 *
 * Auth (keep queued, ask for login):
 *   - 401 / 403
 *
 * Payload rejection (keep queued as failed, do not retry automatically):
 *   - 400, 404, 409, 422 and other 4xx except 401/403/408
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

export function isAuthError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === 401 || status === 403;
}

export function isPayloadRejection(err: unknown): boolean {
  const status = errorStatus(err);
  if (status == null) return false;
  if (status === 401 || status === 403 || status === 408) return false;
  return status >= 400 && status < 500;
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

/** @deprecated use isPayloadRejection; 401/403 are not payload rejections. */
export function isClientRejection(err: unknown): boolean {
  return isPayloadRejection(err);
}

/** After a failed create/upload: queue unless the payload itself is invalid. */
export function shouldQueueIssueSubmit(err: unknown): boolean {
  if (isPayloadRejection(err)) return false;
  if (isAuthError(err)) return true;
  return isTransportError(err);
}

export type QueueSendErrorKind = 'transport' | 'auth' | 'payload' | 'photo';

export function classifyQueueSendError(err: unknown): QueueSendErrorKind {
  const msg = errorMessageOf(err);
  if (msg === 'queued photo missing') return 'photo';
  if (isAuthError(err)) return 'auth';
  if (isPayloadRejection(err)) return 'payload';
  return 'transport';
}
