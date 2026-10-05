/**
 * Hues are the decorative colour layer: appliance categories, avatars, illustrations.
 * They never carry status — that is what tones are for (tones.ts).
 * Class strings are written out literally so Tailwind can detect them.
 */
export const HUES = ['sky', 'violet', 'mint', 'indigo', 'orange', 'rose'] as const;
export type Hue = (typeof HUES)[number];

interface HueClasses {
  /** Tinted background with readable (AA) text — tiles, chips, avatars. */
  subtle: string;
  /** Vivid fill for dots, bars and accents. */
  fill: string;
  /** Text in the hue on a light surface. */
  text: string;
  /** Top/left accent stripe on a card. */
  border: string;
}

export const HUE_CLASSES: Record<Hue, HueClasses> = {
  sky: { subtle: 'bg-hue-sky-subtle text-hue-sky-foreground', fill: 'bg-hue-sky', text: 'text-hue-sky-foreground', border: 'border-hue-sky' },
  violet: { subtle: 'bg-hue-violet-subtle text-hue-violet-foreground', fill: 'bg-hue-violet', text: 'text-hue-violet-foreground', border: 'border-hue-violet' },
  mint: { subtle: 'bg-hue-mint-subtle text-hue-mint-foreground', fill: 'bg-hue-mint', text: 'text-hue-mint-foreground', border: 'border-hue-mint' },
  indigo: { subtle: 'bg-hue-indigo-subtle text-hue-indigo-foreground', fill: 'bg-hue-indigo', text: 'text-hue-indigo-foreground', border: 'border-hue-indigo' },
  orange: { subtle: 'bg-hue-orange-subtle text-hue-orange-foreground', fill: 'bg-hue-orange', text: 'text-hue-orange-foreground', border: 'border-hue-orange' },
  rose: { subtle: 'bg-hue-rose-subtle text-hue-rose-foreground', fill: 'bg-hue-rose', text: 'text-hue-rose-foreground', border: 'border-hue-rose' },
};

/** Raw CSS variables, for SVG artwork that needs fill="…". */
export const HUE_VARS: Record<Hue, { base: string; subtle: string; foreground: string }> = Object.fromEntries(
  HUES.map((hue) => [hue, { base: `var(--hue-${hue})`, subtle: `var(--hue-${hue}-subtle)`, foreground: `var(--hue-${hue}-foreground)` }]),
) as Record<Hue, { base: string; subtle: string; foreground: string }>;

/**
 * Appliance category → hue. Keys match `service_categories.code` (PLAN.md §7.5);
 * unknown categories get `rose`.
 */
export const CATEGORY_HUES: Record<string, Hue> = {
  AC: 'sky',
  TV: 'violet',
  FRIDGE: 'mint',
  WASHER: 'indigo',
  MICROWAVE: 'orange',
};

export function categoryHue(code: string | null | undefined): Hue {
  return (code && CATEGORY_HUES[code]) || 'rose';
}

/** Stable hue for a name, so a person keeps the same avatar colour everywhere. */
export function hueForName(name: string): Hue {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return HUES[Math.abs(hash) % HUES.length] ?? 'sky';
}
