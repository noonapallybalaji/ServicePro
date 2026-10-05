import { useRedirectWhenSignedIn } from '@servicepro/app-kit';
import { isApiError, session, useLoginWithPassword, type AuthSession } from '@servicepro/api-client';
import { Alert, AuthLayout, Button, Card, Field, Heading, Input, Stack, TechnicianScene, Text } from '@servicepro/ui';
import { LayoutDashboard, Radio, ReceiptIndianRupee } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';

/** Staff sign-in (ADR 0005): email + password, session kept by an HttpOnly refresh cookie. */
export function LoginPage() {
  const redirectTo = useRedirectWhenSignedIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLoginWithPassword({ mutation: { meta: { silent: true } } });

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ data: { email, password } }, { onSuccess: (response) => session.set(response as AuthSession) });
  }

  return (
    <AuthLayout
      tagline="Operations"
      pitch="Every request, technician and payment — live, on one screen."
      art={<TechnicianScene />}
      highlights={[
        { icon: LayoutDashboard, text: "See the whole day's board at a glance" },
        { icon: Radio, text: 'Dispatch to the best-matched technician' },
        { icon: ReceiptIndianRupee, text: 'Track bills and collections' },
      ]}
    >
      <Card padding="lg" className="shadow-lg">
        <div className="mb-6 flex flex-col gap-1">
          <Heading level={1} size="h2">
            Welcome back
          </Heading>
          <Text tone="secondary">Sign in to run today's jobs.</Text>
        </div>
        <form onSubmit={submit} noValidate>
          <Stack gap={5}>
            {login.isError ? (
              <Alert role="alert" tone="error" title={isApiError(login.error) ? login.error.message : "Couldn't sign in. Check your connection."} />
            ) : null}
            <Field label="Email">
              <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" size="lg" fullWidth loading={login.isPending} disabled={!email || !password}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Card>
    </AuthLayout>
  );
}
