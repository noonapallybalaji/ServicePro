import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { HUE_CLASSES, type Hue } from '../tokens/hues';

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  /** Decorative colour. Use a Tone-coloured component instead when the number is a warning. */
  hue?: Hue;
  hint?: ReactNode;
  className?: string;
}

/** A number on a tinted tile — quick stats on home views. */
export function StatTile({ label, value, icon: IconComponent, hue = 'sky', hint, className }: StatTileProps) {
  return (
    <div className={cn('flex flex-col items-start gap-2 rounded-card p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4', HUE_CLASSES[hue].subtle, className)}>
      {IconComponent ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface">
          <IconComponent aria-hidden className="size-5" />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <span className="text-stat-sm tabular-nums">{value}</span>
        <span className="truncate text-sm font-semibold">{label}</span>
        {hint ? <span className="text-caption">{hint}</span> : null}
      </div>
    </div>
  );
}
