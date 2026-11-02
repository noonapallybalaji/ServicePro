import { session } from '@servicepro/api-client';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { AppText, Button, Card, Ionicons, type IconName } from '@/components/ui';
import { config } from '@/lib/config';
import { callSupport, prettyPhone, whatsappSupport } from '@/lib/format';
import { useCustomer } from '@/lib/session';
import { colors, space } from '@/lib/theme';

export default function AccountScreen() {
  const { customer } = useCustomer();
  const openPage = (path: string) => void WebBrowser.openBrowserAsync(`${config.siteUrl}${path}`);

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
      {customer ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="h2" tone="inverse">
              {customer.fullName.slice(0, 1).toUpperCase()}
            </AppText>
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="h3">{customer.fullName}</AppText>
            <AppText variant="small" tone="secondary">
              {prettyPhone(customer.phone)}
            </AppText>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: space.md }}>
          <AppText variant="h3">Welcome to Pakka Fix</AppText>
          <AppText variant="small" tone="secondary">
            Sign in with the number you booked with to follow your repairs.
          </AppText>
          <Button label="Sign in" onPress={() => router.push('/sign-in')} />
        </Card>
      )}

      <Card style={{ paddingVertical: space.xs }}>
        <Item icon="call" label="Call us" onPress={callSupport} />
        <Item icon="logo-whatsapp" label="Chat on WhatsApp" onPress={() => whatsappSupport()} />
        <Item icon="help-circle" label="Questions and answers" onPress={() => openPage('/faq')} />
        <Item icon="document-text" label="Terms" onPress={() => openPage('/terms')} />
        <Item icon="shield-checkmark" label="Privacy" onPress={() => openPage('/privacy')} />
        <Item icon="refresh-circle" label="Cancellation and refunds" onPress={() => openPage('/cancellation-and-refunds')} last />
      </Card>

      {customer ? (
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
      ) : null}

      <AppText variant="caption" tone="muted" center>
        Pakka Fix {Constants.expoConfig?.version ?? ''}
      </AppText>
    </ScrollView>
  );
}

function Item({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 52,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}
