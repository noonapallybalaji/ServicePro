import { useListLiveTechnicians, useListServiceRequests, type ServiceRequestCard, type TechnicianLiveResponse } from '@servicepro/api-client';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DutyStatusBadge,
  EmptyState,
  PageHeader,
  Skeleton,
  Stack,
  StatusBadge,
  TECHNICIAN_DUTY_STATUS,
  Text,
  cn,
  formatRelative,
} from '@servicepro/ui';
import { History, MapPinOff, Phone, Users } from 'lucide-react';
import { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';
import type { MapMarker } from '../../components/field-map';

/*
 * Where every technician is right now, and who is online (PLAN.md: dispatcher's live view). Positions
 * come from the technician app while they're on duty (every 2 minutes; every 30 s on the way to a
 * customer) and update here live. "Online" means the app reported in the last 5 minutes.
 */

const FieldMap = lazy(() => import('../../components/field-map'));

/** Jobs a technician is busy with (shown as their current job). */
const ACTIVE = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'DIAGNOSING', 'AWAITING_ESTIMATE_APPROVAL', 'IN_PROGRESS'];

type Filter = 'all' | 'online' | 'onJob' | 'available' | 'offline';

/** Positions older than this aren't shown on the map (still listed). */
const MAP_FOR_MS = 12 * 60 * 60 * 1000;

const MARKER_CLASS: Record<string, string> = {
  AVAILABLE: 'bg-tech-available',
  ON_JOB: 'bg-tech-on-job',
  ON_BREAK: 'bg-tech-break',
  OFF_DUTY: 'bg-tech-offline',
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export function LiveMapPage() {
  // Live updates refetch this through the ops channel; the interval keeps "online" honest if a push is missed.
  const live = useListLiveTechnicians({ query: { refetchInterval: 30_000 } });
  const jobs = useListServiceRequests({ status: ACTIVE, pageSize: 100 }, { query: { refetchInterval: 60_000 } });
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const jobByTechnician = useMemo(() => {
    const map = new Map<string, ServiceRequestCard>();
    for (const job of jobs.data?.items ?? []) if (job.technicianId) map.set(job.technicianId, job);
    return map;
  }, [jobs.data]);

  const technicians = live.data ?? [];
  const counts = {
    all: technicians.length,
    online: technicians.filter((t) => t.online).length,
    onJob: technicians.filter((t) => t.dutyStatus === 'ON_JOB').length,
    available: technicians.filter((t) => t.online && t.dutyStatus === 'AVAILABLE').length,
    offline: technicians.filter((t) => !t.online).length,
  };
  const shown = technicians.filter(
    (t) =>
      filter === 'all' ||
      (filter === 'online' && t.online) ||
      (filter === 'onJob' && t.dutyStatus === 'ON_JOB') ||
      (filter === 'available' && t.online && t.dutyStatus === 'AVAILABLE') ||
      (filter === 'offline' && !t.online),
  );
  // On the map: technicians on duty with a position from the last 12 hours. Off duty is never shown
  // (their location isn't the office's business), nor a position too old to be useful.
  const now = live.dataUpdatedAt; // when the list last refreshed (every 30 s and on each live update)
  const onMap = (t: TechnicianLiveResponse) => t.dutyStatus !== 'OFF_DUTY' && t.locationAt != null && now - Date.parse(t.locationAt) < MAP_FOR_MS;
  const markers: MapMarker[] = shown.flatMap((t) =>
    !onMap(t) || t.latitude == null || t.longitude == null
      ? []
      : [
          {
            id: t.id,
            latitude: t.latitude,
            longitude: t.longitude,
            text: initials(t.fullName),
            label: `${t.fullName} · ${TECHNICIAN_DUTY_STATUS[t.dutyStatus].label}${t.locationAt ? ` · ${formatRelative(t.locationAt)}` : ''}`,
            colorClass: t.online ? (MARKER_CLASS[t.dutyStatus] ?? 'bg-tech-offline') : 'bg-tech-offline',
            stale: !t.online,
          },
        ],
  );
  const noLocation = shown.length - markers.length;

  return (
    <Stack gap={6}>
      <PageHeader title="Live map" description="Where your technicians are right now. Locations are shared only while they're on duty." />

      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'All'],
            ['online', 'Online'],
            ['onJob', 'On a job'],
            ['available', 'Available'],
            ['offline', 'Offline'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              'transition-interactive inline-flex h-8 items-center gap-2 rounded-pill border px-3 text-sm font-semibold',
              filter === value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-foreground-secondary hover:border-border-strong',
            )}
          >
            {label}
            <span className="tabular-nums opacity-80">{counts[value]}</span>
          </button>
        ))}
      </div>

      {live.isPending ? (
        <Skeleton className="h-[32rem] w-full rounded-card" />
      ) : technicians.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No technicians yet" description="Add your team to see them here." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
            <Suspense fallback={<Skeleton className="h-[32rem] w-full rounded-card" />}>
              <FieldMap
                markers={markers}
                selectedId={selected}
                onSelect={setSelected}
                frameKey={filter}
                label="Map of technician locations"
                className="h-[28rem] w-full lg:h-[36rem]"
              />
            </Suspense>
            {noLocation > 0 ? (
              <Text variant="caption" tone="muted" className="flex items-center gap-1">
                <MapPinOff aria-hidden className="size-3" /> {noLocation} not on the map: off duty, or no location in the last 12 hours.
              </Text>
            ) : null}
          </div>

          <ul className="flex max-h-[36rem] flex-col gap-2 overflow-y-auto" aria-label="Technicians">
            {shown.map((t) => (
              <TechnicianRow key={t.id} technician={t} job={jobByTechnician.get(t.id)} selected={selected === t.id} onSelect={() => setSelected(t.id)} />
            ))}
          </ul>
        </div>
      )}
    </Stack>
  );
}

function TechnicianRow({
  technician: t,
  job,
  selected,
  onSelect,
}: {
  technician: TechnicianLiveResponse;
  job: ServiceRequestCard | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <Card padding="sm" className={cn('flex flex-col gap-2', selected && 'border-primary ring-2 ring-primary-subtle')}>
        <button type="button" onClick={onSelect} className="flex items-center gap-3 text-left" aria-pressed={selected}>
          <Avatar name={t.fullName} size="md" statusClass={t.online ? TECHNICIAN_DUTY_STATUS[t.dutyStatus].dotClass : 'bg-tech-offline'} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold text-foreground">{t.fullName}</span>
            <span className="text-caption text-foreground-secondary">
              {t.online ? <span className="font-semibold text-success">Online</span> : <span className="font-semibold text-foreground-muted">Offline</span>}
              {t.lastSeenAt ? ` · seen ${formatRelative(t.lastSeenAt)}` : ' · never connected'}
            </span>
          </span>
          <DutyStatusBadge status={t.dutyStatus} size="sm" />
        </button>
        {job ? (
          <Link to={paths.request(job.id)} className="flex items-center gap-2 rounded-control bg-surface-sunken px-2 py-1 text-caption hover:bg-primary-subtle">
            <span className="font-semibold tabular-nums text-foreground">{job.srNumber}</span>
            <StatusBadge status={job.status} size="sm" />
            <span className="truncate text-foreground-secondary">{job.locality}</span>
          </Link>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="caption" tone="muted" className="flex-1">
            {t.dutyStatus === 'OFF_DUTY' ? 'Location not shared (off duty)' : t.locationAt ? `Location ${formatRelative(t.locationAt)}` : 'No location yet'}
          </Text>
          <Button asChild size="sm" variant="ghost">
            <a href={`tel:${t.phone}`} aria-label={`Call ${t.fullName}`}>
              <Phone aria-hidden />
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`${paths.technician(t.id)}?tab=activity`}>
              <History aria-hidden /> Activity
            </Link>
          </Button>
        </div>
        {!t.online && t.dutyStatus !== 'OFF_DUTY' ? (
          <Badge tone="warning" size="sm" className="self-start">
            On duty but not reporting
          </Badge>
        ) : null}
      </Card>
    </li>
  );
}
