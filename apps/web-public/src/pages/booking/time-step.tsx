import type { AvailabilityResponse } from '@servicepro/api-client';
import { Alert, RadioCard, RadioGroup, Skeleton, Text, cn, useNow } from '@servicepro/ui';
import type { FormEvent, ReactNode } from 'react';

import type { Draft } from './draft';
import { dayHasRoom, dayLabel, slotRange } from './slots';

interface TimeStepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
  actions: (ready: boolean) => ReactNode;
  /** Windows with room for this appliance and address, from the server. */
  availability: AvailabilityResponse | undefined;
  loading: boolean;
  failed: boolean;
}

/** Preferred day and time window, from the windows we can actually serve; the office confirms the exact time. */
export function TimeStep({ draft, update, onNext, actions, availability, loading, failed }: TimeStepProps) {
  const now = useNow(60_000);
  const days = availability?.days ?? [];
  const day = days.find((d) => d.date === draft.date);
  const chosen = day?.slots.find((s) => s.id === draft.slot && s.available);
  const ready = Boolean(chosen);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) onNext();
  }

  if (loading) return <Skeleton className="h-64 w-full rounded-card" />;
  if (failed || !availability) {
    return <Alert tone="error" title="We couldn't load the visit times" description="Check your connection and try again, or call us to book." />;
  }

  const anyRoom = days.some(dayHasRoom);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {!anyRoom ? (
        <Alert tone="warning" title="We're fully booked for the coming days" description="Please call or WhatsApp us and we'll find a time for you." />
      ) : null}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-foreground">Choose a day</legend>
        <div role="radiogroup" aria-label="Day" className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const label = dayLabel(d.date, now);
            const selected = draft.date === d.date;
            const keepSlot = d.slots.some((s) => s.id === draft.slot && s.available);
            return (
              <button
                key={d.date}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${label.weekday} ${label.dayOfMonth} ${label.month}${dayHasRoom(d) ? '' : ', fully booked'}`}
                disabled={!dayHasRoom(d)}
                onClick={() => update(keepSlot ? { date: d.date } : { date: d.date, slot: '', slotStart: '', slotEnd: '' })}
                className={cn(
                  'pressable transition-interactive flex w-20 shrink-0 flex-col items-center gap-1 rounded-card border px-2 py-3 disabled:cursor-not-allowed disabled:opacity-40',
                  selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground hover:border-border-strong',
                )}
              >
                <span className="text-caption">{label.weekday}</span>
                <span className="text-stat-sm tabular-nums">{label.dayOfMonth}</span>
                <span className="text-caption">{label.month}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-semibold text-foreground">Choose a time</legend>
        {day ? (
          <RadioGroup
            value={draft.slot}
            onValueChange={(id) => {
              const slot = day.slots.find((s) => s.id === id);
              if (slot) update({ slot: slot.id, slotStart: slot.start, slotEnd: slot.end });
            }}
            aria-label="Time of day"
            className="grid grid-cols-1 gap-3 md:grid-cols-3"
          >
            {day.slots.map((slot) => (
              <RadioCard key={slot.id} value={slot.id} title={slot.label} description={slot.available ? slotRange(slot) : 'Fully booked'} disabled={!slot.available} />
            ))}
          </RadioGroup>
        ) : (
          <Text variant="caption" tone="muted">
            Pick a day first.
          </Text>
        )}
      </fieldset>

      <Text variant="caption" tone="muted">
        Only times we have a technician for are shown. We'll confirm the exact time on WhatsApp.
      </Text>

      {actions(ready)}
    </form>
  );
}
