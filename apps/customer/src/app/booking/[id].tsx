import { apiUrl, getGetMyBookingQueryKey, getListMyBookingsQueryKey, isApiError, useCancelMyBooking, useGetMyBooking } from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Image, Linking, RefreshControl, ScrollView, View } from 'react-native';

import { SignedOut } from '@/components/signed-out';
import { AppText, Badge, Button, Card, Ionicons, Notice } from '@/components/ui';
import { config } from '@/lib/config';
import { MILESTONES, formatDateTime, formatINR, isActive, statusOf, whatsappSupport } from '@/lib/format';
import { useCustomer } from '@/lib/session';
import { colors, space } from '@/lib/theme';

/** One booking: where it stands, the technician, the visit and the bill. Refreshes while it's ongoing. */
export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { customer } = useCustomer();
  const queryClient = useQueryClient();
  const detail = useGetMyBooking(id, {
    query: {
      enabled: customer !== null && !!id,
      refetchInterval: (query) => (query.state.data && isActive(query.state.data.booking.status) ? 20_000 : false),
    },
  });
  const cancel = useCancelMyBooking({ mutation: { meta: { silent: true } } });

  if (!customer) return <SignedOut title="Sign in to see this booking" description="Use the number you booked with." />;
  if (detail.isPending) {
    return (
      <AppText tone="muted" center style={{ marginTop: space.xxl }}>
        Loading…
      </AppText>
    );
  }
  if (detail.isError) {
    return (
      <View style={{ padding: space.lg }}>
        <Notice tone="error" title="Couldn't load this booking" action={<Button small variant="outline" label="Try again" onPress={() => void detail.refetch()} />} />
      </View>
    );
  }

  const { booking, tracking, trackingToken } = detail.data;
  const status = statusOf(booking.status);
  const cancelled = booking.status === 'CANCELLED';
  const technician = tracking?.technician ?? null;
  const visit = booking.scheduledStart ?? booking.preferredSlotStart;

  function confirmCancel() {
    Alert.alert('Cancel this booking?', "We won't send a technician. You can book again any time.", [
      { text: 'Keep booking', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () =>
          cancel.mutate(
            { id: booking.id, data: { reason: null } },
            {
              onSuccess: () => {
                void queryClient.invalidateQueries({ queryKey: getGetMyBookingQueryKey(booking.id) });
                void queryClient.invalidateQueries({ queryKey: getListMyBookingsQueryKey() });
              },
            },
          ),
      },
    ]);
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
      refreshControl={<RefreshControl refreshing={detail.isRefetching} onRefresh={() => void detail.refetch()} />}
    >
      <Stack.Screen options={{ title: booking.srNumber }} />

      <Card style={{ gap: space.sm }}>
        <AppText variant="h2">{booking.categoryName} repair</AppText>
        <Badge label={status.label} tone={status.tone} />
        <AppText variant="small" tone="secondary">
          {booking.problemDescription}
        </AppText>
        <AppText variant="small" tone="muted">
          {booking.locality}
        </AppText>
      </Card>

      {!cancelled ? (
        <Card style={{ gap: space.md }}>
          <AppText variant="h3">Progress</AppText>
          {MILESTONES.map((title, index) => {
            const done = index < status.step || (index === status.step && status.step === MILESTONES.length - 1);
            const current = index === status.step && !done;
            return (
              <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} accessibilityState={{ selected: current }}>
                <Ionicons
                  name={done ? 'checkmark-circle' : current ? 'ellipse' : 'ellipse-outline'}
                  size={22}
                  color={done ? colors.success : current ? colors.primary : colors.borderStrong}
                />
                <AppText tone={done || current ? 'default' : 'muted'} bold={current}>
                  {title}
                </AppText>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card style={{ gap: space.xs }}>
        <AppText variant="h3">Visit</AppText>
        <AppText tone="secondary">
          {cancelled ? 'Cancelled.' : visit ? formatDateTime(visit) : "We'll call you to fix a time."}
        </AppText>
      </Card>

      {technician ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {technician.photoUrl ? (
            <Image source={{ uri: apiUrl(technician.photoUrl) }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.sunken }} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={26} color={colors.primary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <AppText bold>{technician.fullName}</AppText>
            <AppText variant="small" tone="secondary">
              {technician.specialty}
              {technician.ratingAverage ? ` · ★ ${technician.ratingAverage.toFixed(1)}` : ''} · {technician.completedJobs} jobs
            </AppText>
          </View>
          {technician.phone ? <Button small variant="outline" icon="call" label="Call" onPress={() => void Linking.openURL(`tel:${technician.phone}`)} /> : null}
        </Card>
      ) : null}

      {isActive(booking.status) && tracking ? (
        <Button
          label={tracking.live ? 'See technician on the map' : 'Open tracking page'}
          icon="map"
          variant="outline"
          onPress={() => void WebBrowser.openBrowserAsync(`${config.siteUrl}/t/${trackingToken}`)}
        />
      ) : null}

      <Card style={{ gap: space.sm }}>
        <AppText variant="h3">Charges</AppText>
        <Row label="Visiting charge" value={formatINR(booking.visitCharge)} />
        {booking.finalAmount != null ? <Row label="Final bill" value={formatINR(booking.finalAmount)} bold /> : null}
        <AppText variant="caption" tone="muted">
          {booking.paymentStatus === 'PAID' ? 'Paid. Thank you!' : 'Pay after the visit. You get an estimate before any repair.'}
        </AppText>
      </Card>

      {isApiError(cancel.error) ? <Notice tone="error" title={cancel.error.message} /> : null}

      <Button label="Help with this booking" icon="logo-whatsapp" variant="outline" onPress={() => whatsappSupport(`Hi Pakka Fix, I need help with booking ${booking.srNumber}.`)} />
      {booking.canCancel ? <Button label="Cancel booking" variant="ghost" onPress={confirmCancel} loading={cancel.isPending} /> : null}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <AppText tone="secondary">{label}</AppText>
      <AppText bold={bold}>{value}</AppText>
    </View>
  );
}
