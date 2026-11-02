import { isApiError } from '@servicepro/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { startSession, useCustomer } from '@/lib/session';
import { colors } from '@/lib/theme';

// Keep the splash until we know whether the customer is signed in (the stored sign-in resumes).
void SplashScreen.preventAutoHideAsync();
startSession();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A refused request (wrong input, not found, signed out) won't succeed on a retry.
      retry: (failures, error) => failures < 2 && !(isApiError(error) && error.status < 500),
    },
  },
});

export default function RootLayout() {
  const { status } = useCustomer();

  useEffect(() => {
    if (status !== 'unknown') void SplashScreen.hideAsync();
  }, [status]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navy950 },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book" options={{ title: 'Book a repair' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
        <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
      </Stack>
    </QueryClientProvider>
  );
}
