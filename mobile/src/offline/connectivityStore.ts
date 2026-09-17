type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(online);
}

/** Any HTTP response (including 401/5xx) means the phone reached the API. */
export function noteTransportSuccess(): void {
  if (online) return;
  online = true;
  emit();
}

/** No HTTP response (TypeError, abort, timeout). */
export function noteTransportFailure(): void {
  if (!online) return;
  online = false;
  emit();
}

export function isAppOnline(): boolean {
  return online;
}

export function subscribeConnectivity(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Test-only: reset the module singleton so scripts can measure emit(). */
export function resetConnectivityForTests(value = true): void {
  online = value;
}
