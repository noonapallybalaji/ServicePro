import { useGetActiveCatalog, useListMyBookings, useListMyNotifications, type MyBookingResponse } from '@servicepro/api-client';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApplianceGrid } from '@/components/appliance-grid';
import { BannerCarousel } from '@/components/banner-carousel';
import { Appear, LiveDot, PressableScale } from '@/components/motion';
import { AppText, Button, Card, IconCircle, Ionicons, Notice, SectionTitle } from '@/components/ui';
import { callSupport, isActive, statusOf, whatsappSupport } from '@/lib/format';
import { useWelcomed } from '@/lib/onboarding';
import { useServiceArea } from '@/lib/service-pincode';
import { useCustomer } from '@/lib/session';
import { colors, fonts, radius, shadow, space, type } from '@/lib/theme';

const STEPS = [
  { icon: 'calendar' as const, title: 'Book in a minute', text: 'Choose the appliance and your address.' },
  { icon: 'call' as const, title: 'We call you', text: 'We agree a visit time that suits you.' },
  { icon: 'construct' as const, title: 'Fixed at home', text: 'Estimate first, then the repair, with warranty.' },
];

const PROMISES = [
  { icon: 'shield-checkmark' as const, text: 'Verified, trained technicians' },
  { icon: 'pricetag' as const, text: 'Fixed visiting charge, estimate before any repair' },
  { icon: 'ribbon' as const, text: 'Warranty on every repair' },
  { icon: 'card' as const, text: 'Pay after the work: online, UPI or cash' },
];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const welcomed = useWelcomed();
  const catalog = useGetActiveCatalog();
  const area = useServiceArea();
  const { customer } = useCustomer();
  const bookings = useListMyBookings({ query: { enabled: customer !== null } });
  const notifications = useListMyNotifications({ take: 20 }, { query: { enabled: customer !== null, refetchInterval: 60_000 } });
  const [search, setSearch] = useState('');

  if (welcomed === false) return <Redirect href="/welcome" />;

  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const shown = search.trim() ? categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())) : categories;
  const lowestVisit = categories.length > 0 ? Math.min(...categories.map((c) => c.baseVisitCharge)) : null;
  const ongoing = (bookings.data ?? []).filter((b) => isActive(b.status)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unread = notifications.data?.unreadCount ?? 0;
  const firstName = customer?.fullName.split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            tintColor="#ffffff"
            refreshing={catalog.isRefetching || bookings.isRefetching}
            onRefresh={() => {
              void catalog.refetch();
              if (customer) void bookings.refetch();
            }}
          />
        }
      >
        <LinearGradient colors={[colors.navy950, colors.navy800]} style={styles.header}>
          <SafeAreaView edges={['top']}>
            <View style={styles.headerRow}>
              <Image source={require('../../../assets/logo-light.png')} style={{ width: 112, height: 21 }} resizeMode="contain" accessibilityLabel="Pakka Fix" />
              <PressableScale
                onPress={() => router.push(customer ? '/notifications' : '/sign-in')}
                accessibilityRole="button"
                accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                hitSlop={8}
                style={styles.bell}
              >
                <Ionicons name="notifications-outline" size={22} color="#ffffff" />
                {unread > 0 ? (
                  <View style={styles.bellBadge}>
                    <AppText variant="caption" bold style={{ color: colors.accentText, fontSize: 10, lineHeight: 12 }}>
                      {unread > 9 ? '9+' : unread}
                    </AppText>
                  </View>
                ) : null}
              </PressableScale>
            </View>

            <Appear style={{ marginTop: space.lg, gap: 4 }}>
              <AppText variant="small" tone="inverseMuted">
                {greeting()}
                {firstName ? `, ${firstName}` : ''} 👋
              </AppText>
              <AppText variant="title" tone="inverse">
                What needs fixing today?
              </AppText>
            </Appear>

            <PressableScale onPress={() => router.push('/location')} accessibilityRole="button" accessibilityLabel="Change service area" style={styles.areaChip}>
              <Ionicons name="location" size={16} color={colors.accent} />
              <AppText variant="small" tone="inverse" semibold numberOfLines={1} style={{ flexShrink: 1 }}>
                {area ? `${area.place || 'Your area'} · ${area.pincode}` : 'Set your location'}
              </AppText>
              <Ionicons name="chevron-down" size={14} color="#ffffff" />
            </PressableScale>

            <View style={styles.search}>
              <Ionicons name="search" size={19} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search AC, fridge, washing machine…"
                placeholderTextColor={colors.textMuted}
                style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0, fontFamily: fonts.regular }]}
                returnKeyType="search"
                accessibilityLabel="Search appliances"
              />
              {search ? (
                <PressableScale onPress={() => setSearch('')} accessibilityLabel="Clear search" hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </PressableScale>
              ) : null}
            </View>
          </SafeAreaView>
        </LinearGradient>

        <View style={{ gap: space.xl, marginTop: space.lg }}>
          {ongoing[0] ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <OngoingCard booking={ongoing[0]} more={ongoing.length - 1} />
            </View>
          ) : null}

          {!search ? <BannerCarousel lowestVisit={lowestVisit} /> : null}

          <View style={{ paddingHorizontal: space.lg }}>
            <SectionTitle>{search ? 'Results' : 'What needs repair?'}</SectionTitle>
            {catalog.isError ? (
              <Notice tone="error" title="Couldn't load the services" description="Check your connection." action={<Button small variant="outline" label="Try again" onPress={() => void catalog.refetch()} />} />
            ) : null}
            <ApplianceGrid categories={shown} loading={catalog.isPending} />
            {search && shown.length === 0 && !catalog.isPending ? (
              <Card flat style={{ gap: space.sm, alignItems: 'center' }}>
                <AppText tone="secondary" center>
                  No appliance called “{search.trim()}”. Tell us what it is and we'll help.
                </AppText>
                <Button small variant="outline" icon="logo-whatsapp" label="Ask on WhatsApp" onPress={() => whatsappSupport(`Hi Pakka Fix, can you repair my ${search.trim()}?`)} />
              </Card>
            ) : null}
          </View>

          {!search ? (
            <>
              <View style={{ paddingHorizontal: space.lg }}>
                <SectionTitle>How it works</SectionTitle>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  {STEPS.map((step, i) => (
                    <Appear key={step.title} index={i} style={{ flex: 1 }}>
                      <Card style={{ gap: space.sm, padding: space.md, minHeight: 150 }}>
                        <IconCircle name={step.icon} size={40} tone={i === 2 ? 'accent' : 'primary'} />
                        <AppText variant="small" bold>
                          {i + 1}. {step.title}
                        </AppText>
                        <AppText variant="caption" tone="muted">
                          {step.text}
                        </AppText>
                      </Card>
                    </Appear>
                  ))}
                </View>
              </View>

              <View style={{ paddingHorizontal: space.lg }}>
                <Card style={{ gap: space.md }}>
                  <AppText variant="h3">Why Pakka Fix</AppText>
                  {PROMISES.map((promise) => (
                    <View key={promise.text} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                      <Ionicons name={promise.icon} size={20} color={colors.success} />
                      <AppText variant="small" tone="secondary" style={{ flex: 1 }}>
                        {promise.text}
                      </AppText>
                    </View>
                  ))}
                </Card>
              </View>

              <View style={{ paddingHorizontal: space.lg }}>
                <Card flat style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.accentSubtle, borderColor: colors.accentBorder }}>
                  <IconCircle name="cog" tone="accent" />
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">Spare parts shop</AppText>
                    <AppText variant="small" tone="secondary">
                      Genuine spares for your appliances. Coming soon.
                    </AppText>
                  </View>
                </Card>
              </View>

              <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
                <AppText variant="h2">Need help?</AppText>
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  <Button label="Call us" variant="outline" icon="call" onPress={callSupport} style={{ flex: 1 }} />
                  <Button label="WhatsApp" variant="outline" icon="logo-whatsapp" onPress={() => whatsappSupport()} style={{ flex: 1 }} />
                </View>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** The repair in progress, at the top of home: where it stands and who's coming. */
function OngoingCard({ booking, more }: { booking: MyBookingResponse; more: number }) {
  const status = statusOf(booking.status);
  return (
    <Appear>
      <PressableScale
        haptic
        onPress={() => router.push(`/booking/${booking.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${booking.categoryName} repair, ${status.label}. Open booking`}
        style={[styles.ongoing, shadow.raised]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <LiveDot color={colors.accent} />
          <AppText variant="caption" tone="inverseMuted" bold>
            ONGOING REPAIR{more > 0 ? ` · +${more} more` : ''}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="h3" tone="inverse">
              {booking.categoryName} repair
            </AppText>
            <AppText variant="small" tone="inverseMuted">
              {status.label}
              {booking.technicianName ? ` · ${booking.technicianName}` : ''}
            </AppText>
          </View>
          <View style={styles.ongoingArrow}>
            <Ionicons name="arrow-forward" size={18} color={colors.accentText} />
          </View>
        </View>
      </PressableScale>
    </Appear>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingBottom: space.xl, borderBottomLeftRadius: radius.sheet, borderBottomRightRadius: radius.sheet },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  bell: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.navy950,
  },
  areaChip: {
    marginTop: space.md,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  search: {
    marginTop: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
  },
  ongoing: { backgroundColor: colors.primary, borderRadius: radius.card, padding: space.lg, gap: space.sm },
  ongoingArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
