import {
  getGetTrackingQueryKey,
  isApiError,
  useCheckOnlinePayment,
  useGetTracking,
  useStartOnlinePayment,
  useTrackingUpdates,
  type ServiceRequestStatus,
  type TrackingResponse,
} from '@servicepro/api-client';
import {
  Alert,
  Button,
  Card,
  Container,
  CUSTOMER_MILESTONES,
  ErrorState,
  Heading,
  HeroBand,
  Skeleton,
  Stack,
  STATUS_TO_CUSTOMER_MILESTONE,
  StatusTimeline,
  TechnicianCard,
  TechnicianScene,
  Text,
  formatDateTime,
  formatINR,
  formatTime,
  formatWindow,
  type TimelineStep,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, FileDown, Link2Off, MessageCircle, Navigation, Phone } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { SITE, whatsappLink } from '../site';
import { EstimateCard } from './tracking-estimate';
import { ReviewCard } from './tracking-review';
import { SiteLayout } from '../components/site-layout';
import { usePageMeta } from '../seo/head';
import { PAGES } from '../seo/pages';

/** Statuses where something interrupted the normal flow. */
const ATTENTION: ReadonlySet<ServiceRequestStatus> = new Set(['WAITING_FOR_PARTS', 'RESCHEDULED', 'CUSTOMER_UNAVAILABLE', 'UNABLE_TO_REPAIR', 'CANCELLED']);

/** Statuses where the customer may have an estimate to review or look back at. */
const ESTIMATE_VISIBLE: ReadonlySet<ServiceRequestStatus> = new Set(['AWAITING_ESTIMATE_APPROVAL', 'IN_PROGRESS', 'UNABLE_TO_REPAIR', 'COMPLETED']);

/** Links on the dark hero band: the hero's own text colour, underlined (the default link colour is too dark here). */
const HERO_LINK = 'font-semibold text-inherit underline underline-offset-2 hover:no-underline';

/** Before the technician sets out, customers can change or cancel from "My bookings". */
const CHANGEABLE: ReadonlySet<ServiceRequestStatus> = new Set(['NEW', 'READY_FOR_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'RESCHEDULED']);

/** What's happening, in the customer's words (DESIGN-SYSTEM.md §9). */
function headline(t: TrackingResponse): { title: string; detail: string } {
  const tech = t.technician?.fullName ?? 'Your technician';
  switch (t.status) {
    case 'NEW':
    case 'READY_FOR_ASSIGNMENT':
    case 'OFFERED':
      return { title: "We're finding the right technician", detail: "You'll get a WhatsApp message as soon as someone is assigned." };
    case 'ACCEPTED':
      return { title: `${tech} will handle your service`, detail: t.scheduledStart ? `Visit: ${formatWindow(t.scheduledStart, t.scheduledEnd)}.` : "They'll call you before they come." };
    case 'EN_ROUTE':
      return { title: `${tech} is on the way`, detail: 'Keep your phone nearby in case they need directions.' };
    case 'ARRIVED':
    case 'DIAGNOSING':
      return { title: `${tech} is checking your appliance`, detail: 'Share your completion code only after the work is done.' };
    case 'AWAITING_ESTIMATE_APPROVAL':
      return { title: 'Your estimate is ready', detail: "Nothing is charged until you approve it." };
    case 'IN_PROGRESS':
      return { title: 'Repair in progress', detail: 'Share your completion code only after the work is done.' };
    case 'WAITING_FOR_PARTS':
      return { title: 'Waiting for a spare part', detail: "We'll confirm a new visit time as soon as it arrives." };
    case 'RESCHEDULED':
      return { title: 'Your visit is being rescheduled', detail: "We'll confirm the new time on WhatsApp." };
    case 'CUSTOMER_UNAVAILABLE':
      return { title: 'We missed you', detail: 'Call or WhatsApp us to choose a new time.' };
    case 'UNABLE_TO_REPAIR':
    case 'CLOSED_NO_REPAIR':
      return { title: "Your appliance couldn't be repaired", detail: 'Only the visiting charge applies. Call us if you have questions.' };
    case 'COMPLETED':
      return { title: 'Service completed', detail: 'Thank you! Your bill is below.' };
    case 'CLOSED':
      return { title: 'All done — thank you', detail: 'Your bill and photos stay available here for 30 days.' };
    case 'CANCELLED':
      return { title: 'This request was cancelled', detail: 'If that’s unexpected, please call us.' };
  }
}

/** 17 internal statuses → 6 milestones (USER-FLOWS.md §1.0). */
function milestones(t: TrackingResponse): TimelineStep[] {
  const currentId = STATUS_TO_CUSTOMER_MILESTONE[t.status];
  const currentIndex = CUSTOMER_MILESTONES.findIndex((m) => m.id === currentId);
  const finished = t.status === 'CLOSED' || t.status === 'COMPLETED' || t.status === 'CLOSED_NO_REPAIR';
  const reachedAt = (milestoneId: string) =>
    t.timeline.find((e) => STATUS_TO_CUSTOMER_MILESTONE[e.status] === milestoneId)?.occurredAt;

  return CUSTOMER_MILESTONES.map((milestone, index) => {
    const at = reachedAt(milestone.id);
    const state: TimelineStep['state'] =
      finished || index < currentIndex ? 'complete' : index === currentIndex ? (ATTENTION.has(t.status) ? 'attention' : 'current') : 'upcoming';
    return {
      id: milestone.id,
      title: milestone.title,
      timestamp: at && state !== 'upcoming' ? formatTime(at) : undefined,
      state,
    };
  });
}

export function TrackingPage() {
  usePageMeta(PAGES.tracking);
  const { token = '' } = useParams();
  // Customers keep this open while waiting: live updates, with a gentle poll as the fallback (PLAN.md §12.5).
  const tracking = useGetTracking(token, { query: { refetchInterval: 30_000, retry: false } });

  return (
    <SiteLayout>
        <Container className="py-6 md:py-10">
          {tracking.isPending ? (
            <Stack gap={4}>
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-[10rem] w-full rounded-card" />
              <Skeleton className="h-[16rem] w-full rounded-card" />
            </Stack>
          ) : tracking.isError ? (
            <>
              <h1 className="sr-only">Track your service</h1>
              <ErrorState
                icon={Link2Off}
                title="This tracking link has expired or doesn't exist"
                description="Links stay active until 30 days after your service. Call us and we'll help."
                secondaryAction={
                  SITE.phone ? (
                    <Button asChild variant="outline">
                      <a href={`tel:${SITE.phone}`}>Call us</a>
                    </Button>
                  ) : undefined
                }
              />
            </>
          ) : (
            <Tracking data={tracking.data} token={token} />
          )}
        </Container>
    </SiteLayout>
  );
}

/** inAccount: shown inside My bookings, where change, cancel and help are already buttons above. */
export function Tracking({ data, token, inAccount = false }: { data: TrackingResponse; token: string; inAccount?: boolean }) {
  const { title, detail } = headline(data);
  const attention = ATTENTION.has(data.status);
  const beforePhotos = data.photos.filter((p) => p.kind === 'PHOTO_BEFORE');
  const afterPhotos = data.photos.filter((p) => p.kind === 'PHOTO_AFTER');
  const queryClient = useQueryClient();
  // Pushes only say "something changed": refetch this page (and the My bookings view of it).
  useTrackingUpdates(token, () => {
    void queryClient.invalidateQueries({ queryKey: getGetTrackingQueryKey(token) });
    void queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith('/api/v1/account/bookings') });
  });

  return (
    <Stack gap={6}>
      <HeroBand art={<TechnicianScene />} artSize="md">
        <div className="flex flex-col gap-2" aria-live="polite">
          <Text variant="sm" tone="muted">
            Hi {data.customerFirstName} · {data.srNumber} · {data.categoryName}
          </Text>
          <Heading level={1}>{title}</Heading>
          <Text variant="body-lg" tone="secondary">
            {detail}
          </Text>
          {inAccount ? null : (
            <>
              <Text variant="sm" tone="secondary">
                Questions about this visit?{' '}
                <Link className={HERO_LINK} to="/account?tab=help">
                  Ask us in My bookings
                </Link>
              </Text>
              {CHANGEABLE.has(data.status) ? (
                <Text variant="sm" tone="secondary">
                  Need a different time, or want to cancel?{' '}
                  <Link className={HERO_LINK} to="/account">
                    Manage it in My bookings
                  </Link>
                </Text>
              ) : null}
            </>
          )}
        </div>
      </HeroBand>

      {attention && data.status === 'CUSTOMER_UNAVAILABLE' && SITE.phone ? (
        <Alert
          tone="warning"
          title="Choose a new time"
          action={
            <Button asChild size="sm">
              <a href={whatsappLink(`Hi, about ${data.srNumber}: please reschedule my visit.`)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden /> WhatsApp us
              </a>
            </Button>
          }
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {data.technician ? (
            <TechnicianCard
              name={data.technician.fullName}
              photoUrl={data.technician.photoUrl ?? undefined}
              specialty={data.technician.specialty}
              rating={data.technician.ratingAverage ?? undefined}
              completedJobs={data.technician.completedJobs}
              actions={
                data.technician.phone ? (
                  <Button asChild>
                    <a href={`tel:${data.technician.phone}`}>
                      <Phone aria-hidden /> Call {data.technician.fullName.split(' ')[0]}
                    </a>
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {data.status === 'EN_ROUTE' && data.live ? <OnTheWay live={data.live} name={data.technician?.fullName.split(' ')[0]} /> : null}

          <Card>
            <StatusTimeline steps={milestones(data)} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <Text variant="overline" tone="muted">
              Your service
            </Text>
            <Text>{data.problemDescription}</Text>
            <Text variant="sm" tone="secondary">
              {data.locality}
              {data.city ? `, ${data.city}` : ''}
              {data.scheduledStart ? ` · ${formatWindow(data.scheduledStart, data.scheduledEnd)}` : ''}
            </Text>
          </Card>

          <ReviewCard token={token} technicianName={data.technician?.fullName} canReview={data.canReview ?? false} review={data.review} />
          {ESTIMATE_VISIBLE.has(data.status) ? <EstimateCard token={token} /> : null}

          <Card className="flex flex-col gap-3">
            <Text variant="overline" tone="muted">
              Cost
            </Text>
            {data.invoice ? (
              <>
                <ul className="flex flex-col gap-1">
                  {data.invoice.lines.map((line, index) => (
                    <li key={`${line.description}-${index}`} className="flex justify-between gap-3 text-sm">
                      <span className="text-foreground-secondary">{line.description}</span>
                      <span className="tabular-nums">{formatINR(line.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <Text weight="semibold">Total</Text>
                  <Text variant="stat-sm">{formatINR(data.invoice.total)}</Text>
                </div>
                <Text variant="sm" tone={data.invoice.amountPaid >= data.invoice.total ? 'success' : 'secondary'}>
                  {data.invoice.amountPaid >= data.invoice.total ? 'Paid in full. Thank you!' : `Paid ${formatINR(data.invoice.amountPaid)}`}
                </Text>
                <PaymentReturn token={token} />
                {data.invoice.canPayOnline && data.status === 'COMPLETED' ? (
                  <PayOnline token={token} amount={data.invoice.total - data.invoice.amountPaid} />
                ) : null}
                <Button asChild variant="outline" className="self-start">
                  <a href={`/api/v1/public/track/${encodeURIComponent(token)}/invoice.pdf`} target="_blank" rel="noreferrer">
                    <FileDown aria-hidden /> Download bill ({data.invoice.invoiceNumber})
                  </a>
                </Button>
              </>
            ) : (
              <Text>
                Visiting charge <span className="font-semibold tabular-nums">{formatINR(data.visitCharge)}</span>. Any repair cost is explained to you before work
                starts.
              </Text>
            )}
          </Card>

          {data.photos.length > 0 ? (
            <Card className="flex flex-col gap-3">
              <Text variant="overline" tone="muted">
                Photos
              </Text>
              <div className="grid grid-cols-2 gap-3">
                {[...beforePhotos, ...afterPhotos].map((photo) => (
                  <figure key={photo.id} className="flex flex-col gap-1">
                    <img src={photo.url} alt={photo.kind === 'PHOTO_AFTER' ? 'After the repair' : 'Before the repair'} className="aspect-square w-full rounded-control object-cover" loading="lazy" />
                    <figcaption className="text-caption text-foreground-muted">
                      {photo.kind === 'PHOTO_AFTER' ? 'After' : 'Before'} · {formatDateTime(photo.createdAt)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          ) : null}

          {data.messages.length > 0 ? (
            <Card className="flex flex-col gap-2">
              <Text variant="overline" tone="muted">
                Notes from us
              </Text>
              {data.messages.map((message, index) => (
                <Text key={index} variant="sm">
                  {message}
                </Text>
              ))}
            </Card>
          ) : null}

          {SITE.phone ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline" className="sm:flex-1">
                <a href={`tel:${SITE.phone}`}>
                  <Phone aria-hidden /> Call us
                </a>
              </Button>
              <Button asChild variant="outline" className="sm:flex-1">
                <a href={whatsappLink(`Hi, I have a question about ${data.srNumber}.`)} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden /> WhatsApp us
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Stack>
  );
}

/** Sends the customer to the gateway's payment page (UPI, card, net banking). */
function PayOnline({ token, amount }: { token: string; amount: number }) {
  const start = useStartOnlinePayment({ mutation: { meta: { silent: true } } });

  return (
    <div className="flex flex-col gap-2">
      {isApiError(start.error) ? <Alert role="alert" tone="error" title={start.error.message} /> : null}
      <Button
        size="lg"
        loading={start.isPending}
        onClick={() => start.mutate({ token }, { onSuccess: (link) => window.location.assign(link.url) })}
      >
        <CreditCard aria-hidden /> Pay {formatINR(amount)} online
      </Button>
      <Text variant="caption" tone="muted">
        UPI, card or net banking on our payment partner's secure page. Or pay the technician by UPI or cash.
      </Text>
    </div>
  );
}

/**
 * Back from the payment page (?payment=done): ask the server, which asks the gateway. The
 * browser returning is never treated as proof of payment.
 */
function PaymentReturn({ token }: { token: string }) {
  const [params, setParams] = useSearchParams();
  const returned = params.get('payment') === 'done';
  const queryClient = useQueryClient();
  const check = useCheckOnlinePayment({ mutation: { meta: { silent: true } } });
  const [state, setState] = useState<'checking' | 'paid' | 'pending' | 'idle'>(returned ? 'checking' : 'idle');
  const attempts = useRef(0);

  useEffect(() => {
    if (!returned) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      attempts.current += 1;
      check.mutate(
        { token },
        {
          onSuccess: async (result) => {
            if (result.paid) {
              setState('paid');
              await queryClient.invalidateQueries({ queryKey: getGetTrackingQueryKey(token) });
              setParams({}, { replace: true });
            } else if (attempts.current < 5) {
              timer = setTimeout(run, 3000);
            } else {
              setState('pending');
            }
          },
          onError: () => setState('pending'),
        },
      );
    };
    run();
    return () => clearTimeout(timer);
    // Runs once per return from the payment page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, token]);

  if (state === 'checking') return <Alert tone="info" title="Confirming your payment…" description="This takes a few seconds." />;
  if (state === 'paid') return <Alert tone="success" title="Payment received. Thank you!" />;
  if (state === 'pending')
    return (
      <Alert
        tone="warning"
        title="We haven't received the payment yet"
        description="If money left your account, don't pay again: it will show here within a few minutes. Otherwise, try again."
      />
    );
  return null;
}

const LiveMap = lazy(() => import('./live-map'));

/** Where the technician is and roughly when they'll arrive (gap analysis 6.2, 4.5). */
function OnTheWay({ live, name = 'Your technician' }: { live: NonNullable<TrackingResponse['live']>; name?: string }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text weight="semibold" className="inline-flex items-center gap-2">
          <Navigation aria-hidden className="size-4 text-primary" />
          {live.etaMinutes != null ? `About ${live.etaMinutes} min away` : `${name} is on the way`}
        </Text>
        <Text variant="caption" tone="muted" className="tabular-nums">
          Updated {formatTime(live.at)}
        </Text>
      </div>
      <Suspense fallback={<Skeleton className="aspect-4/3 w-full rounded-card sm:aspect-video" />}>
        <LiveMap latitude={live.latitude} longitude={live.longitude} label={`${name}'s location at ${formatTime(live.at)}`} />
      </Suspense>
      <Text variant="caption" tone="muted">
        {live.etaMinutes != null ? 'An estimate from the distance; traffic can change it. ' : ''}
        The map stops once {name === 'Your technician' ? 'they arrive' : `${name} arrives`}.
      </Text>
    </Card>
  );
}
