import { CircleCheck, PhoneMissed, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '../components/badge';
import { cn } from '../lib/cn';
import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  getConfidenceBand,
  type ConfidenceBand,
} from '../tokens/status';
import type { Tone } from '../tokens/tones';

/*
 * AI UX rules (UX-ARCHITECTURE.md §6):
 *  - Customers meet the BUSINESS, not "an AI". Customer-facing AI states use brand colour
 *    and plain verbs ("Calling you", "Understanding your request"). No sparkles, no robots.
 *  - Staff see AI provenance explicitly (violet "AI" accent) so they know what to double-check.
 *  - Confidence scores are staff-only.
 */

/* ── Customer-facing: intake call progress ───────────────────────────────── */

export type IntakeCallState = 'calling' | 'understanding' | 'confirmed' | 'missed';

interface IntakeCallStatusProps {
  state: IntakeCallState;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function IntakeCallStatus({ state, title, description, action, className }: IntakeCallStatusProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center gap-4 py-8 text-center', className)}
    >
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-full',
          state === 'missed' ? 'bg-warning-subtle text-warning-subtle-foreground' : 'bg-primary-subtle text-primary',
          state === 'confirmed' && 'animate-pop-in',
        )}
      >
        {state === 'calling' ? <VoiceWave /> : null}
        {state === 'understanding' ? <ProcessingDots /> : null}
        {state === 'confirmed' ? <CircleCheck aria-hidden className="size-8" /> : null}
        {state === 'missed' ? <PhoneMissed aria-hidden className="size-7" /> : null}
      </span>
      <div className="flex max-w-prose flex-col gap-1">
        <p className="text-h3 text-foreground">{title}</p>
        {description ? <div className="text-body text-foreground-secondary">{description}</div> : null}
      </div>
      {action ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">{action}</div> : null}
    </div>
  );
}

/** Speech-like bars. Communicates "a voice call is happening", not "a computer is thinking". */
export function VoiceWave({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('voice-wave', className)}>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

function ProcessingDots() {
  return (
    <span aria-hidden className="processing-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

/* ── Staff-facing: provenance + summary ───────────────────────────────────── */

export function AiBadge({ label = 'AI', className }: { label?: string; className?: string }) {
  return (
    <Badge tone="ai" size="sm" className={className}>
      <Sparkles aria-hidden />
      {label}
    </Badge>
  );
}

interface AiSummaryProps {
  title?: string;
  children: ReactNode;
  /** e.g. "From a 2 min 14 s call · Telugu" */
  meta?: ReactNode;
  className?: string;
}

/** AI-written text is always labelled as such and visually set apart from human notes. */
export function AiSummary({ title = 'Call summary', children, meta, className }: AiSummaryProps) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-card border border-ai-border bg-ai-subtle p-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <AiBadge />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="text-body text-foreground">{children}</div>
      {meta ? <p className="text-caption text-foreground-muted">{meta}</p> : null}
    </div>
  );
}

/* ── Staff-facing: confidence ─────────────────────────────────────────────── */

const BAND_PRESENTATION: Record<ConfidenceBand, { tone: Tone; label: string; bar: string }> = {
  auto: { tone: 'success', label: 'Auto-approve', bar: 'bg-success' },
  review: { tone: 'warning', label: 'Needs review', bar: 'bg-warning' },
  reject: { tone: 'error', label: 'Likely reject', bar: 'bg-error' },
};

export interface ConfidenceCheck {
  label: string;
  points: number;
  max: number;
}

interface ConfidenceMeterProps {
  score: number;
  thresholds?: { autoApprove: number; review: number };
  /** Breakdown from `ai_analyses.score_breakdown` — shows WHY, which is what builds trust. */
  checks?: ConfidenceCheck[];
  /** Blocking flags force review regardless of score (PLAN.md §9.3). */
  flags?: string[];
  className?: string;
}

export function ConfidenceMeter({
  score,
  thresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
  checks,
  flags,
  className,
}: ConfidenceMeterProps) {
  const band = flags && flags.length > 0 ? 'review' : getConfidenceBand(score, thresholds);
  const presentation = BAND_PRESENTATION[band];
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  // Data-driven geometry (score and configurable thresholds) cannot be expressed as static
  // utility classes, so these widths/positions are the one sanctioned use of inline style.
  const fillWidth = { width: `${clamped}%` };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-stat-sm text-foreground tabular-nums">{clamped}</span>
          <span className="text-sm text-foreground-muted">/ 100</span>
        </div>
        <Badge tone={presentation.tone} size="sm">
          {presentation.label}
        </Badge>
      </div>

      <div
        role="meter"
        aria-label="AI confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped} out of 100, ${presentation.label}`}
        className="relative h-2 overflow-hidden rounded-pill bg-surface-sunken"
      >
        {/* eslint-disable-next-line no-restricted-syntax -- data-driven width */}
        <span className={cn('absolute inset-y-0 left-0 rounded-pill', presentation.bar)} style={fillWidth} />
        {[thresholds.review, thresholds.autoApprove].map((threshold) => (
          <span
            key={threshold}
            aria-hidden
            className="absolute inset-y-0 w-px bg-surface"
            // eslint-disable-next-line no-restricted-syntax -- data-driven threshold marker
            style={{ left: `${threshold}%` }}
          />
        ))}
      </div>

      {flags && flags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => (
            <Badge key={flag} tone="warning" appearance="outline" size="sm">
              {flag}
            </Badge>
          ))}
        </div>
      ) : null}

      {checks && checks.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center justify-between gap-3 text-sm">
              <span className={check.points > 0 ? 'text-foreground' : 'text-foreground-muted line-through'}>
                {check.label}
              </span>
              <span className="text-foreground-secondary tabular-nums">
                {check.points}/{check.max}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
