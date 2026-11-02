import { isApiError, useRequestCustomerSignInCode, useVerifyCustomerSignIn } from '@servicepro/api-client';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Appear, success } from '@/components/motion';
import { AppText, Button, CodeInput, Field, IconCircle, Input, Notice } from '@/components/ui';
import { mobileDigits, prettyPhone } from '@/lib/format';
import { signInWith } from '@/lib/session';
import { colors, space } from '@/lib/theme';

/** "My bookings" sign-in: the number used to book, then the code sent to it. */
export default function SignInScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const requestCode = useRequestCustomerSignInCode({ mutation: { meta: { silent: true } } });
  const verify = useVerifyCustomerSignIn({ mutation: { meta: { silent: true } } });
  const digits = mobileDigits(phone);
  const sendError = isApiError(requestCode.error) ? requestCode.error : null;
  const verifyError = isApiError(verify.error) ? verify.error : null;
  const noAccount = verifyError?.code === 'customer_auth.no_account';

  function sendCode() {
    if (!digits) return;
    setCode('');
    verify.reset();
    requestCode.mutate(
      { data: { phone: digits } },
      { onSuccess: (response) => setSent({ phone: digits, length: response.codeLength, developmentCode: response.developmentCode }) },
    );
  }

  function signIn() {
    if (!sent) return;
    verify.mutate(
      { data: { phone: sent.phone, code, acceptedPolicies: true } },
      {
        onSuccess: (response) => {
          success();
          signInWith(response);
          router.back();
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }} keyboardShouldPersistTaps="handled">
        <Appear style={{ gap: space.md }}>
          <IconCircle name={sent ? 'chatbox-ellipses' : 'phone-portrait'} size={56} />
          <AppText variant="display">{sent ? 'Enter the code' : 'Sign in'}</AppText>
          <AppText tone="secondary">
            {sent ? `We sent a ${sent.length}-digit code to ${prettyPhone(sent.phone)}.` : 'Use the mobile number you booked with to see your bookings.'}
          </AppText>
        </Appear>

        {!sent ? (
          <Appear index={1} style={{ gap: space.lg }}>
            <Field label="Mobile number" error={sendError?.fieldError('phone') ?? sendError?.message}>
              <Input
                icon="call"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                maxLength={16}
                placeholder="98765 43210"
                autoFocus
              />
            </Field>
            <Button label="Send code" trailingIcon="arrow-forward" onPress={sendCode} loading={requestCode.isPending} disabled={!digits} />
          </Appear>
        ) : (
          <Animated.View entering={FadeIn} style={{ gap: space.lg }}>
            <Field label="Code" error={noAccount ? undefined : verifyError?.message} hint={sent.developmentCode ? `Test code: ${sent.developmentCode}` : 'It can take a few seconds to arrive.'}>
              <CodeInput length={sent.length} value={code} onChange={setCode} />
            </Field>
            {noAccount ? (
              <Notice
                tone="warning"
                title="No bookings with this number yet"
                description="Book your first repair: your number is verified as you book, and you're signed in."
                action={<Button small label="Book a repair" onPress={() => router.replace('/book')} />}
              />
            ) : null}
            <Button label="Sign in" onPress={signIn} loading={verify.isPending} disabled={code.length !== sent.length} />
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <Button small label="Use a different number" variant="ghost" onPress={() => setSent(null)} />
            </View>
            <AppText variant="caption" tone="muted" center>
              By signing in you agree to the Pakka Fix terms and privacy policy.
            </AppText>
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
