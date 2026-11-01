import { getPartnerApplicationStatus, isApiError, type PartnerApplicationStatusResponse } from '@servicepro/api-client';
import { Alert, AuthLayout, Button, Card, Heading, LoadingState, Stack, TechnicianScene, Text, cn, formatDate } from '@servicepro/ui';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, CalendarCheck, CheckCircle2, Hourglass, MapPin, Wallet, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';

import { paths } from '../../app/paths';
import { prefillJoinDraft } from './join-page';
import { readStatusPass } from './status-pass';

/*
 * "Where's my application?" An applicant lands here after signing in with a code while their
 * application is open: under review, turned down (with the reason, and a way to apply again) or,
 * if the office approved it a moment ago, approved.
 */

export function ApplicationStatusPage() {
  const pass = readStatusPass();
  const status = useQuery({
    queryKey: ['partner-application-status', pass?.phone],
    queryFn: () => getPartnerApplicationStatus({ phone: pass?.phone ?? '', verificationToken: pass?.token ?? '' }),
    enabled: pass !== null,
    retry: false,
    staleTime: 60_000,
  });

  if (!pass) {
    // The pass ran out (or this is a new tab): signing in again gives a new one.
    return <Navigate to={paths.login} replace />;
  }

  return (
    <AuthLayout
      tagline="Partner app"
      pitch="Grow your repair work with Pakka Fix."
      art={<TechnicianScene />}
      highlights={[
        { icon: MapPin, text: 'Jobs in the areas you choose' },
        { icon: CalendarCheck, text: 'Go on duty when it suits you' },
        { icon: Wallet, text: 'See every job and payment in the app' },
      ]}
    >
      <Card padding="lg" className="shadow-lg">
        {status.isPending ? (
          <LoadingState label="Checking your application…" />
        ) : status.isError ? (
          <Stack gap={4}>
            <Alert
              tone="error"
              title={isApiError(status.error) && status.error.status === 404 ? "We couldn't find an application for this number." : "Couldn't check your application right now."}
            />
            <Button asChild variant="outline" size="lg" fullWidth>
              <Link to={paths.login}>Back to sign in</Link>
            </Button>
          </Stack>
        ) : (
          <StatusView status={status.data} phone={pass.phone} token={pass.token} until={pass.until} />
        )}
      </Card>
    </AuthLayout>
  );
}

function StatusView({ status, phone, token, until }: { status: PartnerApplicationStatusResponse; phone: string; token: string; until: string }) {
  const navigate = useNavigate();
  const firstName = status.fullName.split(' ')[0] ?? status.fullName;
  const shown = `${phone.slice(0, 5)} ${phone.slice(5)}`;

  if (status.status === 'APPROVED') {
    return (
      <Stack gap={4}>
        <StatusIcon tone="success" icon={<BadgeCheck aria-hidden />} />
        <Heading level={1} size="h3">
          You're approved
        </Heading>
        <Text tone="secondary">Welcome to Pakka Fix, {firstName}. Sign in with your number to start taking jobs.</Text>
        <Button asChild size="lg" fullWidth>
          <Link to={paths.login}>Sign in</Link>
        </Button>
      </Stack>
    );
  }

  if (status.status === 'REJECTED') {
    const applyAgain = () => {
      // The pass proves the number, so the form starts verified with their name filled in.
      prefillJoinDraft({ name: status.fullName, phone: shown, verifiedPhone: phone, verificationToken: token, verifiedUntil: until });
      void navigate(paths.join);
    };
    return (
      <Stack gap={4}>
        <StatusIcon tone="error" icon={<XCircle aria-hidden />} />
        <Heading level={1} size="h3">
          Your application wasn't approved
        </Heading>
        <Text tone="secondary">
          Sorry, {firstName}. Our team reviewed the application you sent on {formatDate(status.submittedAt)}
          {status.reviewedAt ? ` and decided on ${formatDate(status.reviewedAt)}` : ''}.
        </Text>
        {status.rejectionReason ? <Alert tone="warning" title="Reason" description={status.rejectionReason} /> : null}
        <Text variant="sm" tone="secondary">
          If things have changed, for example more experience or a clearer ID photo, you can apply again.
        </Text>
        <Button size="lg" fullWidth onClick={applyAgain}>
          Apply again
        </Button>
        <Button asChild variant="ghost" fullWidth>
          <Link to={paths.login}>Back to sign in</Link>
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <StatusIcon tone="warning" icon={<Hourglass aria-hidden />} />
      <Heading level={1} size="h3">
        Your profile is under review
      </Heading>
      <Text tone="secondary">
        Thanks, {firstName}. We received your application on {formatDate(status.submittedAt)}, and our team is checking your details and documents.
      </Text>
      <ol className="flex flex-col gap-3" aria-label="Application progress">
        <Milestone state="done" title="Application sent" detail={formatDate(status.submittedAt)} />
        <Milestone state="current" title="Review by our team" detail="Usually within 2 working days" />
        <Milestone state="next" title="A call from us" detail="To talk about your work and check your ID" />
        <Milestone state="next" title="Approved" detail="Sign in and start taking jobs" />
      </ol>
      <Alert tone="info" title="We'll tell you on WhatsApp" description={`As soon as you're approved, we message ${shown}.`} />
      <Button asChild variant="outline" size="lg" fullWidth>
        <Link to={paths.login}>Back to sign in</Link>
      </Button>
    </Stack>
  );
}

function StatusIcon({ tone, icon }: { tone: 'success' | 'warning' | 'error'; icon: ReactNode }) {
  return (
    <span
      className={cn(
        'flex size-12 items-center justify-center rounded-full [&_svg]:size-6',
        tone === 'success' && 'bg-success-subtle text-success',
        tone === 'warning' && 'bg-warning-subtle text-warning',
        tone === 'error' && 'bg-error-subtle text-error',
      )}
    >
      {icon}
    </span>
  );
}

function Milestone({ state, title, detail }: { state: 'done' | 'current' | 'next'; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3" aria-current={state === 'current' ? 'step' : undefined}>
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 [&_svg]:size-4',
          state === 'done' && 'border-success bg-success text-[#fff]',
          state === 'current' && 'border-warning bg-warning-subtle',
          state === 'next' && 'border-border',
        )}
      >
        {state === 'done' ? <CheckCircle2 aria-hidden /> : state === 'current' ? <span className="size-2 rounded-full bg-warning" /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className={cn('text-sm font-semibold', state === 'next' ? 'text-foreground-muted' : 'text-foreground')}>
          {title}
          {state === 'current' ? <span className="sr-only"> (in progress)</span> : null}
        </span>
        <span className="text-caption text-foreground-muted">{detail}</span>
      </span>
    </li>
  );
}
