import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontWeight: '600' },
        headerStyle: { backgroundColor: colors.navy950 },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color, size }) => <Ionicons name="home" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'My bookings', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={String(color)} size={size} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" color={String(color)} size={size} /> }}
      />
    </Tabs>
  );
}
