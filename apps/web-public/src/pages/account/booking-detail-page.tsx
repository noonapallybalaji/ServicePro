import { useGetMyBooking, useSession } from '@servicepro/api-client';
import { Alert, Button, Container, Skeleton, Stack, Text } from '@servicepro/ui';
import { ArrowLeft, ImagePlus } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useParams } from 'react-router';

import { SiteLayout } from '../../components/site-layout';
import { customerFrom } from '../../customer-session';
import { usePageMeta } from '../../seo/head';
import { PAGES } from '../../seo/pages';
import { uploadPhotos } from '../booking/extras';
import { Tracking } from '../tracking-page';
import { BookingChanges } from './booking-changes';
import { WarrantyCard } from './warranty-card';

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
          <Skeleton className="h-[16rem] w-full rounded-card" />
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
        <Skeleton className="h-[10rem] w-full rounded-card" />
        <Skeleton className="h-[16rem] w-full rounded-card" />
      </Stack>
    );
  }

  if (!booking.data) return <Alert tone="error" title="We couldn't find this booking in your account" />;
  const { booking: summary, tracking, trackingToken, warranty } = booking.data;

  return (
    <Stack gap={4}>
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <BookingChanges booking={summary} />
        {FINISHED.has(summary.status) ? null : <AddPhotos bookingId={summary.id} />}
      </div>
      {warranty ? <WarrantyCard bookingId={summary.id} warranty={warranty} /> : null}
      {tracking ? (
        <Tracking data={tracking} token={trackingToken} inAccount />
      ) : (
        <Alert tone="info" title={`${summary.srNumber} · ${summary.categoryName}`} description="This job finished a while ago, so its live details are no longer shown. Your bill is under Profile > My bills." />
      )}
    </Stack>
  );
}

const FINISHED = new Set(['COMPLETED', 'CLOSED', 'CLOSED_NO_REPAIR', 'CANCELLED']);

/** Photos of the problem for the technician (up to 5 per booking; the API enforces it). */
function AddPhotos({ bookingId }: { bookingId: string }) {
  const inputId = useId();
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'failed'>('idle');

  async function upload(files: FileList | null) {
    const photos = Array.from(files ?? []);
    if (photos.length === 0) return;
    setState('uploading');
    setState((await uploadPhotos(bookingId, photos)) === 0 ? 'done' : 'failed');
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
      <label htmlFor={inputId} className="link inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <ImagePlus aria-hidden className="size-4" /> {state === 'uploading' ? 'Uploading…' : 'Add photos of the problem'}
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
      </label>
      {state === 'done' ? (
        <Text variant="caption" tone="success">
          Added. The technician will see them.
        </Text>
      ) : state === 'failed' ? (
        <Text variant="caption" tone="error">
          Some photos didn't upload (photos only, up to 5 per booking, under 10 MB).
        </Text>
      ) : null}
    </div>
  );
}
