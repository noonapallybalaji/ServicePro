import {
  apiUrl,
  getGetMyTicketQueryKey,
  getListMyTicketsQueryKey,
  isApiError,
  useGetMyTicket,
  useListMyBookings,
  useListMyTickets,
  useOpenMyTicket,
  useResolveMyTicket,
  session,
  useWriteToMyTicket,
  type TicketCategory,
  type TicketStatus,
} from '@servicepro/api-client';
import { Alert, Badge, Button, Card, EmptyState, Field, Select, Skeleton, SpotArt, Text, Textarea, cn, formatDateTime } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ImagePlus, LifeBuoy, MessageSquarePlus, Send } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';

import { SITE, whatsappLink } from '../../site';

/*
 * "Help" in My bookings: ask about a booking (or anything else) and talk to the office in a
 * thread. The thread refreshes on its own while open; replies also arrive on WhatsApp.
 */

const CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'BOOKING', label: 'My booking or visit time' },
  { value: 'LATE_TECHNICIAN', label: 'The technician is late' },
  { value: 'PAYMENT', label: 'Payment or bill' },
  { value: 'REPAIR_QUALITY', label: 'The repair or the problem came back' },
  { value: 'DAMAGE_OR_SAFETY', label: 'Damage or a safety concern' },
  { value: 'OTHER', label: 'Something else' },
];

const STATUS: Record<TicketStatus, { label: string; tone: 'info' | 'success' | 'neutral' }> = {
  OPEN: { label: 'With our team', tone: 'info' },
  WAITING_ON_CUSTOMER: { label: 'We replied', tone: 'success' },
  RESOLVED: { label: 'Solved', tone: 'neutral' },
};

export function HelpTab() {
  const [params, setParams] = useSearchParams();
  const number = params.get('ticket');
  const booking = params.get('booking');
  const topic = CATEGORIES.find((c) => c.value === params.get('topic'))?.value;
  const [composing, setComposing] = useState(Boolean(booking || topic));

  const go = (next: Record<string, string>) => setParams({ tab: 'help', ...next }, { replace: true });

  if (number) return <Thread number={number} onBack={() => go({})} />;
  if (composing) return <NewRequest bookingId={booking ?? ''} initialCategory={topic} onCancel={() => (setComposing(false), go({}))} onOpened={(n) => (setComposing(false), go({ ticket: n }))} />;
  return <Requests onNew={() => setComposing(true)} onOpen={(n) => go({ ticket: n })} />;
}

function Requests({ onNew, onOpen }: { onNew: () => void; onOpen: (number: string) => void }) {
  const tickets = useListMyTickets();
  const phone = SITE.phone;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text tone="secondary">Ask us about a booking, a payment or anything else. We reply here and on WhatsApp.</Text>
        <Button onClick={onNew}>
          <MessageSquarePlus aria-hidden /> New request
        </Button>
      </div>
      {tickets.isPending ? (
        <Skeleton className="h-24 w-full rounded-card" />
      ) : tickets.data && tickets.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {tickets.data.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() => onOpen(ticket.number)}
                className="pressable transition-interactive flex w-full flex-col gap-1 rounded-card border border-border bg-surface p-4 text-left hover:border-border-strong hover:shadow-md"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{CATEGORIES.find((c) => c.value === ticket.category)?.label}</span>
                  <Badge size="sm" tone={STATUS[ticket.status].tone}>
                    {STATUS[ticket.status].label}
                  </Badge>
                </span>
                <span className="line-clamp-2 text-sm text-foreground-secondary">{ticket.preview}</span>
                <span className="text-caption text-foreground-muted tabular-nums">
                  {ticket.number}
                  {ticket.srNumber ? ` · ${ticket.srNumber}` : ''} · {formatDateTime(ticket.lastActivityAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          size="compact"
          icon={LifeBuoy}
          illustration={<SpotArt kind="calendar" />}
          title="No help requests yet"
          description={phone ? `Write to us here, or call ${phone}.` : 'Write to us here and we will reply.'}
        />
      )}
    </div>
  );
}

function NewRequest({
  bookingId,
  initialCategory,
  onCancel,
  onOpened,
}: {
  bookingId: string;
  initialCategory?: TicketCategory;
  onCancel: () => void;
  onOpened: (number: string) => void;
}) {
  const bookings = useListMyBookings();
  const queryClient = useQueryClient();
  const [serviceRequestId, setServiceRequestId] = useState(bookingId);
  const [category, setCategory] = useState<TicketCategory | ''>(initialCategory ?? '');
  const [message, setMessage] = useState('');
  const open = useOpenMyTicket({
    mutation: {
      meta: { silent: true },
      onSuccess: async (ticket) => {
        await queryClient.invalidateQueries({ queryKey: getListMyTicketsQueryKey() });
        onOpened(ticket.number);
      },
    },
  });
  const urgent = category === 'DAMAGE_OR_SAFETY';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!category) return;
    open.mutate({ data: { serviceRequestId: serviceRequestId || null, category, message: message.trim() } });
  }

  return (
    <Card className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Which booking is it about?" optional>
          <Select value={serviceRequestId} onChange={(event) => setServiceRequestId(event.target.value)}>
            <option value="">Not about a booking</option>
            {bookings.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.srNumber} · {b.categoryName}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-foreground">What do you need help with?</legend>
          <div role="radiogroup" aria-label="Topic" className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={category === c.value}
                onClick={() => setCategory(c.value)}
                className={cn(
                  'pressable transition-interactive inline-flex min-h-10 items-center rounded-pill border px-4 text-sm font-semibold',
                  category === c.value ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-foreground-secondary',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        {urgent && SITE.phone ? (
          <Alert
            tone="warning"
            title="If anyone is in danger, call us now"
            description={`For anything urgent, call ${SITE.phone}. We also prioritise damage and safety reports sent here.`}
          />
        ) : null}
        <Field label="Tell us what happened">
          <Textarea value={message} maxLength={2000} rows={5} onChange={(event) => setMessage(event.target.value)} />
        </Field>
        {isApiError(open.error) ? <Alert role="alert" tone="error" title={open.error.message} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={open.isPending} disabled={!category || message.trim().length < 3}>
            <Send aria-hidden /> Send
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Thread({ number, onBack }: { number: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const ticket = useGetMyTicket(number, { query: { refetchInterval: 10_000, retry: false } });
  const [reply, setReply] = useState('');
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetMyTicketQueryKey(number) }),
      queryClient.invalidateQueries({ queryKey: getListMyTicketsQueryKey() }),
    ]);
  const write = useWriteToMyTicket({ mutation: { meta: { silent: true }, onSuccess: async () => (setReply(''), await refresh()) } });
  const resolve = useResolveMyTicket({ mutation: { meta: { silent: true }, onSuccess: refresh } });

  const back = (
    <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
      <ArrowLeft aria-hidden /> All requests
    </Button>
  );

  if (ticket.isPending) return <Skeleton className="h-[16rem] w-full rounded-card" />;
  if (!ticket.data) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Alert tone="error" title="We couldn't find this request" />
      </div>
    );
  }

  const t = ticket.data;
  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="semibold">{CATEGORIES.find((c) => c.value === t.category)?.label}</Text>
        <Badge size="sm" tone={STATUS[t.status].tone}>
          {STATUS[t.status].label}
        </Badge>
        <Text variant="caption" tone="muted" className="tabular-nums">
          {t.number}
          {t.srNumber ? ` · ${t.srNumber}` : ''}
        </Text>
      </div>
      <ol className="flex flex-col gap-3" aria-label="Conversation" aria-live="polite">
        {t.messages.map((m, i) => (
          <li key={i} className={cn('flex flex-col gap-1', m.fromCustomer ? 'items-end' : 'items-start')}>
            <span
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-card px-4 py-3 text-sm',
                m.fromCustomer ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface text-foreground',
              )}
            >
              {m.body}
            </span>
            <span className="text-caption text-foreground-muted">
              {m.authorLabel} · {formatDateTime(m.sentAt)}
            </span>
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          write.mutate({ number, data: { message: reply.trim() } });
        }}
      >
        <Field label={t.status === 'RESOLVED' ? 'Need more help? Write again and we will reopen this.' : 'Your reply'}>
          <Textarea value={reply} maxLength={2000} rows={3} onChange={(event) => setReply(event.target.value)} />
        </Field>
        {isApiError(write.error) ? <Alert role="alert" tone="error" title={write.error.message} /> : null}
        <TicketPhotos number={number} count={t.photoCount ?? 0} onAdded={refresh} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={write.isPending} disabled={reply.trim().length === 0}>
            <Send aria-hidden /> Send
          </Button>
          {t.status !== 'RESOLVED' ? (
            <Button type="button" variant="ghost" loading={resolve.isPending} onClick={() => resolve.mutate({ number })}>
              <CheckCircle2 aria-hidden /> My problem is solved
            </Button>
          ) : null}
          {SITE.phone ? (
            <Button asChild variant="ghost">
              <a href={whatsappLink(`Hi, about my request ${t.number}`)} target="_blank" rel="noreferrer">
                WhatsApp us
              </a>
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/** Photos for the request: damage, an error code, the bill. Staff see them; they aren't shown back here. */
function TicketPhotos({ number, count, onAdded }: { number: string; count: number; onAdded: () => Promise<unknown> }) {
  const inputId = useId();
  const [state, setState] = useState<'idle' | 'uploading' | 'failed'>('idle');

  async function upload(files: FileList | null) {
    const photos = Array.from(files ?? []);
    if (photos.length === 0) return;
    setState('uploading');
    let failed = 0;
    for (const photo of photos) {
      const form = new FormData();
      form.append('file', photo);
      try {
        const response = await fetch(apiUrl(`/api/v1/account/support/${encodeURIComponent(number)}/photos`), {
          method: 'POST',
          body: form,
          headers: { Authorization: `Bearer ${session.getAccessToken() ?? ''}` },
          credentials: 'same-origin',
        });
        if (!response.ok) failed++;
      } catch {
        failed++;
      }
    }

    await onAdded();
    setState(failed > 0 ? 'failed' : 'idle');
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={inputId} className="link inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <ImagePlus aria-hidden className="size-4" /> {state === 'uploading' ? 'Uploading…' : 'Add photos'}
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
      </label>
      {count > 0 ? (
        <Text variant="caption" tone="muted">
          {count} photo{count > 1 ? 's' : ''} sent to our team
        </Text>
      ) : null}
      {state === 'failed' ? (
        <Text variant="caption" tone="error">
          Some photos didn't upload (photos only, up to 6, under 10 MB).
        </Text>
      ) : null}
    </div>
  );
}
