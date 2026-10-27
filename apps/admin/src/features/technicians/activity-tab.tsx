import { useGetTechnicianActivity, type TechnicianActivityEntry, type TechnicianTrailPoint } from '@servicepro/api-client';
import { Button, Card, EmptyState, Heading, Skeleton, Text, formatTime } from '@servicepro/ui';
import { ChevronLeft, ChevronRight, Clock, History, MapPin, Power, PowerOff, Route, Smartphone, WifiOff } from 'lucide-react';
import { Suspense, lazy, useState, type ReactNode } from 'react';

const FieldMap = lazy(() => import('../../components/field-map'));

/** YYYY-MM-DD in India time. */
const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const todayYmd = () => ymd.format(new Date());

function shiftDay(day: string, by: number): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + by)).toISOString().slice(0, 10);
}

const dayTitle = (day: string) =>
  day === todayYmd()
    ? 'Today'
    : day === shiftDay(todayYmd(), -1)
      ? 'Yesterday'
      : new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });

const DUTY_TEXT: Record<string, string> = {
  AVAILABLE: 'On duty (available)',
  ON_JOB: 'On a job',
  ON_BREAK: 'On a break',
  OFF_DUTY: 'Went off duty',
};

/** Straight-line km along the route (an underestimate of road distance). */
function distanceKm(trail: TechnicianTrailPoint[]): number {
  let km = 0;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    if (!a || !b) continue;
    const rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad;
    const dLng = (b.longitude - a.longitude) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
    km += 2 * 6371 * Math.asin(Math.sqrt(h));
  }
  return km;
}

const hoursText = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

/**
 * One day of a technician's activity: hours on duty, when they were first and last seen, the duty and
 * app-connection timeline, and the route they reported (kept 30 days).
 */
export function ActivityTab({ technicianId }: { technicianId: string }) {
  const [day, setDay] = useState(todayYmd);
  const activity = useGetTechnicianActivity(technicianId, { date: day }, { query: { refetchInterval: day === todayYmd() ? 60_000 : false } });
  const isToday = day === todayYmd();
  const lastPoint = activity.data?.trail.at(-1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => setDay((d) => shiftDay(d, -1))} aria-label="Previous day">
          <ChevronLeft aria-hidden /> Earlier
        </Button>
        <Heading level={2} size="h3" aria-live="polite">
          {dayTitle(day)}
        </Heading>
        <Button variant="ghost" size="sm" onClick={() => setDay((d) => shiftDay(d, 1))} disabled={isToday} aria-label="Next day">
          Later <ChevronRight aria-hidden />
        </Button>
      </div>

      {activity.isPending ? (
        <Skeleton className="h-[24rem] w-full rounded-card" />
      ) : activity.isError || !activity.data ? (
        <Card>
          <EmptyState size="compact" icon={History} title="Couldn't load this day" description="Check your connection and try again." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={<Clock aria-hidden />} label="On duty" value={hoursText(activity.data.onDutyMinutes)} />
            <Stat icon={<Smartphone aria-hidden />} label="First seen" value={activity.data.firstSeenAt ? formatTime(activity.data.firstSeenAt) : '—'} />
            <Stat icon={<Smartphone aria-hidden />} label="Last seen" value={activity.data.lastSeenAt ? formatTime(activity.data.lastSeenAt) : '—'} />
            <Stat
              icon={<Route aria-hidden />}
              label="Distance (approx.)"
              value={activity.data.trail.length > 1 ? `${distanceKm(activity.data.trail).toFixed(1)} km` : '—'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="flex flex-col gap-3 lg:col-span-2">
              <Heading level={3} size="h3">
                Route
              </Heading>
              {!lastPoint ? (
                <EmptyState
                  size="compact"
                  icon={MapPin}
                  title="No locations this day"
                  description="Locations are shared only while the technician is on duty with the app open."
                />
              ) : (
                <Suspense fallback={<Skeleton className="h-[22rem] w-full rounded-card" />}>
                  <FieldMap
                    markers={[
                      {
                        id: 'last',
                        latitude: lastPoint.latitude,
                        longitude: lastPoint.longitude,
                        text: '●',
                        label: `Last position · ${formatTime(lastPoint.at)}`,
                        colorClass: 'bg-primary',
                      },
                    ]}
                    trail={activity.data.trail.map((p) => [p.latitude, p.longitude] as [number, number])}
                    frameKey={day}
                    label={`Route on ${dayTitle(day)}`}
                    className="h-[22rem] w-full"
                  />
                </Suspense>
              )}
              <Text variant="caption" tone="muted">
                {activity.data.trail.length} positions. Phones pause the app in the background, so gaps are normal.
              </Text>
            </Card>

            <Card className="flex flex-col gap-3">
              <Heading level={3} size="h3">
                Timeline
              </Heading>
              <Text variant="caption" tone="muted">
                Started the day{' '}
                {DUTY_TEXT[activity.data.statusAtStart]?.toLowerCase() === 'went off duty'
                  ? 'off duty'
                  : (DUTY_TEXT[activity.data.statusAtStart] ?? '').toLowerCase()}
                .
              </Text>
              {activity.data.events.length === 0 ? (
                <Text variant="sm" tone="secondary">
                  No activity this day.
                </Text>
              ) : (
                <ol className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto">
                  {activity.data.events.map((e, i) => (
                    <TimelineRow key={`${e.at}-${i}`} entry={e} />
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card padding="sm" className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-caption text-foreground-secondary [&_svg]:size-3">
        {icon} {label}
      </span>
      <span className="text-h3 font-semibold text-foreground tabular-nums">{value}</span>
    </Card>
  );
}

function TimelineRow({ entry }: { entry: TechnicianActivityEntry }) {
  const [icon, text] =
    entry.kind === 'DUTY_CHANGED'
      ? [entry.dutyStatus === 'OFF_DUTY' ? <PowerOff aria-hidden /> : <Power aria-hidden />, DUTY_TEXT[entry.dutyStatus ?? ''] ?? 'Duty changed']
      : entry.kind === 'APP_CONNECTED'
        ? [<Smartphone aria-hidden key="on" />, 'App online']
        : [<WifiOff aria-hidden key="off" />, 'App offline (closed or no signal)'];
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-16 shrink-0 tabular-nums text-foreground-secondary">{formatTime(entry.at)}</span>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-foreground-secondary [&_svg]:size-4">{icon}</span>
      <span className="text-foreground">{text}</span>
    </li>
  );
}
