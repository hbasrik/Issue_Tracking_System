import { useEffect, useState } from 'react';

/** Subscribe to a CSS media query. Defaults false until the first match. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Desktop layout (≥1024px) — side-by-side issue detail. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}

/** Wide desktop (≥1280px) — Issues table + detail side by side. */
export function useIsWide(): boolean {
  return useMediaQuery('(min-width: 1280px)');
}
