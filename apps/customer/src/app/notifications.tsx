import {
  getListMyNotificationsQueryKey,
  useListMyNotifications,
  useMarkAllMyNotificationsRead,
  useMarkMyNotificationRead,
  type CustomerNotificationResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Appear, PressableScale, Skeleton, tap } from '@/components/motion';
import { AppText, EmptyState, Ionicons, type IconName } from '@/components/ui';
import { colors, fonts, radius, shadow, space } from '@/lib/theme';

/*
 * Updates we've sent (booking, technician, estimate, payment), as on modern apps: All / Unread tabs,
 * grouped by Today, Yesterday, This week and Earlier, each group in one card; unread ones are marked.
 */

type Filter = 'all' | 'unread';

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const feed = useListMyNotifications({ take: 50 });
  const markOne = useMarkMyNotificationRead();
  const markAll = useMarkAllMyNotificationsRead();
  const [filter, setFilter] = useState<Filter>('all');
  const items = (feed.data?.items ?? []).filter((n) => filter === 'all' || !n.isRead);
  const groups = groupByDay(items);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });

  function open(item: CustomerNotificationResponse) {
    if (!item.isRead) markOne.mutate({ notificationId: item.id }, { onSuccess: () => void refresh() });
    if (item.serviceRequestId) router.push(`/booking/${item.serviceRequestId}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerRight: () =>
            (feed.data?.unreadCount ?? 0) > 0 ? (
              <PressableScale onPress={() => markAll.mutate(undefined, { onSuccess: () => void refresh() })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Mark all as read">
                <Ionicons name="checkmark-done" size={22} color={colors.primary} />
              </PressableScale>
            ) : null,
        }}
      />
      <Tabs value={filter} onChange={setFilter} unread={feed.data?.unreadCount ?? 0} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
      >
        {feed.isPending ? (
          [0, 1].map((i) => <Skeleton key={i} height={150} style={{ borderRadius: radius.card }} />)
        ) : groups.length === 0 ? (
          <EmptyState
            icon={filter === 'unread' ? 'checkmark-done-circle-outline' : 'notifications-outline'}
            title={filter === 'unread' ? "You're all caught up" : 'No updates yet'}
            description={filter === 'unread' ? 'No unread updates.' : "We'll let you know here as your repair moves along."}
          />
        ) : (
          groups.map((group, g) => (
            <Appear key={group.title} index={g} style={{ gap: space.sm }}>
              <AppText variant="small" bold>
                {group.title}
              </AppText>
              <View style={[styles.group, shadow.card]}>
                {group.items.map((item, i) => {
                  const look = lookOf(item.title);
                  return (
                    <PressableScale
                      key={item.id}
                      onPress={() => open(item)}
                      scaleTo={0.99}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.isRead ? '' : 'Unread. '}${item.title}`}
                      style={[styles.row, i < group.items.length - 1 && styles.rowDivider]}
                    >
                      <View style={[styles.icon, { backgroundColor: look.bg }]}>
                        <Ionicons name={look.icon} size={20} color={look.fg} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                          <AppText semibold={item.isRead} bold={!item.isRead} style={{ flex: 1 }} numberOfLines={2}>
                            {item.title}
                          </AppText>
                          <AppText variant="caption" tone="muted">
                            {timeLabel(item.createdAt, group.title)}
                          </AppText>
                        </View>
                        <AppText variant="small" tone="secondary">
                          {item.body}
                        </AppText>
                      </View>
                      {!item.isRead ? <View style={styles.unread} /> : null}
                    </PressableScale>
                  );
                })}
              </View>
            </Appear>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Tabs({ value, onChange, unread }: { value: Filter; onChange: (filter: Filter) => void; unread: number }) {
  const [widths, setWidths] = useState<Record<Filter, { x: number; w: number }>>({ all: { x: 0, w: 0 }, unread: { x: 0, w: 0 } });
  const target = widths[value];
  const underline = useAnimatedStyle(() => ({
    width: withSpring(target.w, { damping: 18, stiffness: 220 }),
    transform: [{ translateX: withSpring(target.x, { damping: 18, stiffness: 220 }) }],
  }));
  return (
    <View style={styles.tabs}>
      {(['all', 'unread'] as const).map((tab) => (
        <PressableScale
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab }}
          onPress={() => {
            tap();
            onChange(tab);
          }}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setWidths((current) => ({ ...current, [tab]: { x, w: width } }));
          }}
          style={styles.tab}
        >
          <AppText style={{ fontFamily: value === tab ? fonts.bold : fonts.medium, color: value === tab ? colors.text : colors.textMuted }}>
            {tab === 'all' ? 'All' : `Unread${unread > 0 ? ` (${unread})` : ''}`}
          </AppText>
        </PressableScale>
      ))}
      <Animated.View style={[styles.underline, underline]} />
    </View>
  );
}

/** Today, Yesterday, This week, Earlier. */
function groupByDay(items: CustomerNotificationResponse[]) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = 86_400_000;
  const bucket = (at: string) => {
    const t = Date.parse(at);
    if (t >= startOfToday.getTime()) return 'Today';
    if (t >= startOfToday.getTime() - day) return 'Yesterday';
    if (t >= startOfToday.getTime() - 6 * day) return 'This week';
    return 'Earlier';
  };
  const order = ['Today', 'Yesterday', 'This week', 'Earlier'];
  const map = new Map<string, CustomerNotificationResponse[]>();
  for (const item of [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const key = bucket(item.createdAt);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return order.filter((title) => map.has(title)).map((title) => ({ title, items: map.get(title) ?? [] }));
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-IN', { weekday: 'long' });
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });

function timeLabel(at: string, group: string) {
  const date = new Date(at);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (group === 'Today') return minutes < 1 ? 'now' : minutes < 60 ? `${minutes} min ago` : timeFormat.format(date);
  if (group === 'Yesterday') return timeFormat.format(date);
  if (group === 'This week') return dayFormat.format(date);
  return dateFormat.format(date);
}

/** Icon and colour by what the update is about. */
function lookOf(title: string): { icon: IconName; bg: string; fg: string } {
  const t = title.toLowerCase();
  if (t.includes('cancel') || t.includes('could')) return { icon: 'close-circle', bg: colors.errorSubtle, fg: colors.error };
  if (t.includes('code')) return { icon: 'key', bg: colors.accentSubtle, fg: colors.accentSubtleText };
  if (t.includes('pay') || t.includes('invoice') || t.includes('bill')) return { icon: 'card', bg: colors.successSubtle, fg: colors.success };
  if (t.includes('estimate')) return { icon: 'document-text', bg: colors.warningSubtle, fg: colors.warningText };
  if (t.includes('way') || t.includes('arriv')) return { icon: 'navigate', bg: colors.primarySubtle, fg: colors.primary };
  if (t.includes('confirm') || t.includes('booked') || t.includes('complete') || t.includes('done')) return { icon: 'checkmark-circle', bg: colors.successSubtle, fg: colors.success };
  if (t.includes('rate') || t.includes('review')) return { icon: 'star', bg: colors.accentSubtle, fg: colors.accent };
  return { icon: 'time', bg: colors.sunken, fg: colors.textSecondary };
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.xl, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingVertical: space.md },
  underline: { position: 'absolute', left: 0, bottom: -1, height: 3, borderRadius: 2, backgroundColor: colors.accent },
  group: { borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, alignItems: 'flex-start' },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  unread: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 },
});
