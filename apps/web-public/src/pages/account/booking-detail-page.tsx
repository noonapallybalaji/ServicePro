import { useGetMyBooking, useSession } from '@servicepro/api-client';
import { Alert, Button, Container, Skeleton, Stack } from '@servicepro/ui';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { SiteLayout } from '../../components/site-layout';
import { customerFrom } from '../../customer-session';
import { usePageMeta } from '../../seo/head';
import { PAGES } from '../../seo/pages';
import { Tracking } from '../tracking-page';
import { BookingChanges } from './booking-changes';

/** One booking inside "My bookings": the live tracking view, plus change, cancel and help. */
export function BookingDetailPage() {
  usePageMeta(PAGES.account);
  const state = useSession();
  const customer = customerFrom(state);

  return (
    <SiteLayout>
      <Container className="flex flex-col gap-4 py-6 md:py-10">
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link to="/account">
            <ArrowLeft aria-hidden /> My bookings
          </Link>
        </Button>
        {state.status === 'unknown' ? (
          <Skeleton className="h-64 w-full rounded-card" />
        ) : customer ? (
          <Detail />
        ) : (
          <Alert
            tone="info"
            title="Sign in to see this booking"
            action={
              <Button asChild size="sm">
                <Link to="/account">Sign in</Link>
              </Button>
            }
          />
        )}
      </Container>
    </SiteLayout>
  );
}

function Detail() {
  const { id = '' } = useParams();
  const booking = useGetMyBooking(id, { query: { refetchInterval: 30_000, retry: false } });

  if (booking.isPending) {
    return (
      <Stack gap={4}>
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </Stack>
    );
  }

  if (!booking.data) return <Alert tone="error" title="We couldn't find this booking in your account" />;
  const { booking: summary, tracking, trackingToken } = booking.data;

  return (
    <Stack gap={4}>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <BookingChanges booking={summary} />
      </div>
      {tracking ? (
        <Tracking data={tracking} token={trackingToken} inAccount />
      ) : (
        <Alert tone="info" title={`${summary.srNumber} · ${summary.categoryName}`} description="This job finished a while ago, so its live details are no longer shown. Your bill is under Profile > My bills." />
      )}
    </Stack>
  );
}
