import { router } from 'expo-router';
import { View } from 'react-native';

import { Appear } from '@/components/motion';
import { Button, EmptyState } from '@/components/ui';
import { space } from '@/lib/theme';

/** Shown where a screen needs the customer signed in. */
export function SignedOut({ title, description }: { title: string; description: string }) {
  return (
    <Appear style={{ flex: 1, justifyContent: 'center', padding: space.lg }}>
      <EmptyState
        icon="person-circle-outline"
        title={title}
        description={description}
        action={
          <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.sm }}>
            <Button label="Sign in" onPress={() => router.push('/sign-in')} />
            <Button label="Book a repair" variant="outline" onPress={() => router.push('/book')} />
          </View>
        }
      />
    </Appear>
  );
}
