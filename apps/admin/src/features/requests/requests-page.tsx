import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useListServiceRequests, type ListServiceRequestsParams, type ServiceRequestStatus } from '@servicepro/api-client';
import { Button, Card, EmptyState, Input, PageHeader, Stack, Text, cn } from '@servicepro/ui';
import { Inbox, Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import { paths } from '../../app/paths';
import { RequestList } from '../../components/request-list';

/** Saved views (RESPONSIVE-STRATEGY.md §5.4): the filters the owner reaches for every day. */
interface View {
  id: string;
  label: string;
  statuses?: ServiceRequestStatus[];
  onlyStuck?: boolean;
}

const OPEN_VIEW: View = { id: 'open', label: 'Open', statuses: ['NEW', 'READY_FOR_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'DIAGNOSING', 'AWAITING_ESTIMATE_APPROVAL', 'IN_PROGRESS', 'WAITING_FOR_PARTS', 'RESCHEDULED', 'CUSTOMER_UNAVAILABLE', 'UNABLE_TO_REPAIR', 'COMPLETED'] };

const VIEWS: View[] = [
  OPEN_VIEW,
  { id: 'unassigned', label: 'To assign', statuses: ['NEW', 'READY_FOR_ASSIGNMENT'] },
  { id: 'offered', label: 'Offered', statuses: ['OFFERED'] },
  { id: 'assigned', label: 'Assigned', statuses: ['ACCEPTED'] },
  { id: 'progress', label: 'In progress', statuses: ['EN_ROUTE', 'ARRIVED', 'DIAGNOSING', 'IN_PROGRESS'] },
  { id: 'hold', label: 'On hold', statuses: ['WAITING_FOR_PARTS', 'RESCHEDULED', 'CUSTOMER_UNAVAILABLE', 'UNABLE_TO_REPAIR'] },
  { id: 'unpaid', label: 'Completed', statuses: ['COMPLETED'] },
  { id: 'stuck', label: 'Stuck', onlyStuck: true },
  { id: 'closed', label: 'Closed', statuses: ['CLOSED', 'CLOSED_NO_REPAIR', 'CANCELLED'] },
  { id: 'all', label: 'All' },
];

const PAGE_SIZE = 25;

export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const viewId = params.get('view') ?? (params.get('sr') ? 'all' : 'open');
  const view = VIEWS.find((v) => v.id === viewId) ?? OPEN_VIEW;
  const srNumber = params.get('sr') ?? undefined;
  const page = Number(params.get('page') ?? '1');
  const [search, setSearch] = useState(srNumber ?? '');

  const query: ListServiceRequestsParams = {
    status: view.statuses,
    onlyStuck: view.onlyStuck,
    srNumber,
    page,
    pageSize: PAGE_SIZE,
  };
  const requests = useListServiceRequests(query);

  function update(next: Record<string, string | undefined>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }

    setParams(merged, { replace: true });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update({ sr: search.trim() || undefined, page: undefined, view: search.trim() ? 'all' : viewId });
  }

  return (
    <Stack gap={6}>
      <PageHeader
        title="Service requests"
        actions={
          <Button asChild>
            <Link to={paths.newRequest()}>
              <Plus aria-hidden /> New request
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Views" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <ul className="flex gap-2">
            {VIEWS.map((v) => (
              <li key={v.id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={v.id === view.id}
                  onClick={() => update({ view: v.id, page: undefined })}
                  className={cn(
                    'transition-interactive h-8 rounded-pill px-3 text-sm font-semibold pointer-coarse:h-10',
                    v.id === view.id ? 'bg-primary text-primary-foreground' : 'bg-surface-sunken text-foreground-secondary hover:text-foreground',
                  )}
                >
                  {v.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <form role="search" onSubmit={submitSearch} className="lg:w-72">
          <Input type="search" aria-label="Find by SR number" placeholder="SR number" leadingIcon={Search} value={search} onChange={(event) => setSearch(event.target.value)} />
        </form>
      </div>

      <QueryState query={requests} loading={<DefaultSkeleton rows={5} />} errorTitle="Couldn't load requests">
        {(data) =>
          data.items.length === 0 ? (
            <Card>
              <EmptyState icon={Inbox} title="No requests in this view" description={srNumber ? `Nothing matches "${srNumber}".` : 'Try another view.'} />
            </Card>
          ) : (
            <Stack gap={4}>
              <RequestList requests={data.items} />
              <div className="flex items-center justify-between gap-3">
                <Text variant="sm" tone="muted" className="tabular-nums">
                  {(data.page - 1) * data.pageSize + 1}–{Math.min(data.total, data.page * data.pageSize)} of {data.total}
                </Text>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={data.page * data.pageSize >= data.total} onClick={() => update({ page: String(data.page + 1) })}>
                    Next
                  </Button>
                </div>
              </div>
            </Stack>
          )
        }
      </QueryState>
    </Stack>
  );
}
