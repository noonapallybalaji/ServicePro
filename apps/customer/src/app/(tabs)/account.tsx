import { session, useDeleteMyAccount, useGetMyAccount } from '@servicepro/api-client';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_SPACE } from '@/components/floating-tab-bar';
import { Appear } from '@/components/motion';
import { AppText, Button, Card, ListRow } from '@/components/ui';
import { config } from '@/lib/config';
import { callSupport, prettyPhone, whatsappSupport } from '@/lib/format';
import { useServiceArea } from '@/lib/service-pincode';
import { useCustomer } from '@/lib/session';
import { colors, radius, shadow, space } from '@/lib/theme';

export default function AccountScreen() {
  const { customer } = useCustomer();
  const account = useGetMyAccount({ query: { enabled: customer !== null } });
  const remove = useDeleteMyAccount({ mutation: { meta: { silent: true } } });
  const area = useServiceArea();
  const insets = useSafeAreaInsets();
  const openPage = (path: string) => void WebBrowser.openBrowserAsync(`${config.siteUrl}${path}`);
  const addresses = account.data?.addresses.length ?? 0;

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'Your profile, saved addresses and messages are removed. Bills we must keep by law stay, without your details. This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(undefined, {
              onSuccess: () => session.clear(),
              onError: () => Alert.alert("Couldn't delete it right now", 'Please try again, or call us.'),
            }),
        },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE, paddingTop: insets.top + space.md }}>
      <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
        <AppText variant="display">Account</AppText>
        <View style={[styles.header, shadow.card]}>
        {customer ? (
          <Appear style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={styles.avatar}>
              <AppText variant="title" style={{ color: colors.accentText }}>
                {customer.fullName.slice(0, 1).toUpperCase()}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h2">{account.data?.fullName ?? customer.fullName}</AppText>
              <AppText variant="small" tone="secondary">
                {prettyPhone(customer.phone)}
                {account.data?.email ? ` · ${account.data.email}` : ''}
              </AppText>
            </View>
          </Appear>
        ) : (
          <Appear style={{ gap: space.md }}>
            <AppText variant="title">Welcome to Pakka Fix</AppText>
            <AppText tone="secondary">Sign in with the number you booked with to follow your repairs.</AppText>
            <Button label="Sign in" onPress={() => router.push('/sign-in')} style={{ alignSelf: 'flex-start' }} />
          </Appear>
        )}
        </View>
      </View>

      <View style={{ padding: space.lg, gap: space.lg }}>
        {customer ? (
          <Card style={{ paddingVertical: space.xs }}>
            <ListRow icon="person" label="Your details" detail="Name and email" onPress={() => router.push('/account/profile')} />
            <ListRow icon="home" label="Saved addresses" detail={addresses ? `${addresses} saved` : 'Add your home or office'} onPress={() => router.push('/account/addresses')} />
            <ListRow icon="notifications" label="Notifications" onPress={() => router.push('/notifications')} />
            <ListRow icon="calendar" label="My bookings" onPress={() => router.push('/bookings')} last />
          </Card>
        ) : null}

        <Card style={{ paddingVertical: space.xs }}>
          <ListRow icon="location" label="Service area" detail={area ? `${area.place} · ${area.pincode}` : 'Not set'} onPress={() => router.push('/location')} />
          <ListRow icon="call" label="Call us" onPress={callSupport} />
          <ListRow icon="logo-whatsapp" label="Chat on WhatsApp" onPress={() => whatsappSupport()} />
          <ListRow icon="help-circle" label="Questions and answers" onPress={() => openPage('/faq')} last />
        </Card>

        <Card style={{ paddingVertical: space.xs }}>
          <ListRow icon="document-text" label="Terms" onPress={() => openPage('/terms')} />
          <ListRow icon="shield-checkmark" label="Privacy" onPress={() => openPage('/privacy')} />
          <ListRow icon="refresh-circle" label="Cancellation and refunds" onPress={() => openPage('/cancellation-and-refunds')} last />
        </Card>

        {customer ? (
          <>
            <Button
              label="Sign out"
              variant="outline"
              icon="log-out"
              onPress={() =>
                Alert.alert('Sign out?', 'You can sign in again with a code.', [
                  { text: 'Stay signed in', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: () => void session.signOut() },
                ])
              }
            />
            <Button label="Delete account" variant="ghost" onPress={confirmDelete} loading={remove.isPending} />
          </>
        ) : null}

        <AppText variant="caption" tone="muted" center>
          Pakka Fix {Constants.expoConfig?.version ?? ''} · Made in Hyderabad
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: space.lg, borderRadius: radius.sheet, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
