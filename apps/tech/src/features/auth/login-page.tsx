import { useRedirectWhenSignedIn } from '@servicepro/app-kit';
import { isApiError, session, useRequestLoginOtp, useVerifyLoginOtp, type AuthSession } from '@servicepro/api-client';
import { Alert, AuthLayout, Button, Card, Field, Heading, Input, OtpInput, Stack, TechnicianScene, Text } from '@servicepro/ui';
import { BellRing, Navigation, Phone, Wallet } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';

import { paths } from '../../app/paths';
import { rememberStatusPass } from './status-pass';

type Step = { kind: 'phone' } | { kind: 'code'; phone: string; length: number; developmentCode: string | null | undefined };

/**
 * Phone + one-time code (ADR 0005). Two short steps, numeric keyboards, SMS autofill. Someone who
 * has applied to be a partner and isn't approved yet gets a code too, and lands on their status page.
 */
export function LoginPage() {
  const redirectTo = useRedirectWhenSignedIn();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  // The last code sent: going back and choosing the same number again returns to it (no second code).
  const [lastSent, setLastSent] = useState<(Step & { kind: 'code' }) & { digits: string; at: number } | null>(null);
  // After "a code was just sent": when a new one may be asked for, counted down on the button.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  useEffect(() => {
    if (retryAt === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setWaitSeconds(left);
      if (left === 0) setRetryAt(null);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const requestOtp = useRequestLoginOtp({ mutation: { meta: { silent: true } } });
  const verifyOtp = useVerifyLoginOtp({ mutation: { meta: { silent: true } } });

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  function sendCode(event: FormEvent) {
    event.preventDefault();
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (lastSent && lastSent.digits === digits && Date.now() - lastSent.at < 4 * 60_000) {
      setStep(lastSent); // still valid
      return;
    }
    requestOtp.mutate(
      { data: { phone } },
      {
        onSuccess: (response) => {
          setCode('');
          const sent = { kind: 'code', phone, length: response.codeLength, developmentCode: response.developmentCode } as const;
          setStep(sent);
          setLastSent({ ...sent, digits, at: Date.now() });
        },
        onError: (failure) => {
          const seconds = isApiError(failure) && failure.code === 'otp.cooldown' ? Number(failure.detail('retryAfterSeconds') ?? 30) : 0;
          if (seconds > 0) setRetryAt(Date.now() + seconds * 1000);
        },
      },
    );
  }

  function verify(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'code') return;
    const phone = step.phone;
    verifyOtp.mutate(
      { data: { phone, code } },
      {
        onSuccess: (response) => session.set(response as AuthSession),
        onError: (failure) => {
          const pass = isApiError(failure) && failure.code === 'auth.partner_applicant' ? failure.detail('statusPass') : undefined;
          if (pass) {
            rememberStatusPass(phone.replace(/\D/g, '').slice(-10), pass);
            void navigate(paths.joinStatus);
          }
        },
      },
    );
  }

  const requestError = isApiError(requestOtp.error) ? requestOtp.error : null;
  const notRegistered = requestError?.code === 'auth.not_registered';
  const coolingDown = requestError?.code === 'otp.cooldown';
  const phoneError =
    !requestError || notRegistered
      ? undefined
      : coolingDown
        ? waitSeconds > 0
          ? `A code was just sent to this number. You can ask for a new one in ${waitSeconds}s.`
          : undefined
        : requestError.fieldError('phone') ?? requestError.message;
  const codeError = isApiError(verifyOtp.error) ? verifyOtp.error.message : undefined;

  return (
    <AuthLayout
      tagline="Partner app"
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
          <Text tone="secondary">Use your registered mobile number. Applied already? Sign in to see your application.</Text>
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
                  onChange={(event) => {
                    setPhone(event.target.value);
                    if (requestOtp.error) requestOtp.reset(); // a new number, a fresh start
                  }}
                  placeholder="98765 43210"
                />
              </Field>
              {notRegistered ? (
                <Alert
                  tone="warning"
                  title="This number isn't registered"
                  description="Check the number, or join as a partner. After you apply, sign in here to see your application."
                  action={
                    <Button asChild size="sm">
                      <Link to={paths.join}>Join as a partner</Link>
                    </Button>
                  }
                />
              ) : null}
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={requestOtp.isPending}
                disabled={phone.replace(/\D/g, '').length < 10 || (coolingDown && waitSeconds > 0)}
              >
                {coolingDown && waitSeconds > 0 ? `Send code in ${waitSeconds}s` : 'Send code'}
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <Stack gap={5}>
              <Field
                label={`Code sent to ${step.phone}`}
                error={codeError}
                hint={step.developmentCode ? `Test code: ${step.developmentCode}` : 'It can take a few seconds to arrive.'}
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
        <div className="mt-6 flex flex-col items-center gap-1 border-t border-border pt-5 text-center">
          <Text variant="sm" tone="secondary">
            New to Pakka Fix?
          </Text>
          <Button asChild variant="outline" fullWidth>
            <Link to={paths.join}>Join as a partner</Link>
          </Button>
        </div>
      </Card>
    </AuthLayout>
  );
}
