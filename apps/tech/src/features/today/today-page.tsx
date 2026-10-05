import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetMyTechnicianProfileQueryKey,
  useGetMyTechnicianProfile,
  useListMyJobs,
  useListMyOffers,
  useSession,
  useSetMyDutyStatus,
} from '@servicepro/api-client';
import { Alert, Button, Card, DutyStatusBadge, EmptyState, Heading, Stack, Switch, Text, formatDay } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
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

  return (
    <Stack gap={6}>
      <div className="flex flex-col gap-1">
        <Text variant="sm" tone="muted">
          {formatDay(new Date())}
        </Text>
        <Heading level={1} size="h2">
          {greeting(new Date())}, {firstName}
        </Heading>
      </div>

      <DutyCard />

      {offers.data && offers.data.length > 0 ? (
        <Alert
          tone="info"
          role="status"
          title={offers.data.length === 1 ? 'You have a new job offer' : `You have ${offers.data.length} job offers`}
          description="Offers expire after a few minutes if nobody accepts them."
          action={
            <Button asChild size="sm">
              <Link to={paths.offers}>View offers</Link>
            </Button>
          }
        />
      ) : null}

      <QueryState query={jobs} loading={<DefaultSkeleton rows={3} />} errorTitle="Couldn't load your jobs">
        {(data) => (
          <Stack gap={6}>
            <section aria-labelledby="active-jobs" className="flex flex-col gap-3">
              <Heading level={2} size="h3" id="active-jobs">
                Your jobs
              </Heading>
              {data.active.length === 0 ? (
                <Card>
                  <EmptyState
                    size="compact"
                    icon={CalendarCheck}
                    title="No jobs yet today"
                    description="New offers appear automatically. Keep your status on duty to receive them."
                  />
                </Card>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.active.map((job, index) => (
                    <li key={job.id}>
                      <JobCard job={job} emphasis={index === 0} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.completedToday.length > 0 ? (
              <section aria-labelledby="done-jobs" className="flex flex-col gap-3">
                <Heading level={2} size="h3" id="done-jobs">
                  Done today · {data.completedToday.length}
                </Heading>
                <ul className="flex flex-col gap-3">
                  {data.completedToday.map((job) => (
                    <li key={job.id}>
                      <JobCard job={job} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Stack>
        )}
      </QueryState>
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
    <Card className="flex items-center justify-between gap-4">
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
