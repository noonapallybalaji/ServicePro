import { useListMyBookings, type MyBookingResponse } from '@servicepro/api-client';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';

import { SignedOut } from '@/components/signed-out';
import { AppText, Badge, Button, Card, Ionicons, Notice } from '@/components/ui';
import { applianceIcon } from '@/lib/appliances';
import { formatDate, isActive, statusOf } from '@/lib/format';
import { useCustomer } from '@/lib/session';
import { colors, space } from '@/lib/theme';

export default function BookingsScreen() {
  const { customer, status } = useCustomer();
  const bookings = useListMyBookings({ query: { enabled: customer !== null } });

  if (!customer) {
    return status === 'offline' ? (
      <View style={{ padding: space.lg }}>
        <Notice tone="warning" title="No connection" description="Your bookings will show when you're back online." />
      </View>
    ) : (
      <SignedOut title="Your bookings" description="Sign in with the number you booked with to follow your repairs." />
    );
  }

  // Ongoing repairs first, then the rest, newest first.
  const list = [...(bookings.data ?? [])].sort(
    (a, b) => Number(isActive(b.status)) - Number(isActive(a.status)) || Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return (
    <FlatList
      data={list}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()} />}
      renderItem={({ item }) => <BookingCard booking={item} />}
      ListEmptyComponent={
        bookings.isPending ? (
          <AppText tone="muted" center>
            Loading…
          </AppText>
        ) : bookings.isError ? (
          <Notice tone="error" title="Couldn't load your bookings" action={<Button small variant="outline" label="Try again" onPress={() => void bookings.refetch()} />} />
        ) : (
          <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl }}>
            <AppText variant="h3">No bookings yet</AppText>
            <Button label="Book a repair" onPress={() => router.push('/book')} />
          </View>
        )
      }
    />
  );
}

function BookingCard({ booking }: { booking: MyBookingResponse }) {
  const status = statusOf(booking.status);
  return (
    <Card onPress={() => router.push(`/booking/${booking.id}`)} accessibilityLabel={`${booking.categoryName} repair, ${status.label}`} style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={applianceIcon(booking.categoryCode)} size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText bold>{booking.categoryName} repair</AppText>
          <AppText variant="caption" tone="muted">
            {booking.srNumber} · {formatDate(booking.createdAt)}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Badge label={status.label} tone={status.tone} />
        {booking.technicianName ? (
          <AppText variant="caption" tone="secondary">
            {booking.technicianName}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}
