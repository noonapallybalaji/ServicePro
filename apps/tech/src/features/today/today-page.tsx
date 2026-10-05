import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetMyTechnicianProfileQueryKey,
  useGetMyTechnicianProfile,
  useListMyJobs,
  useListMyOffers,
  useSession,
  useSetMyDutyStatus,
} from '@servicepro/api-client';
import {
  Button,
  Card,
  DutyStatusBadge,
  EmptyState,
  Heading,
  HeroBand,
  SpotArt,
  Stack,
  StatTile,
  Switch,
  TechnicianScene,
  Text,
  formatDay,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CalendarCheck, CircleCheck, Inbox, Wrench } from 'lucide-react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';
import { JobCard } from '../jobs/job-card';

function greeting(date: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(date));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** The technician's home (UX-ARCHITECTURE.md §3.2): duty, offers waiting, today's jobs. */
export function TodayPage() {
  const { session } = useSession();
  const jobs = useListMyJobs();
  const offers = useListMyOffers();
  const firstName = session?.user.fullName.split(' ')[0] ?? '';
  const offerCount = offers.data?.length ?? 0;

  return (
    <Stack gap={8}>
      <HeroBand art={<TechnicianScene />}>
        <div className="flex flex-col gap-1">
          <Text variant="sm" tone="muted">
            {formatDay(new Date())}
          </Text>
          <Heading level={1} size="h1">
            {greeting(new Date())}, {firstName}
          </Heading>
          <Text tone="secondary">Here's your day. Keep your status on duty to get new jobs.</Text>
        </div>
        <DutyCard />
        <div className="grid grid-cols-3 gap-3">
          <StatTile hue="sky" icon={Wrench} value={jobs.data?.active.length ?? '–'} label="Active" />
          <StatTile hue="mint" icon={CircleCheck} value={jobs.data?.completedToday.length ?? '–'} label="Done today" />
          <StatTile hue="orange" icon={Inbox} value={offers.data ? offerCount : '–'} label="Offers" />
        </div>
      </HeroBand>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <QueryState query={jobs} loading={<DefaultSkeleton rows={3} />} errorTitle="Couldn't load your jobs">
          {(data) => (
            <>
              <section aria-labelledby="active-jobs" className="flex min-w-0 flex-col gap-4 lg:col-span-2">
                <Heading level={2} size="h2" id="active-jobs">
                  Your jobs
                </Heading>
                {data.active.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={CalendarCheck}
                      illustration={<SpotArt kind="calendar" />}
                      title="No jobs yet today"
                      description="New offers appear automatically. Keep your status on duty to receive them."
                    />
                  </Card>
                ) : (
                  <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {data.active.map((job, index) => (
                      <li key={job.id}>
                        <JobCard job={job} emphasis={index === 0} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <aside className="flex min-w-0 flex-col gap-6">
                {offerCount > 0 ? (
                  <Card className="flex flex-col gap-4 border-accent-border bg-accent-subtle">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                        <BellRing aria-hidden className="size-5" />
                      </span>
                      <div className="flex flex-col gap-1" role="status">
                        <Text weight="semibold">{offerCount === 1 ? 'You have a new job offer' : `You have ${offerCount} job offers`}</Text>
                        <Text variant="sm" tone="secondary">
                          Offers expire after a few minutes if nobody accepts them.
                        </Text>
                      </div>
                    </div>
                    <Button asChild>
                      <Link to={paths.offers}>View offers</Link>
                    </Button>
                  </Card>
                ) : null}

                <section aria-labelledby="done-jobs" className="flex flex-col gap-4">
                  <Heading level={2} size="h3" id="done-jobs">
                    Done today · {data.completedToday.length}
                  </Heading>
                  {data.completedToday.length === 0 ? (
                    <Card variant="sunken">
                      <Text variant="sm" tone="secondary">
                        Finished jobs land here. Each one adds to your earnings.
                      </Text>
                    </Card>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {data.completedToday.map((job) => (
                        <li key={job.id}>
                          <JobCard job={job} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            </>
          )}
        </QueryState>
      </div>
    </Stack>
  );
}

/** On/off duty in one tap. "On a job" is set automatically and can't be toggled here. */
function DutyCard() {
  const queryClient = useQueryClient();
  const profile = useGetMyTechnicianProfile();
  const setDuty = useSetMyDutyStatus({
    mutation: {
      onSuccess: (updated) => queryClient.setQueryData(getGetMyTechnicianProfileQueryKey(), updated),
    },
  });

  const status = profile.data?.dutyStatus;
  const onDuty = status === 'AVAILABLE' || status === 'ON_JOB';

  return (
    <Card data-surface="light" className="flex items-center justify-between gap-4 border-0 shadow-md md:max-w-sheet">
      <div className="flex flex-col gap-2">
        <Text weight="semibold">Duty status</Text>
        {status ? <DutyStatusBadge status={status} size="sm" /> : <Text variant="sm" tone="muted">Loading…</Text>}
      </div>
      <Switch
        label={onDuty ? 'On duty' : 'Off duty'}
        checked={onDuty}
        disabled={!status || status === 'ON_JOB' || setDuty.isPending}
        onCheckedChange={(checked) => setDuty.mutate({ data: { status: checked ? 'AVAILABLE' : 'OFF_DUTY' } })}
      />
    </Card>
  );
}
