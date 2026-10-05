/**
 * Tones are the semantic colour families every status-bearing component shares.
 * Class strings are written out literally so Tailwind can detect them.
 */
export const TONES = ['neutral', 'primary', 'info', 'success', 'warning', 'error', 'ai'] as const;
export type Tone = (typeof TONES)[number];

interface ToneClasses {
  subtle: string;
  solid: string;
  outline: string;
  /** Foreground for an icon or text that carries the tone on a neutral surface. */
  text: string;
  /** Solid fill for dots / markers. */
  fill: string;
}

export const TONE_CLASSES: Record<Tone, ToneClasses> = {
  neutral: {
    subtle: 'bg-neutral-subtle text-neutral-subtle-foreground',
    solid: 'bg-neutral text-neutral-foreground',
    outline: 'border border-neutral-border text-neutral-subtle-foreground',
    text: 'text-foreground-secondary',
    fill: 'bg-foreground-muted',
  },
  primary: {
    subtle: 'bg-primary-subtle text-primary-subtle-foreground',
    solid: 'bg-primary text-primary-foreground',
    outline: 'border border-primary-border text-primary-subtle-foreground',
    text: 'text-primary',
    fill: 'bg-primary',
  },
  info: {
    subtle: 'bg-info-subtle text-info-subtle-foreground',
    solid: 'bg-info text-info-foreground',
    outline: 'border border-info-border text-info-subtle-foreground',
    text: 'text-info',
    fill: 'bg-info',
  },
  success: {
    subtle: 'bg-success-subtle text-success-subtle-foreground',
    solid: 'bg-success text-success-foreground',
    outline: 'border border-success-border text-success-subtle-foreground',
    text: 'text-success',
    fill: 'bg-success',
  },
  warning: {
    subtle: 'bg-warning-subtle text-warning-subtle-foreground',
    solid: 'bg-warning text-warning-foreground',
    outline: 'border border-warning-border text-warning-subtle-foreground',
    text: 'text-warning-subtle-foreground',
    fill: 'bg-warning',
  },
  error: {
    subtle: 'bg-error-subtle text-error-subtle-foreground',
    solid: 'bg-error text-error-foreground',
    outline: 'border border-error-border text-error-subtle-foreground',
    text: 'text-error',
    fill: 'bg-error',
  },
  ai: {
    subtle: 'bg-ai-subtle text-ai-subtle-foreground',
    solid: 'bg-ai text-ai-foreground',
    outline: 'border border-ai-border text-ai-subtle-foreground',
    text: 'text-ai',
    fill: 'bg-ai',
  },
};

/** Border + subtle background pairs for containers such as Alert. */
export const TONE_SURFACE_CLASSES: Record<Tone, string> = {
  neutral: 'border-neutral-border bg-neutral-subtle',
  primary: 'border-primary-border bg-primary-subtle',
  info: 'border-info-border bg-info-subtle',
  success: 'border-success-border bg-success-subtle',
  warning: 'border-warning-border bg-warning-subtle',
  error: 'border-error-border bg-error-subtle',
  ai: 'border-ai-border bg-ai-subtle',
};
