import { AuthImage, openProtectedFile } from '@servicepro/app-kit';
import {
  getGetTicketQueryKey,
  getListTicketsQueryKey,
  isApiError,
  useGetTicket,
  useListTickets,
  useReplyToTicket,
  useUpdateTicket,
  type StaffTicketListItem,
  type TicketCategory,
  type TicketStatus,
} from '@servicepro/api-client';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Heading, Skeleton, Text, Textarea, cn, formatDateTime } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LifeBuoy, Phone, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { paths } from '../../app/paths';
import { humanize } from '../../components/common';

/*
 * Support console (gap analysis 10.6, 14.5): the queue on the left (what's waiting for us first,
 * damage reports and late replies flagged), the conversation on the right. Replies reach the
 * customer on WhatsApp; internal notes never leave the office.
 */

const FILTERS: { value: TicketStatus | 'ALL'; label: string }[] = [
  { value: 'OPEN', label: 'Waiting for us' },
  { value: 'WAITING_ON_CUSTOMER', label: 'Waiting for customer' },
  { value: 'RESOLVED', label: 'Solved' },
  { value: 'ALL', label: 'All' },
];

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  BOOKING: 'Booking',
  LATE_TECHNICIAN: 'Late technician',
  PAYMENT: 'Payment',
  REPAIR_QUALITY: 'Repair quality',
  DAMAGE_OR_SAFETY: 'Damage or safety',
  OTHER: 'Other',
};

export function SupportPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('ticket');
  const [filter, setFilter] = useState<TicketStatus | 'ALL'>('OPEN');
  const [mine, setMine] = useState(false);
  const tickets = useListTickets({ status: filter === 'ALL' ? undefined : filter, mine: mine || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Heading level={1}>Support</Heading>
        <Text tone="secondary">Requests from customers on the website and WhatsApp. Replies are sent to them on WhatsApp.</Text>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <section aria-label="Queue" className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Button key={f.value} size="sm" variant={filter === f.value ? 'primary' : 'outline'} onClick={() => setFilter(f.value)}>
                {f.label}
              </Button>
            ))}
            <Checkbox label="Mine" checked={mine} onCheckedChange={(v) => setMine(v === true)} />
          </div>
          {tickets.isPending ? (
            <Skeleton className="h-[16rem] w-full rounded-card" />
          ) : tickets.data && tickets.data.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {tickets.data.map((ticket) => (
                <li key={ticket.id}>
                  <QueueItem ticket={ticket} selected={ticket.id === selected} onSelect={() => setParams({ ticket: ticket.id })} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState size="compact" icon={LifeBuoy} title="Nothing here" description="No requests match this filter." />
          )}
        </section>
        <section aria-label="Conversation" className="lg:col-span-3">
          {selected ? <TicketDetail id={selected} /> : <Text tone="muted">Choose a request to read and reply.</Text>}
        </section>
      </div>
    </div>
  );
}

function QueueItem({ ticket, selected, onSelect }: { ticket: StaffTicketListItem; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'pressable transition-interactive flex w-full flex-col gap-1 rounded-card border bg-surface p-3 text-left hover:border-border-strong',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border',
      )}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-foreground">{ticket.customerName}</span>
        {ticket.highPriority ? (
          <Badge size="sm" tone="error">
            <ShieldAlert aria-hidden className="size-3" /> {CATEGORY_LABEL[ticket.category]}
          </Badge>
        ) : (
          <Badge size="sm" tone="neutral">
            {CATEGORY_LABEL[ticket.category]}
          </Badge>
        )}
        {ticket.overdue ? (
          <Badge size="sm" tone="warning">
            <AlertTriangle aria-hidden className="size-3" /> Reply overdue
          </Badge>
        ) : null}
      </span>
      <span className="line-clamp-2 text-sm text-foreground-secondary">{ticket.preview}</span>
      <span className="text-caption text-foreground-muted tabular-nums">
        {ticket.number}
        {ticket.srNumber ? ` · ${ticket.srNumber}` : ''} · {humanize(ticket.channel)} · {formatDateTime(ticket.lastActivityAt)}
      </span>
    </button>
  );
}

function TicketDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const ticket = useGetTicket(id, { query: { refetchInterval: 15_000 } });
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: getGetTicketQueryKey(id) }), queryClient.invalidateQueries({ queryKey: getListTicketsQueryKey() })]);
  const reply = useReplyToTicket({ mutation: { meta: { silent: true }, onSuccess: async () => (setMessage(''), await refresh()) } });
  const update = useUpdateTicket({ mutation: { meta: { silent: true }, onSuccess: refresh } });

  if (ticket.isPending) return <Skeleton className="h-[24rem] w-full rounded-card" />;
  if (!ticket.data) return <Alert tone="error" title="Couldn't load this request" />;
  const t = ticket.data;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Text weight="semibold">
            {t.customerName} · {CATEGORY_LABEL[t.category]}
          </Text>
          <Text variant="sm" tone="secondary" className="tabular-nums">
            {t.number} · {humanize(t.channel)} · opened {formatDateTime(t.createdAt)}
          </Text>
          <div className="flex flex-wrap gap-3 text-sm">
            {t.customerPhone ? (
              <a className="link inline-flex items-center gap-1" href={`tel:${t.customerPhone}`}>
                <Phone aria-hidden className="size-4" /> {t.customerPhone}
              </a>
            ) : null}
            {t.customerId ? (
              <Link className="link" to={paths.customer(t.customerId)}>
                Customer
              </Link>
            ) : null}
            {t.serviceRequestId ? (
              <Link className="link" to={paths.request(t.serviceRequestId)}>
                {t.srNumber}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" loading={update.isPending} onClick={() => update.mutate({ id, data: { status: null, assignToMe: true } })}>
            Assign to me
          </Button>
          {t.status === 'RESOLVED' ? (
            <Button size="sm" variant="outline" loading={update.isPending} onClick={() => update.mutate({ id, data: { status: 'OPEN', assignToMe: null } })}>
              Reopen
            </Button>
          ) : (
            <Button size="sm" loading={update.isPending} onClick={() => update.mutate({ id, data: { status: 'RESOLVED', assignToMe: null } })}>
              Mark solved
            </Button>
          )}
        </div>
      </div>

      {t.overdue ? <Alert tone="warning" title={`Reply was due ${formatDateTime(t.firstResponseDueAt)}`} /> : null}

      {t.photos && t.photos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text variant="overline" tone="muted">
            Photos from the customer
          </Text>
          <ul className="flex flex-wrap gap-2">
            {t.photos.map((photo, index) => (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => void openProtectedFile(photo.url)}
                  className="pressable block overflow-hidden rounded-control border border-border"
                  aria-label={`Open customer upload ${index + 1}`}
                >
                  <AuthImage src={photo.url} alt="" className="size-24 object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="flex flex-col gap-3" aria-label="Messages">
        {t.messages.map((m, i) => (
          <li key={i} className={cn('flex flex-col gap-1', m.author === 'STAFF' ? 'items-end' : 'items-start')}>
            <span
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-3 text-sm',
                m.isInternal
                  ? 'border border-dashed border-warning bg-warning-subtle text-foreground'
                  : m.author === 'STAFF'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-surface-sunken text-foreground',
              )}
            >
              {m.body}
            </span>
            <span className="text-caption text-foreground-muted">
              {m.isInternal ? 'Internal note' : humanize(m.author)} · {formatDateTime(m.sentAt)}
            </span>
          </li>
        ))}
      </ol>

      <form
        className="flex flex-col gap-3 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          reply.mutate({ id, data: { message: message.trim(), internal } });
        }}
      >
        <Field label={internal ? 'Internal note (staff only)' : 'Reply to the customer'} hint={internal ? undefined : 'Sent to them on WhatsApp.'}>
          <Textarea value={message} maxLength={2000} rows={4} onChange={(event) => setMessage(event.target.value)} />
        </Field>
        {isApiError(reply.error) ? <Alert tone="error" title={reply.error.message} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={reply.isPending} disabled={message.trim().length === 0}>
            {internal ? 'Add note' : 'Send reply'}
          </Button>
          <Checkbox label="Internal note" checked={internal} onCheckedChange={(v) => setInternal(v === true)} />
        </div>
      </form>
    </Card>
  );
}
