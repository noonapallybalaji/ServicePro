import {
  isApiError,
  useRequestCustomerSignInCode,
  useSession,
  useVerifyCustomerSignIn,
} from '@servicepro/api-client';
import {
  Button,
  Card,
  Container,
  EmptyState,
  Field,
  Heading,
  Input,
  OtpInput,
  Skeleton,
  SpotArt,
  Text,
} from '@servicepro/ui';
import { CalendarCheck, Phone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { PolicyNotice } from '../../components/policy-notice';
import { SiteLayout } from '../../components/site-layout';
import { customerFrom, signInWith } from '../../customer-session';
import { usePageMeta } from '../../seo/head';
import { PAGES } from '../../seo/pages';
import { AccountView } from './account-view';

/**
 * "My bookings": order history, saved addresses and contact details. Customers are signed in
 * automatically when they book; this page also lets a returning customer sign in with a code.
 */
export function AccountPage() {
  usePageMeta(PAGES.account);
  const state = useSession();
  const customer = customerFrom(state);

  return (
    <SiteLayout>
      <Container className="py-6 md:py-10">
        {state.status === 'unknown' ? (
          <div className="flex flex-col gap-4" aria-busy>
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-[10rem] w-full rounded-card" />
          </div>
        ) : customer ? (
          <AccountView fullName={customer.fullName} />
        ) : (
          <SignIn />
        )}
      </Container>
    </SiteLayout>
  );
}

/* ── Signed out: phone + code ───────────────────────────────────────────── */

function SignIn() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const requestCode = useRequestCustomerSignInCode({ mutation: { meta: { silent: true } } });
  const verify = useVerifyCustomerSignIn({ mutation: { meta: { silent: true } } });

  function send(event: FormEvent) {
    event.preventDefault();
    requestCode.mutate(
      { data: { phone } },
      {
        onSuccess: (response) => {
          setCode('');
          setSent({ phone, length: response.codeLength, developmentCode: response.developmentCode });
        },
      },
    );
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    if (!sent) return;
    verify.mutate({ data: { phone: sent.phone, code, acceptedPolicies: true } }, { onSuccess: signInWith });
  }

  const noAccount = isApiError(verify.error) && verify.error.status === 404;
  const error = isApiError(requestCode.error)
    ? (requestCode.error.fieldError('phone') ?? requestCode.error.message)
    : isApiError(verify.error) && !noAccount
      ? verify.error.message
      : undefined;

  return (
    <div className="mx-auto flex max-w-dialog flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <Heading level={1}>My bookings</Heading>
        <Text tone="secondary">Sign in with the mobile number you booked with. We'll text you a code.</Text>
      </div>
      <Card padding="lg" className="flex flex-col gap-5">
        {noAccount ? (
          <EmptyState
            size="compact"
            icon={CalendarCheck}
            illustration={<SpotArt kind="calendar" />}
            title="No bookings for this number yet"
            description="Book a repair and you'll be signed in automatically — no password needed."
            action={
              <Button asChild>
                <Link to="/book">Book a repair</Link>
              </Button>
            }
          />
        ) : sent ? (
          <form onSubmit={confirm} className="flex flex-col gap-5" noValidate>
            <Field
              label={`Code sent to ${sent.phone}`}
              error={error}
              hint={sent.developmentCode ? `Development code: ${sent.developmentCode}` : 'It can take a few seconds to arrive.'}
            >
              <OtpInput length={sent.length} value={code} onValueChange={setCode} />
            </Field>
            <PolicyNotice action="signing in" />
            <Button type="submit" size="lg" fullWidth loading={verify.isPending} disabled={code.length !== sent.length}>
              Sign in
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSent(null)}>
              Use a different number
            </Button>
          </form>
        ) : (
          <form onSubmit={send} className="flex flex-col gap-5" noValidate>
            <Field label="Mobile number" error={error}>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                leadingIcon={Phone}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Button type="submit" size="lg" fullWidth loading={requestCode.isPending} disabled={phone.replace(/\D/g, '').length < 10}>
              Send code
            </Button>
          </form>
        )}
      </Card>
      <Text variant="sm" tone="secondary" className="text-center">
        New here?{' '}
        <Link to="/book" className="link">
          Book a repair
        </Link>{' '}
        — you'll be signed in when you confirm your number.
      </Text>
    </div>
  );
}
