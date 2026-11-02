import { getGetMyAccountQueryKey, isApiError, useGetMyAccount, useUpdateMyAccount } from '@servicepro/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Skeleton, success } from '@/components/motion';
import { AppText, BottomBar, Button, Field, Input, Notice } from '@/components/ui';
import { prettyPhone } from '@/lib/format';
import { colors, space } from '@/lib/theme';

/** Name and email. The phone number is how they sign in, so it changes through the website's verified flow. */
export default function ProfileScreen() {
  const account = useGetMyAccount();
  if (!account.data) {
    return (
      <View style={{ padding: space.lg, gap: space.lg }}>
        <Skeleton height={72} />
        <Skeleton height={72} />
      </View>
    );
  }
  return <ProfileForm initialName={account.data.fullName} initialEmail={account.data.email ?? ''} phone={account.data.phone} />;
}

function ProfileForm({ initialName, initialEmail, phone }: { initialName: string; initialEmail: string; phone: string }) {
  const queryClient = useQueryClient();
  const update = useUpdateMyAccount({ mutation: { meta: { silent: true } } });
  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);

  const emailOk = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const error = isApiError(update.error) ? update.error : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Field label="Full name" error={error?.fieldError('fullName')}>
          <Input icon="person" value={fullName} onChangeText={setFullName} maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Email" optional hint="For invoices and receipts." error={!emailOk ? 'Check the email address.' : error?.fieldError('email')}>
          <Input icon="mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={200} />
        </Field>
        <Field label="Mobile number" hint="You sign in with this number. To change it, use My bookings on our website.">
          <Input icon="call" value={prettyPhone(phone)} editable={false} />
        </Field>
        {error && !error.fieldError('fullName') && !error.fieldError('email') ? <Notice tone="error" title={error.message} /> : null}
        {update.isSuccess ? <Notice tone="success" title="Saved" /> : null}
        <AppText variant="caption" tone="muted">
          We use your details only for your bookings.
        </AppText>
      </ScrollView>
      <BottomBar>
        <Button
          label="Save"
          disabled={fullName.trim().length < 2 || !emailOk}
          loading={update.isPending}
          onPress={() =>
            update.mutate(
              { data: { fullName: fullName.trim(), email: email.trim() || null } },
              {
                onSuccess: () => {
                  success();
                  void queryClient.invalidateQueries({ queryKey: getGetMyAccountQueryKey() });
                  router.back();
                },
              },
            )
          }
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
