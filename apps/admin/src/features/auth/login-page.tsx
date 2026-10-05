import { useRedirectWhenSignedIn } from '@servicepro/app-kit';
import { isApiError, session, useLoginWithPassword, type AuthSession } from '@servicepro/api-client';
import { Alert, Button, Card, Field, Heading, Input, Stack, Text } from '@servicepro/ui';
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
    <main id="main" className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-2 text-center">
          <Heading level={1} size="h2">
            ServicePro
          </Heading>
          <Text tone="secondary">Sign in to run today's jobs.</Text>
        </div>
        <Card padding="lg">
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
      </div>
    </main>
  );
}
