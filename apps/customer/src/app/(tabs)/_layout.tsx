import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tap } from '@/components/motion';
import { colors, fonts } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (active: IconName, inactive: IconName) =>
  ({ color, size, focused }: { color: unknown; size: number; focused: boolean }) => <Ionicons name={focused ? active : inactive} color={String(color)} size={size} />;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenListeners={{ tabPress: () => tap() }}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        tabBarStyle: { height: 60 + insets.bottom, paddingTop: 6, borderTopColor: colors.border, backgroundColor: colors.surface },
        headerStyle: { backgroundColor: colors.navy950 },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17 },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        animation: 'shift',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', headerTitle: 'My bookings', tabBarIcon: icon('calendar', 'calendar-outline') }} />
      <Tabs.Screen name="help" options={{ title: 'Help', headerTitle: 'Help and support', tabBarIcon: icon('chatbubbles', 'chatbubbles-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
