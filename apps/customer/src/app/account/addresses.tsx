import { getGetMyAccountQueryKey, useGetMyAccount, useRemoveMyAddress } from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';

import { Appear, PressableScale, Skeleton } from '@/components/motion';
import { AppText, Badge, BottomBar, Button, Card, EmptyState, IconCircle, Ionicons } from '@/components/ui';
import { colors, radius, space } from '@/lib/theme';

/** Saved addresses: the booking offers these first. Add, edit, remove; one is the default. */
export default function AddressesScreen() {
  const queryClient = useQueryClient();
  const account = useGetMyAccount();
  const remove = useRemoveMyAddress();
  const addresses = account.data?.addresses ?? [];

  function confirmRemove(id: string, label: string) {
    Alert.alert(`Remove "${label}"?`, 'Bookings already made keep their address.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => remove.mutate({ addressId: id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetMyAccountQueryKey() }) }),
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}>
        {account.isPending ? (
          [0, 1].map((i) => <Skeleton key={i} height={96} style={{ borderRadius: radius.card }} />)
        ) : addresses.length === 0 ? (
          <EmptyState icon="home-outline" title="No saved addresses" description="Save your home or office to book in seconds." />
        ) : (
          addresses.map((a, i) => (
            <Appear key={a.id} index={i}>
              <Card style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <IconCircle name={a.label === 'Work' ? 'briefcase' : a.label === 'Home' ? 'home' : 'location'} size={40} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <AppText bold>{a.label ?? 'Address'}</AppText>
                      {a.isDefault ? <Badge label="Default" tone="success" /> : null}
                    </View>
                    <AppText variant="small" tone="secondary">
                      {[a.line1, a.line2, a.landmark, a.locality, a.city, a.pincode].filter(Boolean).join(', ')}
                    </AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.lg }}>
                  <PressableScale onPress={() => router.push({ pathname: '/account/address', params: { id: a.id } })} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Edit ${a.label}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                      <AppText variant="small" tone="primary" bold>
                        Edit
                      </AppText>
                    </View>
                  </PressableScale>
                  <PressableScale onPress={() => confirmRemove(a.id, a.label ?? 'this address')} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${a.label}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.error} />
                      <AppText variant="small" tone="error" bold>
                        Remove
                      </AppText>
                    </View>
                  </PressableScale>
                </View>
              </Card>
            </Appear>
          ))
        )}
      </ScrollView>
      <BottomBar>
        <Button label="Add an address" icon="add" onPress={() => router.push('/account/address')} />
      </BottomBar>
    </View>
  );
}
