import {
  getGetMyAccountQueryKey,
  isApiError,
  session,
  useChangeMyPhone,
  useRequestPhoneChangeCode,
  useUpdateMyAccount,
  type AccountResponse,
} from '@servicepro/api-client';
import { Alert, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, OtpInput, Text, getInitials } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, Mail, Phone, UserRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

/*
 * Profile, in the usual account-settings shape: one row per detail with its own Edit / Change / Add,
 * each opening a small sheet. The mobile number is the sign-in, so changing it is proven with a code
 * sent to the new number. After any change the session is refreshed, so the header and booking show
 * the new details straight away.
 */

type Sheet = 'name' | 'email' | 'phone' | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[6-9][0-9]{9}$/;

export function ProfileCard({ account }: { account: AccountResponse }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const done = (message: string) => {
    setSheet(null);
    setNotice(message);
    void session.refresh(); // the header avatar and "Booking as" read the session
  };

  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-body-lg font-bold text-primary-foreground">
          {getInitials(account.fullName) || '?'}
        </span>
        <div className="flex min-w-0 flex-col">
          <Text weight="semibold" className="truncate">
            {account.fullName}
          </Text>
          <Text variant="sm" tone="secondary">
            Your details
          </Text>
        </div>
      </div>

      {notice ? <Alert tone="success" title={notice} role="status" /> : null}

      <dl className="flex flex-col divide-y divide-border rounded-card border border-border">
        <DetailRow icon={<UserRound aria-hidden />} label="Name" value={account.fullName} action="Edit" onAction={() => setSheet('name')} />
        <DetailRow
          icon={<Phone aria-hidden />}
          label="Mobile number"
          value={<span className="tabular-nums">{account.phone}</span>}
          note="You sign in with this number"
          action="Change"
          onAction={() => setSheet('phone')}
        />
        <DetailRow
          icon={<Mail aria-hidden />}
          label="Email"
          value={account.email ?? <span className="text-foreground-muted">Not added</span>}
          note="Optional"
          action={account.email ? 'Edit' : 'Add'}
          onAction={() => setSheet('email')}
        />
      </dl>

      {sheet === 'name' ? <NameSheet account={account} onClose={() => setSheet(null)} onDone={() => done('Name updated.')} /> : null}
      {sheet === 'email' ? <EmailSheet account={account} onClose={() => setSheet(null)} onDone={(removed) => done(removed ? 'Email removed.' : 'Email saved.')} /> : null}
      {sheet === 'phone' ? <PhoneSheet account={account} onClose={() => setSheet(null)} onDone={() => done('Mobile number changed. Sign in with the new number from now on.')} /> : null}
    </Card>
  );
}

function DetailRow({ icon, label, value, note, action, onAction }: { icon: ReactNode; label: string; value: ReactNode; note?: string; action: string; onAction: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary [&_svg]:size-4">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-caption text-foreground-secondary">{label}</dt>
        <dd className="truncate text-sm font-semibold text-foreground">{value}</dd>
        {note ? <span className="text-caption text-foreground-muted">{note}</span> : null}
      </div>
      <Button size="sm" variant="outline" onClick={onAction} className="shrink-0" aria-label={`${action} ${label.toLowerCase()}`}>
        {action}
      </Button>
    </div>
  );
}

/** Name and email are saved together by the API; each sheet sends the other one unchanged. */
function useSaveDetails(onSaved: () => void) {
  const queryClient = useQueryClient();
  return useUpdateMyAccount({
    mutation: {
      meta: { silent: true },
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetMyAccountQueryKey(), updated);
        onSaved();
      },
    },
  });
}

function NameSheet({ account, onClose, onDone }: { account: AccountResponse; onClose: () => void; onDone: () => void }) {
  const [fullName, setFullName] = useState(account.fullName);
  const save = useSaveDetails(onDone);
  const ready = fullName.trim().length > 0 && fullName.trim() !== account.fullName;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) save.mutate({ data: { fullName: fullName.trim(), email: account.email ?? null } });
  }

  return (
    <SheetForm title="Edit name" onClose={onClose} onSubmit={submit} submitLabel="Save" loading={save.isPending} disabled={!ready}>
      <Field label="Name" hint="As you'd like the technician to address you." error={isApiError(save.error) ? (save.error.fieldError('fullName') ?? save.error.message) : undefined}>
        <Input autoComplete="name" maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
    </SheetForm>
  );
}

function EmailSheet({ account, onClose, onDone }: { account: AccountResponse; onClose: () => void; onDone: (removed: boolean) => void }) {
  const [email, setEmail] = useState(account.email ?? '');
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState(false);
  const save = useSaveDetails(() => onDone(removing));
  const valid = EMAIL.test(email.trim());
  const error = touched && !valid ? 'Enter a valid email address, like name@example.com.' : isApiError(save.error) ? (save.error.fieldError('email') ?? save.error.message) : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (valid) save.mutate({ data: { fullName: account.fullName, email: email.trim() } });
  }

  return (
    <SheetForm
      title={account.email ? 'Edit email' : 'Add email'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Save"
      loading={save.isPending && !removing}
      disabled={email.trim() === (account.email ?? '')}
      extra={
        account.email ? (
          <Button
            type="button"
            variant="ghost"
            className="text-error"
            loading={save.isPending && removing}
            onClick={() => {
              setRemoving(true);
              save.mutate({ data: { fullName: account.fullName, email: null } });
            }}
          >
            Remove email
          </Button>
        ) : null
      }
    >
      <Field label="Email" hint="Optional. We use it only to send you bills and receipts." error={error}>
        <Input type="email" inputMode="email" autoComplete="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} />
      </Field>
    </SheetForm>
  );
}

/** Two steps: the new number, then the code sent to it. "Change number" goes back at any time. */
function PhoneSheet({ account, onClose, onDone }: { account: AccountResponse; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const requestCode = useRequestPhoneChangeCode({
    mutation: {
      meta: { silent: true },
      onSuccess: (response) => {
        setCode('');
        setSent({ phone, length: response.codeLength, developmentCode: response.developmentCode });
      },
    },
  });
  const change = useChangeMyPhone({
    mutation: {
      meta: { silent: true },
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetMyAccountQueryKey(), updated);
        onDone();
      },
    },
  });
  const digits = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const requestError = isApiError(requestCode.error) ? (requestCode.error.fieldError('phone') ?? requestCode.error.message) : undefined;
  const changeError = isApiError(change.error) ? change.error.message : undefined;

  if (!sent) {
    return (
      <SheetForm
        title="Change mobile number"
        onClose={onClose}
        onSubmit={(event) => {
          event.preventDefault();
          if (PHONE.test(digits)) requestCode.mutate({ data: { phone } });
        }}
        submitLabel="Send code"
        loading={requestCode.isPending}
        disabled={!PHONE.test(digits)}
      >
        <Text variant="sm" tone="secondary">
          Your current number is <span className="font-semibold text-foreground tabular-nums">{account.phone}</span>. We'll send a code to the new number to check it's yours.
        </Text>
        <Field label="New mobile number" error={requestError}>
          <Input type="tel" inputMode="numeric" autoComplete="tel-national" leadingIcon={Phone} placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </SheetForm>
    );
  }

  return (
    <SheetForm
      title="Enter the code"
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        if (code.length === sent.length) change.mutate({ data: { phone: sent.phone, code } });
      }}
      submitLabel="Verify and change"
      submitIcon={<CircleCheck aria-hidden />}
      loading={change.isPending}
      disabled={code.length !== sent.length}
      extra={
        <Button type="button" variant="ghost" loading={requestCode.isPending} onClick={() => requestCode.mutate({ data: { phone: sent.phone } })}>
          Resend code
        </Button>
      }
    >
      <button type="button" onClick={() => setSent(null)} className="link inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Change number
      </button>
      <Text variant="sm" tone="secondary">
        We sent a {sent.length}-digit code to <span className="font-semibold text-foreground tabular-nums">{sent.phone}</span>.
      </Text>
      <Field label="Code" hint={sent.developmentCode ? `Development code: ${sent.developmentCode}` : 'It can take a few seconds to arrive.'}>
        <OtpInput length={sent.length} value={code} onValueChange={setCode} />
      </Field>
      {changeError ? <Alert role="alert" tone="error" title={changeError} /> : null}
    </SheetForm>
  );
}

/** A sheet whose fields scroll and whose buttons always stay on screen. */
function SheetForm({
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitIcon,
  loading,
  disabled,
  extra,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  submitIcon?: ReactNode;
  loading: boolean;
  disabled: boolean;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent presentation="sheet" aria-describedby={undefined}>
        <DialogHeader title={title} />
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-4">{children}</DialogBody>
          <DialogFooter>
            {extra}
            <Button type="submit" loading={loading} disabled={disabled}>
              {submitIcon}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
