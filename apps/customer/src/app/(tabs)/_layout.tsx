import { useListMyNotifications } from '@servicepro/api-client';
import { Tabs } from 'expo-router';

import { AppHeader } from '@/components/app-header';
import { FloatingTabBar } from '@/components/floating-tab-bar';
import { useCustomer } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function TabsLayout() {
  const { customer } = useCustomer();
  const notifications = useListMyNotifications({ take: 20 }, { query: { enabled: customer !== null, refetchInterval: 60_000 } });
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        sceneStyle: { backgroundColor: colors.background },
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarBadge: (notifications.data?.unreadCount ?? 0) > 0 ? '•' : undefined }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings' }} />
      <Tabs.Screen name="help" options={{ title: 'Help' }} />
      <Tabs.Screen name="account" options={{ title: 'Account', headerShown: false }} />
    </Tabs>
  );
}
