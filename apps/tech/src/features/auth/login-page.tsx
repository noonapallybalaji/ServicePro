import { useRedirectWhenSignedIn } from '@servicepro/app-kit';
import { isApiError, session, useRequestLoginOtp, useVerifyLoginOtp, type AuthSession } from '@servicepro/api-client';
import { AuthLayout, Button, Card, Field, Heading, Input, OtpInput, Stack, TechnicianScene, Text } from '@servicepro/ui';
import { BellRing, Navigation, Phone, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';

type Step = { kind: 'phone' } | { kind: 'code'; phone: string; length: number; developmentCode: string | null | undefined };

/** Phone + one-time code (ADR 0005). Two short steps, numeric keyboards, SMS autofill. */
export function LoginPage() {
  const redirectTo = useRedirectWhenSignedIn();
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const requestOtp = useRequestLoginOtp({ mutation: { meta: { silent: true } } });
  const verifyOtp = useVerifyLoginOtp({ mutation: { meta: { silent: true } } });

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
    requestOtp.mutate(
      { data: { phone } },
      {
        onSuccess: (response) => {
          setCode('');
          setStep({ kind: 'code', phone, length: response.codeLength, developmentCode: response.developmentCode });
        },
      },
    );
  }

  function verify(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'code') return;
    verifyOtp.mutate({ data: { phone: step.phone, code } }, { onSuccess: (response) => session.set(response as AuthSession) });
  }

  const phoneError = isApiError(requestOtp.error) ? requestOtp.error.fieldError('phone') ?? requestOtp.error.message : undefined;
  const codeError = isApiError(verifyOtp.error) ? verifyOtp.error.message : undefined;

  return (
    <AuthLayout
      tagline="Technician app"
      pitch="Your jobs, directions and earnings — in one place."
      art={<TechnicianScene />}
      highlights={[
        { icon: BellRing, text: 'New job offers arrive instantly' },
        { icon: Navigation, text: 'One tap to call or navigate' },
        { icon: Wallet, text: 'See what you have earned today' },
      ]}
    >
      <Card padding="lg" className="shadow-lg">
        <div className="mb-6 flex flex-col gap-1">
          <Heading level={1} size="h2">
            Sign in
          </Heading>
          <Text tone="secondary">Use the mobile number the office registered for you.</Text>
        </div>
        {step.kind === 'phone' ? (
          <form onSubmit={sendCode} noValidate>
            <Stack gap={5}>
              <Field label="Mobile number" error={phoneError} hint="We'll send a 6-digit code by SMS.">
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  leadingIcon={Phone}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98765 43210"
                />
              </Field>
              <Button type="submit" size="lg" fullWidth loading={requestOtp.isPending} disabled={phone.replace(/\D/g, '').length < 10}>
                Send code
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <Stack gap={5}>
              <Field
                label={`Code sent to ${step.phone}`}
                error={codeError}
                hint={step.developmentCode ? `Development code: ${step.developmentCode}` : 'It can take a few seconds to arrive.'}
              >
                <OtpInput length={step.length} value={code} onValueChange={setCode} />
              </Field>
              <Button type="submit" size="lg" fullWidth loading={verifyOtp.isPending} disabled={code.length !== step.length}>
                Sign in
              </Button>
              <Button variant="ghost" onClick={() => setStep({ kind: 'phone' })}>
                Use a different number
              </Button>
            </Stack>
          </form>
        )}
      </Card>
    </AuthLayout>
  );
}
