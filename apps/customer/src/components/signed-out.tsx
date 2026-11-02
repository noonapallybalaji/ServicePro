import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText, Button, Ionicons } from '@/components/ui';
import { colors, space } from '@/lib/theme';

/** Shown where a screen needs the customer signed in. */
export function SignedOut({ title, description }: { title: string; description: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySubtle, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person" size={30} color={colors.primary} />
      </View>
      <AppText variant="h2" center>
        {title}
      </AppText>
      <AppText tone="secondary" center>
        {description}
      </AppText>
      <Button label="Sign in" onPress={() => router.push('/sign-in')} style={{ alignSelf: 'stretch' }} />
      <Button label="Book a repair" variant="outline" onPress={() => router.push('/book')} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}
