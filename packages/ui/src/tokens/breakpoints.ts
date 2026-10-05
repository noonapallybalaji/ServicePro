/**
 * Breakpoints in px. Mirrors `--breakpoint-*` in styles/theme.css — keep them in sync.
 * Prefer CSS (`md:`, `lg:`, `pointer-coarse:`) for layout. Use these only when behaviour,
 * not just styling, must change (e.g. mounting a map only on desktop).
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1440,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export const MEDIA_QUERIES = {
  sm: `(min-width: ${BREAKPOINTS.sm}px)`,
  md: `(min-width: ${BREAKPOINTS.md}px)`,
  lg: `(min-width: ${BREAKPOINTS.lg}px)`,
  xl: `(min-width: ${BREAKPOINTS.xl}px)`,
  coarsePointer: '(pointer: coarse)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;
