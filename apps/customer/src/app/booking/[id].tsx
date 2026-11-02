import {
  apiUrl,
  getGetMyBookingQueryKey,
  getListMyBookingsQueryKey,
  isApiError,
  useCancelMyBooking,
  useGetMyBooking,
  useListMyNotifications,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BillCard, CancelSheet, CompletionCodeCard, EstimateCard, PhotosCard, ReviewCard, Stars, WarrantyCard } from '@/components/booking-sections';
import { LiveMap } from '@/components/live-map';
import { Appear, LiveDot, Skeleton, success } from '@/components/motion';
import { SignedOut } from '@/components/signed-out';
import { AppText, Badge, Button, Card, IconCircle, Ionicons, Notice } from '@/components/ui';
import { applianceIcon } from '@/lib/appliances';
import { MILESTONES, formatDate, formatDateTime, isActive, statusOf, whatsappSupport } from '@/lib/format';
import { useCustomer } from '@/lib/session';
import { colors, radius, space } from '@/lib/theme';

/**
 * One booking, start to finish: where it stands (with a live map while the technician is on the
 * way), the completion code, the estimate to approve, the bill and invoice, photos, rating and
 * warranty. Refreshes every 15 seconds while the repair is ongoing.
 */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { customer } = useCustomer();
  const queryClient = useQueryClient();
  const detail = useGetMyBooking(id, {
    query: {
      enabled: customer !== null && !!id,
      refetchInterval: (query) => (query.state.data && isActive(query.state.data.booking.status) ? 15_000 : false),
    },
  });
  const notifications = useListMyNotifications({ take: 50 }, { query: { enabled: customer !== null } });
  const cancel = useCancelMyBooking({ mutation: { meta: { silent: true } } });
  const [cancelling, setCancelling] = useState(false);

  if (!customer) return <SignedOut title="Sign in to see this booking" description="Use the number you booked with." />;
  if (detail.isPending) return <LoadingBooking />;
  if (detail.isError) {
    return (
      <View style={{ padding: space.lg }}>
        <Notice tone="error" title="Couldn't load this booking" action={<Button small variant="outline" label="Try again" onPress={() => void detail.refetch()} />} />
      </View>
    );
  }

  const { booking, tracking, trackingToken, warranty } = detail.data;
  const status = statusOf(booking.status);
  const cancelled = booking.status === 'CANCELLED';
  const active = isActive(booking.status);
  const technician = tracking?.technician ?? null;
  const visit = booking.scheduledStart ?? booking.preferredSlotStart;
  const live = tracking?.live ?? null;
  // The completion code comes by WhatsApp and in the notifications feed: show it once they've arrived.
  const codeNote = (notifications.data?.items ?? []).find((n) => n.serviceRequestId === booking.id && /completion code/i.test(n.title + n.body));
  const completionCode = active && status.step >= 3 ? /\b(\d{4,8})\b/.exec(codeNote?.body ?? '')?.[1] : undefined;
  const paid = booking.paymentStatus === 'PAID';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: booking.srNumber }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} tintColor="#ffffff" />}
      >
        <LinearGradient colors={[colors.navy950, colors.navy800]} style={styles.hero}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={styles.heroIcon}>
              <Ionicons name={applianceIcon(booking.categoryCode)} size={24} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h2" tone="inverse">
                {booking.categoryName} repair
              </AppText>
              <AppText variant="small" tone="inverseMuted">
                Booked {formatDate(booking.createdAt)} · {booking.locality}
              </AppText>
            </View>
          </View>
          <View style={styles.statusPill}>
            {active ? <LiveDot color={colors.accent} /> : <Ionicons name={cancelled ? 'close-circle' : 'checkmark-circle'} size={16} color={cancelled ? '#ffb4a8' : '#7fe0a4'} />}
            <AppText variant="small" tone="inverse" bold>
              {status.label}
            </AppText>
          </View>
          {!cancelled ? <Timeline step={status.step} done={!active} /> : null}
        </LinearGradient>

        <View style={{ padding: space.lg, gap: space.lg, marginTop: -space.md }}>
          {live && booking.status === 'EN_ROUTE' ? (
            <Appear>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <LiveMap latitude={live.latitude} longitude={live.longitude} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
                  <LiveDot />
                  <AppText bold>{live.etaMinutes != null ? `About ${live.etaMinutes} min away` : `${technician?.fullName.split(' ')[0] ?? 'Your technician'} is on the way`}</AppText>
                </View>
              </Card>
            </Appear>
          ) : null}

          {completionCode ? (
            <Appear>
              <CompletionCodeCard code={completionCode} />
            </Appear>
          ) : null}

          {technician ? (
            <Appear index={1}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                {technician.photoUrl ? (
                  <Image source={{ uri: apiUrl(technician.photoUrl) }} style={styles.avatar} />
                ) : (
                  <IconCircle name="person" size={56} />
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="caption" tone="muted">
                    YOUR TECHNICIAN
                  </AppText>
                  <AppText variant="h3">{technician.fullName}</AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {technician.ratingAverage ? (
                      <>
                        <Stars value={Math.round(technician.ratingAverage)} size={12} />
                        <AppText variant="caption" tone="secondary">
                          {technician.ratingAverage.toFixed(1)}
                        </AppText>
                      </>
                    ) : null}
                    <AppText variant="caption" tone="muted">
                      {technician.completedJobs} jobs
                    </AppText>
                  </View>
                </View>
                {technician.phone && active ? (
                  <Button small icon="call" label="Call" onPress={() => void Linking.openURL(`tel:${technician.phone}`)} />
                ) : null}
              </Card>
            </Appear>
          ) : null}

          <Appear index={2}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <IconCircle name="calendar" tone="accent" />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" tone="muted">
                  VISIT
                </AppText>
                <AppText semibold>{cancelled ? 'Cancelled' : visit ? formatDateTime(visit) : "We'll call you to fix a time"}</AppText>
              </View>
            </Card>
          </Appear>

          {status.step >= 3 || booking.status === 'COMPLETED' || booking.status === 'CLOSED' ? (
            <EstimateCard bookingId={booking.id} token={trackingToken} status={booking.status} />
          ) : null}

          {tracking ? <PhotosCard photos={tracking.photos} /> : null}

          {!cancelled ? (
            <BillCard bookingId={booking.id} token={trackingToken} invoice={tracking?.invoice ?? null} visitCharge={booking.visitCharge} paid={paid} />
          ) : null}

          {tracking ? (
            <ReviewCard bookingId={booking.id} token={trackingToken} canReview={tracking.canReview ?? false} review={tracking.review ?? null} technicianName={technician?.fullName} />
          ) : null}

          {warranty ? <WarrantyCard bookingId={booking.id} warranty={warranty} /> : null}

          <Card style={{ gap: space.xs }}>
            <AppText variant="caption" tone="muted">
              PROBLEM
            </AppText>
            <AppText tone="secondary">{booking.problemDescription}</AppText>
          </Card>

          {isApiError(cancel.error) ? <Notice tone="error" title={cancel.error.message} /> : null}

          <View style={{ gap: space.sm }}>
            <Button
              label="Get help with this booking"
              icon="chatbubbles"
              variant="outline"
              onPress={() => router.push({ pathname: '/support/new', params: { booking: booking.id, sr: booking.srNumber } })}
            />
            <Button label="WhatsApp us" icon="logo-whatsapp" variant="ghost" onPress={() => whatsappSupport(`Hi Pakka Fix, I need help with booking ${booking.srNumber}.`)} />
            {booking.canCancel ? <Button label="Cancel booking" variant="ghost" onPress={() => setCancelling(true)} /> : null}
          </View>
        </View>
      </ScrollView>

      <CancelSheet
        visible={cancelling}
        busy={cancel.isPending}
        onClose={() => setCancelling(false)}
        onConfirm={(reason) =>
          cancel.mutate(
            { id: booking.id, data: { reason } },
            {
              onSuccess: () => {
                success();
                setCancelling(false);
                void queryClient.invalidateQueries({ queryKey: getGetMyBookingQueryKey(booking.id) });
                void queryClient.invalidateQueries({ queryKey: getListMyBookingsQueryKey() });
              },
            },
          )
        }
      />
    </View>
  );
}

/** The six milestones, filled up to where the repair is. */
function Timeline({ step, done }: { step: number; done: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: space.lg }} accessibilityLabel={`Step ${step + 1} of ${MILESTONES.length}: ${MILESTONES[step]}`}>
      {MILESTONES.map((title, i) => {
        const reached = i < step || (i === step && (done || i === 0));
        const current = i === step && !done;
        return (
          <View key={title} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={[styles.track, { opacity: i === 0 ? 0 : 1, backgroundColor: i <= step ? colors.accent : 'rgba(255,255,255,0.2)' }]} />
              <View
                style={[
                  styles.node,
                  reached && { backgroundColor: colors.accent, borderColor: colors.accent },
                  current && { borderColor: colors.accent, backgroundColor: colors.navy800 },
                ]}
              >
                {reached ? <Ionicons name="checkmark" size={11} color={colors.accentText} /> : current ? <View style={styles.nodeDot} /> : null}
              </View>
              <View style={[styles.track, { opacity: i === MILESTONES.length - 1 ? 0 : 1, backgroundColor: i < step ? colors.accent : 'rgba(255,255,255,0.2)' }]} />
            </View>
            <AppText variant="caption" tone={i <= step ? 'inverse' : 'inverseMuted'} center style={{ fontSize: 10, lineHeight: 12 }}>
              {title}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function LoadingBooking() {
  return (
    <View style={{ padding: space.lg, gap: space.lg }}>
      <Skeleton height={150} style={{ borderRadius: radius.card }} />
      <Skeleton height={80} style={{ borderRadius: radius.card }} />
      <Skeleton height={80} style={{ borderRadius: radius.card }} />
      <Badge label="Loading…" tone="neutral" />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: space.lg, paddingBottom: space.xl, borderBottomLeftRadius: radius.sheet, borderBottomRightRadius: radius.sheet },
  heroIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  statusPill: {
    marginTop: space.md,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sunken },
  track: { flex: 1, height: 2 },
  node: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  nodeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
