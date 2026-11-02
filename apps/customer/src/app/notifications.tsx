import {
  getListMyNotificationsQueryKey,
  useListMyNotifications,
  useMarkAllMyNotificationsRead,
  useMarkMyNotificationRead,
  type CustomerNotificationResponse,
} from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';

import { Appear, PressableScale, Skeleton } from '@/components/motion';
import { AppText, EmptyState, IconCircle, type IconName } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

/** Every update we've sent (booking, technician, estimate, payment), newest first; unread ones stand out. */
export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const feed = useListMyNotifications({ take: 50 });
  const markOne = useMarkMyNotificationRead();
  const markAll = useMarkAllMyNotificationsRead();
  const items = feed.data?.items ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() });

  function open(item: CustomerNotificationResponse) {
    if (!item.isRead) markOne.mutate({ notificationId: item.id }, { onSuccess: () => void refresh() });
    if (item.serviceRequestId) router.push(`/booking/${item.serviceRequestId}`);
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () =>
            (feed.data?.unreadCount ?? 0) > 0 ? (
              <PressableScale onPress={() => markAll.mutate(undefined, { onSuccess: () => void refresh() })} hitSlop={10} accessibilityRole="button">
                <AppText variant="small" tone="inverse" bold>
                  Mark all read
                </AppText>
              </PressableScale>
            ) : null,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
        renderItem={({ item, index }) => (
          <Appear index={index}>
            <PressableScale
              onPress={() => open(item)}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${item.isRead ? '' : 'Unread. '}${item.title}`}
              style={{
                flexDirection: 'row',
                gap: space.md,
                padding: space.md,
                borderRadius: radius.card,
                backgroundColor: item.isRead ? colors.surface : colors.primarySubtle,
                borderWidth: 1,
                borderColor: item.isRead ? colors.border : colors.primaryBorder,
              }}
            >
              <IconCircle name={iconFor(item.title)} size={40} tone={item.isRead ? 'neutral' : 'primary'} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText bold={!item.isRead} semibold={item.isRead}>
                  {item.title}
                </AppText>
                <AppText variant="small" tone="secondary">
                  {item.body}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {formatDateTime(item.createdAt)}
                </AppText>
              </View>
              {!item.isRead ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, marginTop: 6 }} /> : null}
            </PressableScale>
          </Appear>
        )}
        ListEmptyComponent={
          feed.isPending ? (
            <View style={{ gap: space.sm }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={76} style={{ borderRadius: radius.card }} />
              ))}
            </View>
          ) : (
            <EmptyState icon="notifications-outline" title="No updates yet" description="We'll let you know here as your repair moves along." />
          )
        }
      />
    </View>
  );
}

function iconFor(title: string): IconName {
  const t = title.toLowerCase();
  if (t.includes('code')) return 'key';
  if (t.includes('way') || t.includes('arriv')) return 'navigate';
  if (t.includes('estimate')) return 'document-text';
  if (t.includes('pay') || t.includes('invoice') || t.includes('bill')) return 'card';
  if (t.includes('rate') || t.includes('review')) return 'star';
  if (t.includes('cancel')) return 'close-circle';
  if (t.includes('complete') || t.includes('done')) return 'checkmark-circle';
  return 'notifications';
}
