import { useGetActiveCatalog, useListMyBookings, useListMyNotifications, type MyBookingResponse } from '@servicepro/api-client';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApplianceGrid } from '@/components/appliance-grid';
import { TAB_BAR_SPACE } from '@/components/floating-tab-bar';
import { Appear, LiveDot, PressableScale } from '@/components/motion';
import { AppText, Button, Card, IconCircle, Ionicons, Notice, SectionTitle } from '@/components/ui';
import { applianceCutout, applianceIcon } from '@/lib/appliances';
import { formatINR, isActive, statusOf, whatsappSupport } from '@/lib/format';
import { useWelcomed } from '@/lib/onboarding';
import { useServiceArea } from '@/lib/service-pincode';
import { useCustomer } from '@/lib/session';
import { colors, fonts, radius, shadow, space, type, isDark } from '@/lib/theme';

/*
 * Home, in the style of modern service apps: a greeting with the area and the bell, a search pill,
 * quick appliance chips, an offer card, the ongoing repair, appliance tiles, popular repairs and how
 * it works. The top bar gains a shadow once the page scrolls under it.
 */

const STEPS = [
  { icon: 'calendar' as const, title: 'Book in a minute', text: 'Pick the appliance and your address.' },
  { icon: 'call' as const, title: 'We call you', text: 'We agree a time that suits you.' },
  { icon: 'construct' as const, title: 'Fixed at home', text: 'Estimate first, warranty after.' },
];

export default function HomeScreen() {
  const welcomed = useWelcomed();
  const insets = useSafeAreaInsets();
  const catalog = useGetActiveCatalog();
  const area = useServiceArea();
  const { customer } = useCustomer();
  const bookings = useListMyBookings({ query: { enabled: customer !== null } });
  const notifications = useListMyNotifications({ take: 20 }, { query: { enabled: customer !== null, refetchInterval: 60_000 } });
  const [search, setSearch] = useState('');
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const barShadow = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(scrollY.value, [0, 40], [0, 0.1], 'clamp'),
    elevation: interpolate(scrollY.value, [0, 40], [0, 4], 'clamp'),
    borderBottomColor: scrollY.value > 20 ? colors.border : 'transparent',
  }));

  if (welcomed === false) return <Redirect href="/welcome" />;

  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const query = search.trim().toLowerCase();
  const shown = query ? categories.filter((c) => c.name.toLowerCase().includes(query) || c.issueTypes.some((i) => i.name.toLowerCase().includes(query))) : categories;
  const lowestVisit = categories.length > 0 ? Math.min(...categories.map((c) => c.baseVisitCharge)) : null;
  const ongoing = (bookings.data ?? []).filter((b) => isActive(b.status)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const unread = notifications.data?.unreadCount ?? 0;
  const popular = categories
    .flatMap((c) => c.issueTypes.filter((i) => i.isActive).slice(0, 2).map((issue) => ({ issue, category: c })))
    .slice(0, 6);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Animated.View style={[styles.topBar, { paddingTop: insets.top + space.sm }, barShadow]}>
        <View style={styles.greetRow}>
          <PressableScale onPress={() => router.push(customer ? '/account' : '/sign-in')} accessibilityRole="button" accessibilityLabel="Your account" style={styles.avatar}>
            <AppText bold style={{ color: colors.accentText }}>
              {customer ? customer.fullName.slice(0, 1).toUpperCase() : '👋'}
            </AppText>
          </PressableScale>
          <PressableScale onPress={() => router.push('/location')} accessibilityRole="button" accessibilityLabel="Change service area" style={{ flex: 1 }}>
            <AppText variant="caption" tone="muted">
              Hello{customer ? ',' : ''}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <AppText variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
                {customer ? customer.fullName.split(' ')[0] : 'Welcome to Pakka Fix'}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="location" size={12} color={colors.accent} />
              <AppText variant="caption" tone="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {area ? `${area.place || 'Your area'}, ${area.pincode}` : 'Set your location'}
              </AppText>
              <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
            </View>
          </PressableScale>
          <PressableScale
            onPress={() => router.push(customer ? '/notifications' : '/sign-in')}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            style={styles.bell}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unread > 0 ? <View style={styles.bellDot} /> : null}
          </PressableScale>
        </View>
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={catalog.isRefetching || bookings.isRefetching}
            onRefresh={() => {
              void catalog.refetch();
              if (customer) void bookings.refetch();
            }}
          />
        }
      >
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <Appear style={{ gap: space.md }}>
            <AppText variant="display">{ongoing.length > 0 ? 'Your repair is on track' : 'Fix it at home,\nthe pakka way.'}</AppText>
            <View style={styles.search}>
              <Ionicons name="search" size={20} color={colors.text} />
              <TextInput
                keyboardAppearance={isDark ? 'dark' : 'light'}
                value={search}
                onChangeText={setSearch}
                placeholder="Search for ‘AC not cooling’"
                placeholderTextColor={colors.textMuted}
                style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0, fontFamily: fonts.regular }]}
                returnKeyType="search"
                accessibilityLabel="Search appliances and problems"
              />
              {search ? (
                <PressableScale onPress={() => setSearch('')} accessibilityLabel="Clear search" hitSlop={10}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </PressableScale>
              ) : null}
            </View>
          </Appear>
        </View>

        {!query ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <PressableScale onPress={() => router.push('/book')} accessibilityRole="button" accessibilityLabel="Book a repair" style={[styles.chip, styles.chipSolid]}>
              <Ionicons name="flash" size={15} color="#ffffff" />
              <AppText variant="small" tone="inverse" bold>
                Quick book
              </AppText>
            </PressableScale>
            {categories.map((c) => (
              <PressableScale key={c.id} onPress={() => router.push(`/service/${c.code}`)} accessibilityRole="button" style={styles.chip}>
                <AppText variant="small" semibold>
                  {c.name}
                </AppText>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ paddingHorizontal: space.lg, gap: space.xl }}>
          {ongoing[0] ? <OngoingCard booking={ongoing[0]} more={ongoing.length - 1} /> : null}

          {!query ? (
            <Appear index={1}>
              <PressableScale onPress={() => router.push('/book')} accessibilityRole="button" scaleTo={0.98}>
                <LinearGradient colors={['#ff9a2e', colors.accent, '#e86a00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.offer, shadow.raised]}>
                  <View style={{ flex: 1, gap: 6, zIndex: 1 }}>
                    <AppText variant="title" style={{ color: '#ffffff' }}>
                      {lowestVisit !== null ? `Visit from ${formatINR(lowestVisit)}` : 'Honest prices'}
                    </AppText>
                    <AppText variant="small" style={{ color: 'rgba(255,255,255,0.92)' }}>
                      Adjusted in your final bill. Estimate before any repair.
                    </AppText>
                    <View style={styles.offerCta}>
                      <AppText variant="small" tone="inverse" bold>
                        Book now
                      </AppText>
                    </View>
                  </View>
                  <View style={styles.offerArt}>
                    <Ionicons name="construct" size={92} color="rgba(255,255,255,0.9)" />
                  </View>
                </LinearGradient>
              </PressableScale>
            </Appear>
          ) : null}

          <View>
            <SectionTitle action={query ? undefined : 'Book now'} onAction={() => router.push('/book')}>
              {query ? 'Results' : 'What needs repair?'}
            </SectionTitle>
            {catalog.isError ? (
              <Notice tone="error" title="Couldn't load the services" description="Check your connection." action={<Button small variant="outline" label="Try again" onPress={() => void catalog.refetch()} />} />
            ) : null}
            <ApplianceGrid categories={shown} loading={catalog.isPending} />
            {query && shown.length === 0 && !catalog.isPending ? (
              <Card flat style={{ gap: space.sm, alignItems: 'center' }}>
                <AppText tone="secondary" center>
                  Nothing matches “{search.trim()}”. Tell us what it is and we'll help.
                </AppText>
                <Button small variant="outline" icon="logo-whatsapp" label="Ask on WhatsApp" onPress={() => whatsappSupport(`Hi Pakka Fix, can you repair my ${search.trim()}?`)} />
              </Card>
            ) : null}
          </View>

          {!query && popular.length > 0 ? (
            <View>
              <SectionTitle>Popular repairs</SectionTitle>
              <View style={{ gap: space.sm }}>
                {popular.map(({ issue, category }, i) => {
                  const cutout = applianceCutout(category.code);
                  return (
                    <Appear key={issue.id} index={i}>
                      <PressableScale
                        onPress={() => router.push({ pathname: '/book', params: { category: category.id, issue: issue.id } })}
                        accessibilityRole="button"
                        accessibilityLabel={`${issue.name}, ${category.name}`}
                        scaleTo={0.98}
                        style={styles.popular}
                      >
                        <View style={styles.popularArt}>
                          {cutout ? <Image source={cutout} style={{ width: 52, height: 52 }} resizeMode="contain" /> : <Ionicons name={applianceIcon(category.code)} size={26} color={colors.primary} />}
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <AppText bold numberOfLines={1}>
                            {issue.name}
                          </AppText>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                            <AppText variant="caption" tone="muted">
                              ~{issue.typicalDurationMinutes} min
                            </AppText>
                            <AppText variant="caption" tone="muted">
                              · {category.name}
                            </AppText>
                          </View>
                          <AppText variant="small" tone="primary" bold>
                            From {formatINR(category.baseVisitCharge)}
                          </AppText>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </PressableScale>
                    </Appear>
                  );
                })}
              </View>
            </View>
          ) : null}

          {!query ? (
            <>
              <View>
                <SectionTitle>How it works</SectionTitle>
                <View style={{ gap: space.sm }}>
                  {STEPS.map((step, i) => (
                    <Appear key={step.title} index={i}>
                      <View style={styles.step}>
                        <View style={styles.stepNumber}>
                          <AppText bold tone="inverse">
                            {i + 1}
                          </AppText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <AppText bold>{step.title}</AppText>
                          <AppText variant="small" tone="muted">
                            {step.text}
                          </AppText>
                        </View>
                        <IconCircle name={step.icon} size={40} tone={i === 2 ? 'accent' : 'primary'} />
                      </View>
                    </Appear>
                  ))}
                </View>
              </View>

              <Card flat style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.navy950, borderColor: colors.navy950 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="h3" tone="inverse">
                    Spare parts shop
                  </AppText>
                  <AppText variant="small" tone="inverseMuted">
                    Genuine spares for your appliances.
                  </AppText>
                </View>
                <View style={styles.soon}>
                  <AppText variant="caption" bold style={{ color: colors.accentText }}>
                    Coming soon
                  </AppText>
                </View>
              </Card>
            </>
          ) : null}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

/** The repair in progress: where it stands and who's coming. */
function OngoingCard({ booking, more }: { booking: MyBookingResponse; more: number }) {
  const status = statusOf(booking.status);
  return (
    <Appear>
      <PressableScale
        haptic
        onPress={() => router.push(`/booking/${booking.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${booking.categoryName} repair, ${status.label}. Open booking`}
        scaleTo={0.98}
        style={[styles.ongoing, shadow.raised]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <LiveDot color={colors.accent} />
          <AppText variant="caption" tone="inverseMuted" bold>
            ONGOING{more > 0 ? ` · +${more} more` : ''}
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
  topBar: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    shadowColor: '#0a2f5a',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    zIndex: 2,
  },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  bell: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 10, right: 11, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error, borderWidth: 2, borderColor: colors.surface },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 54,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.lg },
  chip: { minHeight: 38, paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipSolid: { backgroundColor: colors.primary, borderColor: colors.primary },
  offer: { minHeight: 168, borderRadius: radius.sheet, padding: space.xl, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  offerCta: { alignSelf: 'flex-start', marginTop: space.sm, backgroundColor: colors.primary, paddingHorizontal: space.lg, paddingVertical: 9, borderRadius: radius.pill },
  offerArt: { position: 'absolute', right: -6, bottom: -6, transform: [{ rotate: '-18deg' }] },
  ongoing: { backgroundColor: colors.primary, borderRadius: radius.sheet, padding: space.lg, gap: space.sm },
  ongoingArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  popular: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  popularArt: { width: 72, height: 72, borderRadius: radius.control, backgroundColor: colors.tile, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  soon: { backgroundColor: colors.accent, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
});
