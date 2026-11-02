import { useListMyBookings, type MyBookingResponse } from '@servicepro/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Appear, LiveDot, PressableScale, Skeleton, tap } from '@/components/motion';
import { SignedOut } from '@/components/signed-out';
import { AppText, Badge, Button, Card, EmptyState, IconCircle, Ionicons, Notice } from '@/components/ui';
import { applianceIcon } from '@/lib/appliances';
import { formatDate, formatINR, isActive, statusOf } from '@/lib/format';
import { useCustomer } from '@/lib/session';
import { colors, fonts, radius, space } from '@/lib/theme';

type Tab = 'ongoing' | 'past';

export default function BookingsScreen() {
  const { customer, status } = useCustomer();
  const bookings = useListMyBookings({ query: { enabled: customer !== null } });
  const [tab, setTab] = useState<Tab>('ongoing');

  if (!customer) {
    return status === 'offline' ? (
      <View style={{ padding: space.lg }}>
        <Notice tone="warning" title="No connection" description="Your bookings will show when you're back online." />
      </View>
    ) : (
      <SignedOut title="Your bookings" description="Sign in with the number you booked with to follow your repairs." />
    );
  }

  const all = [...(bookings.data ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const ongoing = all.filter((b) => isActive(b.status));
  const past = all.filter((b) => !isActive(b.status));
  const list = tab === 'ongoing' ? ongoing : past;

  return (
    <View style={{ flex: 1 }}>
      <Segmented value={tab} onChange={setTab} counts={{ ongoing: ongoing.length, past: past.length }} />
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()} />}
        renderItem={({ item, index }) => (
          <Appear index={index}>
            <BookingCard booking={item} />
          </Appear>
        )}
        ListEmptyComponent={
          bookings.isPending ? (
            <View style={{ gap: space.md }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={110} style={{ borderRadius: radius.card }} />
              ))}
            </View>
          ) : bookings.isError ? (
            <Notice tone="error" title="Couldn't load your bookings" action={<Button small variant="outline" label="Try again" onPress={() => void bookings.refetch()} />} />
          ) : tab === 'ongoing' ? (
            <EmptyState
              icon="construct-outline"
              title="No ongoing repairs"
              description="Book a technician and follow every step here."
              action={<Button label="Book a repair" icon="add" onPress={() => router.push('/book')} />}
            />
          ) : (
            <EmptyState icon="time-outline" title="No past bookings yet" description="Finished and cancelled repairs show here." />
          )
        }
      />
    </View>
  );
}

function Segmented({ value, onChange, counts }: { value: Tab; onChange: (tab: Tab) => void; counts: Record<Tab, number> }) {
  const [width, setWidth] = useState(0);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value === 'ongoing' ? 0 : width / 2, { damping: 18, stiffness: 220 }) }] }));
  return (
    <View style={styles.segmentWrap}>
      <View style={styles.segment} onLayout={(event) => setWidth(event.nativeEvent.layout.width - 8)}>
        <Animated.View style={[styles.thumb, { width: width / 2 }, thumb]} />
        {(['ongoing', 'past'] as const).map((t) => (
          <PressableScale
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: value === t }}
            onPress={() => {
              tap();
              onChange(t);
            }}
            style={styles.segmentItem}
          >
            <AppText variant="small" style={{ fontFamily: fonts.bold, color: value === t ? colors.primary : colors.textMuted }}>
              {t === 'ongoing' ? 'Ongoing' : 'Past'}
              {counts[t] > 0 ? ` (${counts[t]})` : ''}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

function BookingCard({ booking }: { booking: MyBookingResponse }) {
  const status = statusOf(booking.status);
  const active = isActive(booking.status);
  return (
    <Card onPress={() => router.push(`/booking/${booking.id}`)} accessibilityLabel={`${booking.categoryName} repair, ${status.label}`} style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconCircle name={applianceIcon(booking.categoryCode)} />
        <View style={{ flex: 1 }}>
          <AppText bold>{booking.categoryName} repair</AppText>
          <AppText variant="caption" tone="muted">
            {booking.srNumber} · {formatDate(booking.createdAt)}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {active ? <LiveDot color={colors.accent} /> : null}
          <Badge label={status.label} tone={status.tone} />
        </View>
        <AppText variant="caption" tone="secondary">
          {booking.technicianName ?? (booking.finalAmount != null ? formatINR(booking.finalAmount) : booking.locality)}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.background },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: colors.sunken },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.pill, backgroundColor: colors.surface },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
