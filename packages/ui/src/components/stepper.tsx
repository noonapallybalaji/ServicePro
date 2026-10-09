import { Check } from 'lucide-react';
import { Fragment } from 'react';

import { cn } from '../lib/cn';

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  /** Zero-based index of the current step. */
  current: number;
  /** Makes completed steps clickable (go back to edit). */
  onStepClick?: (index: number) => void;
  /** Accessible name for the list, e.g. "Booking progress". */
  label?: string;
  className?: string;
}

/**
 * Numbered progress for multi-step flows: done steps are green with a check, the current step is
 * brand-coloured, connectors turn green as you advance. Labels sit under the circles from `sm`;
 * on narrow phones only the current step's name is shown, under the row.
 */
export function Stepper({ steps, current, onStepClick, label = 'Progress', className }: StepperProps) {
  const currentStep = steps[current];
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ol aria-label={label} className="flex items-start">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const clickable = done && onStepClick;
          const circle = (
            <span
              className={cn(
                'transition-interactive flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                done && 'bg-success text-success-foreground',
                active && 'bg-primary text-primary-foreground shadow-md ring-4 ring-primary-subtle',
                !done && !active && 'border-2 border-border bg-surface text-foreground-muted',
              )}
            >
              {done ? <Check aria-hidden className="size-5" strokeWidth={3} /> : index + 1}
            </span>
          );
          const text = (
            <span
              className={cn(
                'text-caption font-semibold max-sm:sr-only sm:text-sm',
                done && 'text-foreground-muted',
                active && 'text-primary',
                !done && !active && 'text-foreground-muted',
              )}
            >
              {step.label}
              {done ? <span className="sr-only"> (completed)</span> : null}
            </span>
          );

          return (
            <Fragment key={step.id}>
              {index > 0 ? (
                <li
                  aria-hidden
                  className={cn('transition-interactive mx-1 mt-5 min-w-3 flex-1 border-t-2', index <= current ? 'border-success' : 'border-border')}
                />
              ) : null}
              <li aria-current={active ? 'step' : undefined} className="flex shrink-0 flex-col items-center gap-2 text-center sm:w-24">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(index)}
                    className="pressable flex flex-col items-center gap-2 rounded-control"
                    aria-label={`Back to ${step.label}`}
                  >
                    {circle}
                    {text}
                  </button>
                ) : (
                  <>
                    {circle}
                    {text}
                  </>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {currentStep ? (
        <p aria-hidden className="text-center text-sm font-semibold text-primary sm:hidden">
          Step {current + 1} of {steps.length} · {currentStep.label}
        </p>
      ) : null}
    </div>
  );
}
