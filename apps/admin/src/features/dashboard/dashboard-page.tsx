import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useGetDashboardSummary, useGetLiveBoard, useListTechnicians, type ServiceRequestCard, type ServiceRequestStatus } from '@servicepro/api-client';
import {
  Avatar,
  Button,
  Card,
  DutyStatusBadge,
  EmptyState,
  Heading,
  PageHeader,
  Stack,
  TECHNICIAN_DUTY_STATUS,
  Text,
  formatDay,
} from '@servicepro/ui';
import { CircleCheck, Hourglass, IndianRupee, Inbox, PauseCircle, Plus, Send, TriangleAlert, Truck, UserCheck } from 'lucide-react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';
import { KpiCard } from '../../components/kpi-card';
import { RequestCardLink } from '../../components/request-list';

/** Board columns: statuses grouped the way the owner thinks about the day. */
const COLUMNS: { title: string; statuses: ServiceRequestStatus[] }[] = [
  { title: 'To assign', statuses: ['NEW', 'READY_FOR_ASSIGNMENT'] },
  { title: 'Offered', statuses: ['OFFERED'] },
  { title: 'Assigned', statuses: ['ACCEPTED'] },
  { title: 'In progress', statuses: ['EN_ROUTE', 'ARRIVED', 'DIAGNOSING', 'AWAITING_ESTIMATE_APPROVAL', 'IN_PROGRESS'] },
  { title: 'On hold', statuses: ['WAITING_FOR_PARTS', 'RESCHEDULED', 'CUSTOMER_UNAVAILABLE', 'UNABLE_TO_REPAIR'] },
  { title: 'Done today', statuses: ['COMPLETED', 'CLOSED', 'CLOSED_NO_REPAIR', 'CANCELLED'] },
];

/** "What's happening right now?" (UX-ARCHITECTURE.md §3.3, RESPONSIVE-STRATEGY.md §5.2). */
export function DashboardPage() {
  const summary = useGetDashboardSummary();
  const board = useGetLiveBoard();
  const s = summary.data;

  return (
    <Stack gap={8}>
      <PageHeader
        title="Today"
        description={formatDay(new Date())}
        actions={
          <Button asChild>
            <Link to={paths.newRequest()}>
              <Plus aria-hidden /> New request
            </Link>
          </Button>
        }
      />

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        <KpiCard label="New today" value={s?.createdToday} icon={Inbox} to={paths.requests} />
        <KpiCard label="To assign" value={s?.awaitingAssignment} icon={Send} tone={s && s.awaitingAssignment > 0 ? 'info' : 'neutral'} to={paths.dispatch} />
        <KpiCard label="Offered" value={s?.offered} icon={Hourglass} to={`${paths.requests}?view=offered`} />
        <KpiCard label="Assigned" value={s?.assigned} icon={UserCheck} to={`${paths.requests}?view=assigned`} />
        <KpiCard label="In progress" value={s?.inProgress} icon={Truck} tone="primary" to={`${paths.requests}?view=progress`} />
        <KpiCard label="On hold" value={s?.onHold} icon={PauseCircle} tone={s && s.onHold > 0 ? 'warning' : 'neutral'} to={`${paths.requests}?view=hold`} />
        <KpiCard label="Completed" value={s?.completedToday} icon={CircleCheck} tone="success" />
        <KpiCard label="Stuck" value={s?.stuck} icon={TriangleAlert} tone={s && s.stuck > 0 ? 'warning' : 'neutral'} to={`${paths.requests}?view=stuck`} />
        <KpiCard label="Unpaid" value={s?.unpaidCompleted} icon={IndianRupee} tone={s && s.unpaidCompleted > 0 ? 'warning' : 'neutral'} to={paths.billing} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section aria-labelledby="board" className="flex flex-col gap-4 lg:col-span-2">
          <Heading level={2} id="board">
            Live board
          </Heading>
          <QueryState query={board} loading={<DefaultSkeleton rows={4} />} errorTitle="Couldn't load the board">
            {(data) =>
              data.cards.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Inbox}
                    title="No jobs today yet"
                    description="New requests appear here the moment they're created."
                    action={
                      <Button asChild variant="outline">
                        <Link to={paths.newRequest()}>Create a request</Link>
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {COLUMNS.map((column) => {
                    const cards = data.cards.filter((c) => column.statuses.includes(c.status));
                    return <BoardColumn key={column.title} title={column.title} cards={cards} />;
                  })}
                </div>
              )
            }
          </QueryState>
        </section>

        <aside className="flex flex-col gap-8">
          <NeedsAttention cards={board.data?.cards ?? []} />
          <TeamStatus />
        </aside>
      </div>
    </Stack>
  );
}

function BoardColumn({ title, cards }: { title: string; cards: ServiceRequestCard[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface-sunken p-3">
      <div className="flex items-center justify-between px-1">
        <Text weight="semibold">{title}</Text>
        <Text variant="sm" tone="muted" className="tabular-nums">
          {cards.length}
        </Text>
      </div>
      {cards.length === 0 ? (
        <Text variant="sm" tone="muted" className="px-1 pb-2">
          Nothing here
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <RequestCardLink request={card} compact />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ordered by urgency: stuck first, then unassigned, then unpaid (USER-FLOWS.md §3.2 step 1). */
function NeedsAttention({ cards }: { cards: ServiceRequestCard[] }) {
  const items = [
    ...cards.filter((c) => c.isStuck),
    ...cards.filter((c) => !c.isStuck && (c.status === 'READY_FOR_ASSIGNMENT' || c.status === 'NEW')),
    ...cards.filter((c) => c.status === 'COMPLETED' && (c.paymentStatus === 'PENDING' || c.paymentStatus === 'PARTIAL')),
  ];

  return (
    <section aria-labelledby="attention" className="flex flex-col gap-3">
      <Heading level={2} size="h3" id="attention">
        Needs attention
      </Heading>
      {items.length === 0 ? (
        <Card>
          <EmptyState size="compact" icon={CircleCheck} title="All clear" description="Nothing is stuck, unassigned or unpaid." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.slice(0, 8).map((card) => (
            <li key={card.id}>
              <RequestCardLink request={card} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamStatus() {
  const technicians = useListTechnicians();
  return (
    <section aria-labelledby="team" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Heading level={2} size="h3" id="team">
          Team
        </Heading>
        <Link to={paths.technicians} className="link text-sm">
          All technicians
        </Link>
      </div>
      <QueryState query={technicians} loading={<DefaultSkeleton rows={2} />}>
        {(list) => (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {list.map((technician) => (
                <li key={technician.id}>
                  <Link to={paths.technician(technician.id)} className="transition-interactive flex items-center gap-3 px-4 py-3 hover:bg-surface-sunken">
                    <Avatar name={technician.fullName} size="sm" statusClass={TECHNICIAN_DUTY_STATUS[technician.dutyStatus].dotClass} />
                    <span className="flex-1 truncate text-sm font-semibold text-foreground">{technician.fullName}</span>
                    <DutyStatusBadge status={technician.dutyStatus} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </QueryState>
    </section>
  );
}
