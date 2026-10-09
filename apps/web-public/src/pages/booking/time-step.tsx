import { RadioCard, RadioGroup, Text, cn, useNow } from '@servicepro/ui';
import type { FormEvent, ReactNode } from 'react';

import type { Draft } from './draft';
import { BOOKABLE_DAYS, SLOTS, bookableDays, isSlotAvailable, type SlotId } from './slots';

interface TimeStepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
  actions: (ready: boolean) => ReactNode;
}

/** Preferred day and time window; the office confirms the exact time on WhatsApp. */
export function TimeStep({ draft, update, onNext, actions }: TimeStepProps) {
  const now = useNow(60_000);
  const days = bookableDays(now);
  const ready = Boolean(draft.date && draft.slot && isSlotAvailable(draft.date, draft.slot, now));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) onNext();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-foreground">Choose a day</legend>
        <div role="radiogroup" aria-label="Day" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((day) => {
            const anySlot = SLOTS.some((s) => isSlotAvailable(day.date, s.id, now));
            const selected = draft.date === day.date;
            return (
              <button
                key={day.date}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!anySlot}
                onClick={() => update({ date: day.date, slot: draft.slot && isSlotAvailable(day.date, draft.slot, now) ? draft.slot : '' })}
                className={cn(
                  'pressable transition-interactive flex w-20 shrink-0 flex-col items-center gap-1 rounded-card border px-2 py-3 disabled:cursor-not-allowed disabled:opacity-40',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground hover:border-border-strong',
                )}
              >
                <span className="text-caption">{day.weekday}</span>
                <span className="text-stat-sm tabular-nums">{day.dayOfMonth}</span>
                <span className="text-caption">{day.month}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-foreground">Choose a time</legend>
        <RadioGroup value={draft.slot} onValueChange={(slot) => update({ slot: slot as SlotId })} aria-label="Time of day" className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SLOTS.map((slot) => (
            <RadioCard
              key={slot.id}
              value={slot.id}
              title={slot.label}
              description={slot.range}
              disabled={!draft.date || !isSlotAvailable(draft.date, slot.id, now)}
            />
          ))}
        </RadioGroup>
        {!draft.date ? (
          <Text variant="caption" tone="muted">
            Pick a day first.
          </Text>
        ) : null}
      </fieldset>

      <Text variant="caption" tone="muted">
        We'll confirm the exact time on WhatsApp. Bookings are open for the next {BOOKABLE_DAYS} days.
      </Text>

      {actions(ready)}
    </form>
  );
}
