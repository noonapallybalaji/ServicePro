import { Card, HUE_CLASSES, Skeleton, Text, cn, type Hue, type Tone, TONE_CLASSES } from '@servicepro/ui';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

interface KpiCardProps {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  /** Decorative colour of the icon chip and stripe while the number is fine. */
  hue?: Hue;
  /** Attention tone; overrides the hue when the number needs action. */
  tone?: Tone;
  /** Where clicking the number goes (the filtered list behind it). */
  to?: string;
  hint?: string;
}

/** One number the owner checks every morning (COMPONENT-ARCHITECTURE.md §3.6). */
export function KpiCard({ label, value, icon: Icon, hue = 'sky', tone = 'neutral', to, hint }: KpiCardProps) {
  const attention = tone !== 'neutral';
  const chip = attention ? TONE_CLASSES[tone].subtle : HUE_CLASSES[hue].subtle;
  const stripe = attention ? TONE_CLASSES[tone].fill : HUE_CLASSES[hue].fill;
  const body = (
    <>
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', stripe)} />
      <span className={cn('flex size-10 items-center justify-center rounded-control', chip)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex flex-col">
        {value === undefined ? <Skeleton className="h-8 w-12" /> : <Text variant="stat">{value}</Text>}
        <Text variant="sm" tone="secondary">
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </div>
    </>
  );

  return to ? (
    <Link to={to} className="pressable transition-interactive relative flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4 hover:border-border-strong hover:shadow-md">
      {body}
    </Link>
  ) : (
    <Card className="relative flex flex-col gap-3 overflow-hidden">{body}</Card>
  );
}
