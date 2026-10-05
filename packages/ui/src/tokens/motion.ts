/** Durations in ms. Mirrors `--duration-*` in styles/tokens.css for JS-driven timing. */
export const DURATION_MS = {
  instant: 100,
  fast: 150,
  base: 200,
  slow: 300,
  slower: 420,
} as const;

/** How long a toast stays visible before auto-dismissing. */
export const TOAST_DURATION_MS = 5000;
