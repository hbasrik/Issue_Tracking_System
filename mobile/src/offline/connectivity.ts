import { useEffect, useState } from 'react';

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(online);
}

export function noteTransportSuccess(): void {
  if (online) return;
  online = true;
  emit();
}

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

export function useAppOnline(): boolean {
  const [online, setOnline] = useState(() => isAppOnline());
  useEffect(() => subscribeConnectivity(setOnline), []);
  return online;
}
