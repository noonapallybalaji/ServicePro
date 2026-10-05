import { useCallback, useSyncExternalStore } from 'react';

import { MEDIA_QUERIES } from '../tokens/breakpoints';

/**
 * Subscribe to a media query. Use only when BEHAVIOUR must differ by viewport —
 * layout differences belong in CSS (`md:`, `lg:`, `pointer-coarse:`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(MEDIA_QUERIES.reducedMotion);
}
