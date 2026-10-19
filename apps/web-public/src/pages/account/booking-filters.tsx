import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, cn } from '@servicepro/ui';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

/*
 * "Find a booking" controls drawn in the app's own style: chips instead of a browser dropdown, and an
 * app-styled calendar sheet instead of the browser's date picker. Dates are YYYY-MM-DD in India time.
 */

export type DateFilter = { kind: 'any' } | { kind: 'range'; from: string; to: string; label: string };

export const ANY_DATE: DateFilter = { kind: 'any' };

const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today in India, as YYYY-MM-DD. */
export const todayYmd = () => ymd.format(new Date());

/** Day arithmetic on YYYY-MM-DD strings (done in UTC, so no time-zone drift). */
function parts(day: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return [y, m, d];
}

function addDays(day: string, days: number): string {
  const [y, m, d] = parts(day);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function matchesDate(filter: DateFilter, day: string): boolean {
  return filter.kind === 'any' || (day >= filter.from && day <= filter.to);
}

/** A row of choices as chips; scrolls sideways on narrow screens. */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-foreground max-lg:text-caption">{label}</span>
      <div role="radiogroup" aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
        {children}
      </div>
    </div>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'pressable transition-interactive inline-flex h-8 shrink-0 items-center gap-1 rounded-pill border px-3 text-sm font-semibold whitespace-nowrap [&_svg]:size-4',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground-secondary hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}

/** Any time · Today · Last 7 days · Last 30 days · a picked day. */
export function DateChips({ value, onChange, bookedDays }: { value: DateFilter; onChange: (filter: DateFilter) => void; bookedDays: Set<string> }) {
  const [picking, setPicking] = useState(false);
  const today = todayYmd();
  const presets: DateFilter[] = [
    ANY_DATE,
    { kind: 'range', from: today, to: today, label: 'Today' },
    { kind: 'range', from: addDays(today, -6), to: today, label: 'Last 7 days' },
    { kind: 'range', from: addDays(today, -29), to: today, label: 'Last 30 days' },
  ];
  const isPreset = (f: DateFilter) => (f.kind === 'any' ? value.kind === 'any' : value.kind === 'range' && value.label === f.label);
  const picked = value.kind === 'range' && !presets.some((p) => p.kind === 'range' && p.label === value.label) ? value : null;

  return (
    <>
      <ChipRow label="Date">
        {presets.map((p) => (
          <Chip key={p.kind === 'any' ? 'any' : p.label} selected={isPreset(p)} onClick={() => onChange(p)}>
            {p.kind === 'any' ? 'Any time' : p.label}
          </Chip>
        ))}
        <Chip selected={picked !== null} onClick={() => setPicking(true)}>
          <CalendarDays aria-hidden /> {picked ? picked.label : 'Pick a date'}
        </Chip>
      </ChipRow>
      {picking ? (
        <CalendarSheet
          value={picked?.from ?? null}
          bookedDays={bookedDays}
          onClose={() => setPicking(false)}
          onPick={(day) => {
            onChange({ kind: 'range', from: day, to: day, label: dayLabel(day) });
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** A month calendar in a sheet. Days with a booking carry a dot. */
function CalendarSheet({ value, bookedDays, onClose, onPick }: { value: string | null; bookedDays: Set<string>; onClose: () => void; onPick: (day: string) => void }) {
  const today = todayYmd();
  const [month, setMonth] = useState(() => (value ?? today).slice(0, 7)); // YYYY-MM
  const [y, m] = parts(`${month}-01`);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [...Array<null>(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  const title = new Date(`${first}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (by: number) => setMonth(new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent presentation="sheet" aria-describedby={undefined} className="md:max-w-sm">
        <DialogHeader title="Pick a date" />
        <DialogBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="transition-interactive flex size-10 items-center justify-center rounded-full hover:bg-surface-sunken">
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <span className="font-semibold text-foreground" aria-live="polite">
              {title}
            </span>
            <button type="button" onClick={() => shift(1)} aria-label="Next month" className="transition-interactive flex size-10 items-center justify-center rounded-full hover:bg-surface-sunken">
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
          <div role="grid" aria-label={title} className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader" className="py-1 text-caption font-semibold text-foreground-muted">
                {d}
              </span>
            ))}
            {cells.map((day, i) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-selected={day === value}
                  aria-label={`${dayLabel(day)}${bookedDays.has(day) ? ', has a booking' : ''}`}
                  onClick={() => onPick(day)}
                  className={cn(
                    'transition-interactive relative flex aspect-square items-center justify-center rounded-full text-sm tabular-nums',
                    day === value
                      ? 'bg-primary font-bold text-primary-foreground'
                      : day === today
                        ? 'border border-primary font-semibold text-primary hover:bg-primary-subtle'
                        : 'text-foreground hover:bg-surface-sunken',
                  )}
                >
                  {Number(day.slice(8))}
                  {bookedDays.has(day) ? (
                    <span aria-hidden className={cn('absolute bottom-1 size-1 rounded-full', day === value ? 'bg-primary-foreground' : 'bg-accent')} />
                  ) : null}
                </button>
              ) : (
                <span key={`blank-${i}`} aria-hidden />
              ),
            )}
          </div>
          <p className="flex items-center gap-2 text-caption text-foreground-muted">
            <span aria-hidden className="size-2 rounded-full bg-accent" /> A booking on that day
          </p>
        </DialogBody>
        <DialogFooter className="max-md:flex-row max-md:*:flex-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="outline" onClick={() => onPick(today)}>
            Today
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
