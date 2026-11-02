import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, useFonts } from '@expo-google-fonts/manrope';
import { isApiError } from '@servicepro/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { AppHeader } from '@/components/app-header';
import { AppUpdatePrompt } from '@/components/app-update';
import { followSystemScheme } from '@/lib/appearance';
import { useWelcomed } from '@/lib/onboarding';
import { startSession, useCustomer } from '@/lib/session';
import { colors, isDark } from '@/lib/theme';

// Keep the splash until fonts are in and we know whether the customer is signed in.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 300, fade: true });
startSession();
void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);

// Screen transitions and the navigator's own backgrounds follow the scheme.
const navigationTheme = {
  ...(isDark ? DarkTheme : DefaultTheme),
  colors: { ...(isDark ? DarkTheme : DefaultTheme).colors, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary },
};

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
  const welcomed = useWelcomed();
  const [fontsLoaded, fontError] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const ready = (fontsLoaded || !!fontError) && status !== 'unknown' && welcomed !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Back from the phone's settings with a different light/dark choice: restart in it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && followSystemScheme());
    return () => subscription.remove();
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navigationTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          header: (props) => <AppHeader {...props} />,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="location" options={{ title: 'Your location', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="book" options={{ title: 'Book a repair' }} />
        <Stack.Screen name="sign-in" options={{ title: 'Sign in', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="service/[code]" options={{ title: '' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="support/new" options={{ title: 'New help request', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="support/[number]" options={{ title: 'Help' }} />
        <Stack.Screen name="account/profile" options={{ title: 'Your details' }} />
        <Stack.Screen name="account/addresses" options={{ title: 'Saved addresses' }} />
        <Stack.Screen name="account/address" options={{ title: 'Address', animation: 'slide_from_bottom' }} />
      </Stack>
      <AppUpdatePrompt />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
