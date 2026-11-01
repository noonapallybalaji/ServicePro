import {
  isApiError,
  useCheckServiceability,
  useGetActiveCatalog,
  useRequestPartnerCode,
  useSubmitTechnicianApplication,
  useUploadApplicantDocument,
  useVerifyPartnerPhone,
  type ApiError,
  type ApplicantDocumentKind,
} from '@servicepro/api-client';
import {
  Alert,
  AuthLayout,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Heading,
  Input,
  OtpInput,
  Spinner,
  Stack,
  Stepper,
  TechnicianScene,
  Text,
  Textarea,
  cn,
  formatDate,
} from '@servicepro/ui';
import { ArrowLeft, BadgeCheck, CalendarCheck, Camera, CheckCircle2, FileText, IdCard, MapPin, Pencil, Phone, Wallet, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { paths } from '../../app/paths';
import { shrinkImage } from '../../lib/shrink-image';
import { rememberStatusPass } from './status-pass';

/*
 * "Join as a partner", one short step at a time: about you (with the mobile number verified by a
 * one-time code) → address → skills → documents (profile photo, Aadhaar, PAN) → review and send.
 * Each step moves on only when it's complete. The step is in the address (?step=) so the phone's
 * back button goes back a step, and the answers are kept for this visit (a refresh or a slip of the
 * back button doesn't lose them). Documents upload as soon as they're chosen. The office reviews the
 * application and calls them; once approved they sign in with this number, and until then signing
 * in shows where the application stands.
 */

const STEPS = [
  { id: 'you', label: 'About you' },
  { id: 'address', label: 'Address' },
  { id: 'skills', label: 'Skills' },
  { id: 'documents', label: 'Documents' },
  { id: 'review', label: 'Review' },
] as const;

const EXPERIENCE: { label: string; years: number }[] = [
  { label: 'Under 1 year', years: 0 },
  { label: '1–3 years', years: 2 },
  { label: '3–5 years', years: 4 },
  { label: '5–10 years', years: 7 },
  { label: '10+ years', years: 10 },
];

const PINCODE = /^[1-9]\d{5}$/;
const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
const MINIMUM_AGE = 18;
/** The API refuses a new code for this long after the last one. */
const RESEND_AFTER_SECONDS = 30;
const DRAFT_KEY = 'pakkafix.partner.join';

interface UploadedDocument {
  token: string;
  fileName: string;
}

interface Draft {
  name: string;
  /** yyyy-mm-dd */
  dob: string;
  phone: string;
  addressLine: string;
  pincode: string;
  locality: string;
  appliances: string[];
  experience: number | null;
  aadhaar: string;
  pan: string;
  documents: Partial<Record<ApplicantDocumentKind, UploadedDocument>>;
  about: string;
  /** The number the code was verified for, and the proof the application carries (valid an hour). */
  verifiedPhone: string | null;
  verificationToken: string | null;
  verifiedUntil: string | null;
}

const EMPTY: Draft = {
  name: '',
  dob: '',
  phone: '',
  addressLine: '',
  pincode: '',
  locality: '',
  appliances: [],
  experience: null,
  aadhaar: '',
  pan: '',
  documents: {},
  about: '',
  verifiedPhone: null,
  verificationToken: null,
  verifiedUntil: null,
};

/** Verified, for this exact number, and the proof hasn't run out. */
const isVerified = (draft: Draft) =>
  draft.verificationToken !== null &&
  draft.verifiedPhone === mobileDigits(draft.phone) &&
  draft.verifiedUntil !== null &&
  Date.parse(draft.verifiedUntil) > Date.now() + 60_000;

/** "+91 98765-43210", "098765 43210" → "9876543210"; null unless it's a 10-digit Indian mobile number. */
function mobileDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const pretty = (digits: string) => `${digits.slice(0, 5)} ${digits.slice(5)}`;

/** Whole years since a yyyy-mm-dd birthday; null when it isn't a date. */
function ageOf(dob: string): number | null {
  const born = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!born) return null;
  const [year, month, day] = [Number(born[1]), Number(born[2]), Number(born[3])];
  const today = new Date();
  const age = today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
  return Number.isFinite(age) ? age : null;
}

const dobOk = (dob: string) => {
  const age = ageOf(dob);
  return age !== null && age >= MINIMUM_AGE && age <= 80;
};

/** The latest birthday that is old enough, for the date picker. */
function latestBirthday(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - MINIMUM_AGE);
  return date.toISOString().slice(0, 10);
}

// Verhoeff tables: the last Aadhaar digit is a checksum, so most typos are caught here.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const aadhaarDigits = (raw: string) => raw.replace(/\D/g, '');

function aadhaarOk(raw: string): boolean {
  const digits = aadhaarDigits(raw);
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let check = 0;
  [...digits].reverse().forEach((digit, i) => {
    check = VERHOEFF_D[check]?.[VERHOEFF_P[i % 8]?.[Number(digit)] ?? 0] ?? -1;
  });
  return check === 0;
}

/** "234567890124" → "2345 6789 0124" while typing. */
const groupAadhaar = (raw: string) => aadhaarDigits(raw).slice(0, 12).replace(/(\d{4})(?=\d)/g, '$1 ');

function loadDraft(): Draft {
  try {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    return saved ? { ...EMPTY, ...(JSON.parse(saved) as Partial<Draft>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveDraft(draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode: the form still works, it just isn't kept across a refresh.
  }
}

/** Starts a fresh application with some answers already in (applying again after a refusal). */
export function prefillJoinDraft(patch: Partial<Draft>) {
  saveDraft({ ...EMPTY, ...patch });
}

/** Which step an error from the server belongs to. */
function stepOf(error: ApiError): number {
  if (
    error.code === 'application.already_partner' ||
    error.code === 'application.phone_unverified' ||
    error.code === 'application.age' ||
    error.code === 'phone.invalid' ||
    error.fieldError('fullName') ||
    error.fieldError('phone') ||
    error.fieldError('dateOfBirth')
  )
    return 0;
  if (error.fieldError('pincode') || error.fieldError('locality') || error.fieldError('addressLine')) return 1;
  if (error.code === 'application.category_invalid' || error.fieldError('categoryIds') || error.fieldError('experienceYears')) return 2;
  if (
    error.code === 'application.documents_missing' ||
    error.code === 'application.document_invalid' ||
    error.fieldError('aadhaarNumber') ||
    error.fieldError('pan')
  )
    return 3;
  return 4;
}

export function JoinPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = Math.min(Math.max(Number(params.get('step') ?? 0) || 0, 0), STEPS.length - 1);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [agreed, setAgreed] = useState(false);
  const [trap, setTrap] = useState(''); // hidden from people; bots fill it in
  const submit = useSubmitTechnicianApplication({ mutation: { meta: { silent: true } } });

  useEffect(() => saveDraft(draft), [draft]);

  // A function patch reads the latest answers (two quick taps both count).
  const update = (patch: Patch) => setDraft((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
  // Forward pushes a history entry (the back button returns); jumping back to edit replaces it.
  const go = (to: number, replace = false) => setParams(to === 0 ? {} : { step: String(to) }, { replace });
  const error = isApiError(submit.error) ? submit.error : null;
  const unverified = () => {
    update({ verificationToken: null, verifiedPhone: null, verifiedUntil: null });
    go(0, true);
  };

  function send() {
    const phone = mobileDigits(draft.phone);
    if (!phone || draft.experience === null) return;
    submit.mutate(
      {
        data: {
          fullName: draft.name.trim(),
          phone,
          dateOfBirth: draft.dob,
          addressLine: draft.addressLine.trim(),
          pincode: draft.pincode,
          locality: draft.locality.trim() || null,
          categoryIds: draft.appliances,
          experienceYears: draft.experience,
          aadhaarNumber: aadhaarDigits(draft.aadhaar),
          pan: draft.pan.trim() || null,
          documents: Object.values(draft.documents).map((document) => document.token),
          about: draft.about.trim() || null,
          verificationToken: draft.verificationToken,
          website: trap || null,
        },
      },
      {
        onSuccess: () => saveDraft(null),
        onError: (failure) => {
          if (!isApiError(failure)) return;
          // The proof ran out (a long break): verify the number again.
          if (failure.code === 'application.phone_unverified') update({ verificationToken: null, verifiedPhone: null, verifiedUntil: null });
          // Uploads last a day: add the photos again.
          if (failure.code === 'application.document_invalid') update({ documents: {} });
          if (stepOf(failure) < 4) go(stepOf(failure), true);
        },
      },
    );
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
        {submit.isSuccess ? (
          <Received alreadyApplied={submit.data.alreadyApplied} phone={mobileDigits(draft.phone) ?? draft.phone} />
        ) : (
          <Stack gap={5}>
            <Heading level={1} size="h3">
              Join as a partner
            </Heading>
            <Stepper compact label="Application progress" steps={[...STEPS]} current={step} onStepClick={(to) => go(to, true)} />

            {error && stepOf(error) === step ? (
              <Alert
                tone="error"
                title={error.message}
                action={
                  error.code === 'application.already_partner' ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={paths.login}>Sign in</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : null}

            {step === 0 ? (
              <AboutYou
                draft={draft}
                update={update}
                error={error}
                onNext={() => go(1)}
                onPending={(phone, token) => {
                  rememberStatusPass(phone, token);
                  void navigate(paths.joinStatus);
                }}
              />
            ) : null}
            {step === 1 ? <YourAddress draft={draft} update={update} error={error} onNext={() => go(2)} onBack={() => go(0, true)} /> : null}
            {step === 2 ? <YourSkills draft={draft} update={update} onNext={() => go(3)} onBack={() => go(1, true)} /> : null}
            {step === 3 ? (
              <Documents draft={draft} update={update} error={error} onNext={() => go(4)} onBack={() => go(2, true)} onUnverified={unverified} />
            ) : null}
            {step === 4 ? (
              <Review
                draft={draft}
                update={update}
                agreed={agreed}
                onAgree={setAgreed}
                trap={trap}
                onTrap={setTrap}
                sending={submit.isPending}
                onEdit={(to) => go(to, true)}
                onSend={send}
              />
            ) : null}

            <Text variant="caption" tone="muted" className="text-center">
              Already applied or a partner?{' '}
              <Link to={paths.login} className="link">
                Sign in
              </Link>
            </Text>
          </Stack>
        )}
      </Card>
    </AuthLayout>
  );
}

type Patch = Partial<Draft> | ((current: Draft) => Partial<Draft>);

interface StepProps {
  draft: Draft;
  update: (patch: Patch) => void;
}

/** Each step is its own form, so Enter on the keyboard moves on. */
function StepForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form
      noValidate
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Stack gap={5}>{children}</Stack>
    </form>
  );
}

function Actions({ onBack, next, disabled, loading }: { onBack?: () => void; next: string; disabled?: boolean; loading?: boolean }) {
  return (
    <div className="flex gap-3 pt-1">
      {onBack ? (
        <Button type="button" variant="outline" size="lg" onClick={onBack} aria-label="Back to the previous step">
          <ArrowLeft aria-hidden />
        </Button>
      ) : null}
      <Button type="submit" size="lg" className="min-w-0 flex-1" disabled={disabled} loading={loading}>
        {next}
      </Button>
    </div>
  );
}

function AboutYou({
  draft,
  update,
  error,
  onNext,
  onPending,
}: StepProps & { error: ApiError | null; onNext: () => void; onPending: (phone: string, token: string) => void }) {
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ phone: string; length: number; developmentCode: string | null | undefined; at: number } | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  // Count down to when a new code may be sent.
  useEffect(() => {
    if (!sent) return;
    const tick = () => setWaitSeconds(Math.max(0, RESEND_AFTER_SECONDS - Math.floor((Date.now() - sent.at) / 1000)));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sent]);
  const requestCode = useRequestPartnerCode({ mutation: { meta: { silent: true } } });
  const verify = useVerifyPartnerPhone({ mutation: { meta: { silent: true } } });
  const nameOk = draft.name.trim().length >= 2;
  const bornOk = dobOk(draft.dob);
  const phone = mobileDigits(draft.phone);
  const verified = isVerified(draft);
  const codeFor = sent && sent.phone === phone ? sent : null; // a changed number needs a new code
  const sendError = isApiError(requestCode.error) ? requestCode.error : null;
  const verifyError = isApiError(verify.error) ? verify.error : null;
  const age = ageOf(draft.dob);
  const dobError = !touched
    ? undefined
    : !draft.dob
      ? 'Enter your date of birth.'
      : age !== null && age < MINIMUM_AGE
        ? `You need to be at least ${MINIMUM_AGE} to join.`
        : !bornOk
          ? 'Check your date of birth.'
          : undefined;

  function sendCode() {
    if (!nameOk || !bornOk || !phone) {
      setTouched(true);
      return;
    }
    setCode('');
    verify.reset();
    requestCode.mutate(
      { data: { phone } },
      {
        onSuccess: (response) => {
          setWaitSeconds(RESEND_AFTER_SECONDS);
          setSent({ phone, length: response.codeLength, developmentCode: response.developmentCode, at: Date.now() });
        },
      },
    );
  }

  function checkCode() {
    if (!phone || !codeFor || code.length !== codeFor.length) return;
    verify.mutate(
      { data: { phone, code } },
      {
        onSuccess: (response) => {
          if (response.hasPendingApplication) {
            // Already applied: show where that application stands instead of a second form.
            onPending(phone, response.verificationToken);
            return;
          }
          // Uploads belong to the number they were made for.
          update((current) => ({
            verifiedPhone: phone,
            verificationToken: response.verificationToken,
            verifiedUntil: response.expiresAt,
            documents: current.verifiedPhone === phone ? current.documents : {},
          }));
          onNext();
        },
      },
    );
  }

  return (
    <StepForm onSubmit={() => (verified && nameOk && bornOk ? onNext() : verified ? setTouched(true) : codeFor ? checkCode() : sendCode())}>
      <Field label="Full name" error={(touched && !nameOk ? 'Enter your full name.' : undefined) ?? error?.fieldError('fullName')}>
        <Input autoComplete="name" value={draft.name} maxLength={200} onChange={(e) => update({ name: e.target.value })} placeholder="As on your Aadhaar card" />
      </Field>
      <Field label="Date of birth" error={dobError ?? error?.fieldError('dateOfBirth')}>
        <Input type="date" autoComplete="bday" value={draft.dob} max={latestBirthday()} min="1940-01-01" onChange={(e) => update({ dob: e.target.value })} />
      </Field>
      <Field
        label="Mobile number"
        hint={verified ? undefined : "We'll send a code to check it's yours. Once approved, you sign in with it."}
        error={(touched && !phone ? 'Enter a 10-digit mobile number.' : undefined) ?? sendError?.fieldError('phone') ?? error?.fieldError('phone')}
      >
        <Input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leadingIcon={Phone}
          value={draft.phone}
          maxLength={16}
          onChange={(e) => update({ phone: e.target.value })}
          onBlur={() => phone && update({ phone: pretty(phone) })}
          placeholder="98765 43210"
        />
      </Field>
      {verified ? (
        <Badge tone="success" className="-mt-3 self-start">
          <BadgeCheck aria-hidden className="size-4" /> Number verified
        </Badge>
      ) : null}

      {sendError && !sendError.fieldError('phone') ? (
        <Alert
          tone="error"
          title={sendError.message}
          action={
            sendError.code === 'application.already_partner' ? (
              <Button asChild size="sm" variant="outline">
                <Link to={paths.login}>Sign in</Link>
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {!verified && codeFor ? (
        <Field
          label={`Code sent to ${pretty(codeFor.phone)}`}
          error={verifyError?.message}
          hint={codeFor.developmentCode ? `Test code: ${codeFor.developmentCode}` : 'It can take a few seconds to arrive.'}
        >
          <OtpInput length={codeFor.length} value={code} onValueChange={setCode} />
        </Field>
      ) : null}

      {verified ? (
        <Actions next="Next" />
      ) : codeFor ? (
        <>
          <Actions next="Verify and continue" disabled={code.length !== codeFor.length} loading={verify.isPending} />
          <Button type="button" variant="ghost" onClick={sendCode} loading={requestCode.isPending} disabled={waitSeconds > 0}>
            {waitSeconds > 0 ? `Send a new code in ${waitSeconds}s` : 'Send a new code'}
          </Button>
        </>
      ) : (
        <Actions next="Send code" loading={requestCode.isPending} />
      )}
    </StepForm>
  );
}

function YourAddress({ draft, update, error, onNext, onBack }: StepProps & { error: ApiError | null; onNext: () => void; onBack: () => void }) {
  const [touched, setTouched] = useState(false);
  const complete = PINCODE.test(draft.pincode);
  const lineOk = draft.addressLine.trim().length >= 5;
  const check = useCheckServiceability(draft.pincode, { query: { enabled: complete, staleTime: 5 * 60_000 } });
  const localities = check.data?.localities ?? [];
  // A new PIN code suggests its best-known place, unless one of its places is already chosen.
  useEffect(() => {
    if (localities.length > 0 && !localities.includes(draft.locality)) update({ locality: localities[0] ?? '' });
    // Only when the PIN code's places arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check.data]);

  const hint = !complete
    ? "We offer you jobs around here. You can change your areas later."
    : check.isPending
      ? 'Checking…'
      : check.isError
        ? "Couldn't check it right now. You can still continue."
        : undefined;

  return (
    <StepForm onSubmit={() => (complete && lineOk ? onNext() : setTouched(true))}>
      <Field
        label="House / flat number and street"
        error={(touched && !lineOk ? 'Enter your house number and street.' : undefined) ?? error?.fieldError('addressLine')}
      >
        <Textarea
          rows={2}
          autoComplete="street-address"
          maxLength={300}
          value={draft.addressLine}
          onChange={(e) => update({ addressLine: e.target.value })}
          placeholder="Flat 302, Sai Residency, Road No. 4"
        />
      </Field>
      <Field label="PIN code" hint={hint} error={(touched && !complete ? 'Enter your 6-digit PIN code.' : undefined) ?? error?.fieldError('pincode')}>
        <Input
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          leadingIcon={MapPin}
          value={draft.pincode}
          onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, ''), locality: '' })}
          placeholder="500081"
        />
      </Field>
      {complete && check.data ? (
        check.data.isServiceable ? (
          <Alert tone="success" title="We work in this area" description={localities.length > 0 ? 'Choose your area below.' : undefined} />
        ) : (
          <Alert tone="warning" title="We don't serve this area yet" description="You can still apply; we'll let you know when we start here." />
        )
      ) : null}
      {localities.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Your area">
          {localities.map((place) => (
            <button key={place} type="button" aria-pressed={draft.locality === place} onClick={() => update({ locality: place })} className={CHIP}>
              {place}
            </button>
          ))}
        </div>
      ) : complete && check.data ? (
        <Field label="Area" optional>
          <Input value={draft.locality} maxLength={200} onChange={(e) => update({ locality: e.target.value })} placeholder="e.g. Kondapur" />
        </Field>
      ) : null}
      <Actions onBack={onBack} next="Next" />
    </StepForm>
  );
}

function YourSkills({ draft, update, onNext, onBack }: StepProps & { onNext: () => void; onBack: () => void }) {
  const catalog = useGetActiveCatalog();
  const [touched, setTouched] = useState(false);
  const ok = draft.appliances.length > 0 && draft.experience !== null;
  const toggle = (id: string) =>
    update((current) => ({ appliances: current.appliances.includes(id) ? current.appliances.filter((x) => x !== id) : [...current.appliances, id] }));

  return (
    <StepForm onSubmit={() => (ok ? onNext() : setTouched(true))}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">What do you repair? Choose all that apply.</legend>
        {catalog.isError ? (
          <Alert
            tone="error"
            title="Couldn't load the list"
            action={
              <Button size="sm" variant="outline" type="button" onClick={() => void catalog.refetch()}>
                Try again
              </Button>
            }
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {(catalog.data ?? []).map((category) => (
            <button key={category.id} type="button" aria-pressed={draft.appliances.includes(category.id)} onClick={() => toggle(category.id)} className={CHIP}>
              <Wrench aria-hidden className="size-4" /> {category.name}
            </button>
          ))}
          {catalog.isPending ? (
            <Text variant="sm" tone="muted">
              Loading…
            </Text>
          ) : null}
        </div>
        {touched && draft.appliances.length === 0 ? (
          <Text variant="sm" tone="error">
            Choose at least one.
          </Text>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">How long have you been repairing appliances?</legend>
        <div className="flex flex-wrap gap-2">
          {EXPERIENCE.map((option) => (
            <button key={option.label} type="button" aria-pressed={draft.experience === option.years} onClick={() => update({ experience: option.years })} className={CHIP}>
              {option.label}
            </button>
          ))}
        </div>
        {touched && draft.experience === null ? (
          <Text variant="sm" tone="error">
            Choose one.
          </Text>
        ) : null}
      </fieldset>
      <Actions onBack={onBack} next="Next" />
    </StepForm>
  );
}

const documentsOk = (draft: Draft) =>
  Boolean(draft.documents.PROFILE_PHOTO && draft.documents.AADHAAR_FRONT) && aadhaarOk(draft.aadhaar) && (draft.pan === '' || PAN.test(draft.pan));

function Documents({
  draft,
  update,
  error,
  onNext,
  onBack,
  onUnverified,
}: StepProps & { error: ApiError | null; onNext: () => void; onBack: () => void; onUnverified: () => void }) {
  const [touched, setTouched] = useState(false);
  const aadhaarError =
    (touched && !aadhaarOk(draft.aadhaar)
      ? aadhaarDigits(draft.aadhaar).length === 12
        ? "That number doesn't look right. Check it against your card."
        : 'Enter the 12-digit number on your Aadhaar card.'
      : undefined) ?? error?.fieldError('aadhaarNumber');
  const panError = (draft.pan !== '' && draft.pan.length === 10 && !PAN.test(draft.pan) ? 'Enter the PAN as on the card, like ABCDE1234F.' : undefined) ?? error?.fieldError('pan');
  const picker = (kind: ApplicantDocumentKind, label: string, required: boolean, imagesOnly = false) => (
    <DocumentPicker
      kind={kind}
      label={label}
      required={required}
      imagesOnly={imagesOnly}
      draft={draft}
      onUploaded={(document) => update((current) => ({ documents: { ...current.documents, [kind]: document } }))}
      onUnverified={onUnverified}
      missing={touched && required && !draft.documents[kind]}
    />
  );

  return (
    <StepForm onSubmit={() => (documentsOk(draft) ? onNext() : setTouched(true))}>
      <Text variant="sm" tone="secondary">
        Our team checks these before approving you. Only Pakka Fix staff can see them.
      </Text>

      {picker('PROFILE_PHOTO', 'Profile photo', true, true)}

      <Field label="Aadhaar number" error={aadhaarError} hint="We keep only the last 4 digits; the card photo is checked by our team.">
        <Input
          inputMode="numeric"
          autoComplete="off"
          leadingIcon={IdCard}
          maxLength={14}
          value={groupAadhaar(draft.aadhaar)}
          onChange={(e) => update({ aadhaar: aadhaarDigits(e.target.value).slice(0, 12) })}
          placeholder="1234 5678 9012"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {picker('AADHAAR_FRONT', 'Aadhaar front', true)}
        {picker('AADHAAR_BACK', 'Aadhaar back', false)}
      </div>

      <Field label="PAN" optional error={panError} hint="Needed later for payouts. You can add it now.">
        <Input
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={10}
          value={draft.pan}
          onChange={(e) => update({ pan: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
          placeholder="ABCDE1234F"
        />
      </Field>
      {picker('PAN_CARD', 'PAN card', false)}

      <Actions onBack={onBack} next="Next" />
    </StepForm>
  );
}

/** Pictures chosen this visit, shown back as thumbnails (a refresh shows the file name instead). */
const previews = new Map<string, string>();

function DocumentPicker({
  kind,
  label,
  required,
  imagesOnly,
  draft,
  onUploaded,
  onUnverified,
  missing,
}: {
  kind: ApplicantDocumentKind;
  label: string;
  required: boolean;
  imagesOnly: boolean;
  draft: Draft;
  onUploaded: (document: UploadedDocument) => void;
  onUnverified: () => void;
  missing: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadApplicantDocument({ mutation: { meta: { silent: true } } });
  const [preparing, setPreparing] = useState(false);
  const done = draft.documents[kind];
  const preview = done ? previews.get(done.token) : undefined;
  const failure = isApiError(upload.error) ? upload.error.message : upload.isError ? "Couldn't upload it. Check your connection and try again." : undefined;
  const busy = preparing || upload.isPending;
  const message = failure ?? (missing ? `Add your ${label.toLowerCase()}.` : undefined);
  const id = `document-${kind}`;

  async function choose(file: File) {
    const phone = mobileDigits(draft.phone);
    if (!phone || !draft.verificationToken) {
      onUnverified();
      return;
    }
    setPreparing(true);
    const ready = await shrinkImage(file);
    setPreparing(false);
    upload.mutate(
      { data: { phone, verificationToken: draft.verificationToken, kind, file: ready } },
      {
        onSuccess: (response) => {
          if (ready.type.startsWith('image/')) previews.set(response.token, URL.createObjectURL(ready));
          onUploaded({ token: response.token, fileName: file.name });
        },
        onError: (problem) => {
          if (isApiError(problem) && problem.code === 'application.phone_unverified') onUnverified();
        },
      },
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {required ? null : <span className="font-normal text-foreground-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        ref={input}
        type="file"
        accept={imagesOnly ? 'image/*' : 'image/*,application/pdf'}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-describedby={`${id}-state`}
        className={cn(
          'transition-interactive flex min-h-24 w-full items-center gap-3 rounded-card border-2 border-dashed p-3 text-left',
          done ? 'border-success bg-success-subtle/40' : missing || failure ? 'border-error' : 'border-border hover:border-border-strong',
          kind === 'PROFILE_PHOTO' ? 'flex-row' : 'flex-col justify-center text-center',
        )}
      >
        {busy ? (
          <Spinner />
        ) : preview ? (
          <img src={preview} alt="" className={cn('shrink-0 object-cover', kind === 'PROFILE_PHOTO' ? 'size-16 rounded-full' : 'h-16 w-full rounded-control')} />
        ) : done ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success [&_svg]:size-5">
            <CheckCircle2 aria-hidden />
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary [&_svg]:size-5">
            {kind === 'PROFILE_PHOTO' ? <Camera aria-hidden /> : <FileText aria-hidden />}
          </span>
        )}
        <span id={`${id}-state`} className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">{busy ? 'Uploading…' : done ? 'Added · Change' : kind === 'PROFILE_PHOTO' ? 'Add a photo' : 'Add'}</span>
          <span className="truncate text-caption text-foreground-muted">
            {done ? done.fileName : kind === 'PROFILE_PHOTO' ? 'Your face, clearly visible. Customers see it.' : 'Photo or PDF'}
          </span>
        </span>
      </button>
      {message ? (
        <Text variant="caption" tone="error" role="alert">
          {message}
        </Text>
      ) : null}
    </div>
  );
}

function Review({
  draft,
  update,
  agreed,
  onAgree,
  trap,
  onTrap,
  sending,
  onEdit,
  onSend,
}: StepProps & {
  agreed: boolean;
  onAgree: (agreed: boolean) => void;
  trap: string;
  onTrap: (value: string) => void;
  sending: boolean;
  onEdit: (step: number) => void;
  onSend: () => void;
}) {
  const catalog = useGetActiveCatalog();
  const names = draft.appliances.map((id) => catalog.data?.find((c) => c.id === id)?.name ?? '…');
  const experience = EXPERIENCE.find((e) => e.years === draft.experience)?.label ?? '—';
  const phone = mobileDigits(draft.phone);
  const added = [
    draft.documents.PROFILE_PHOTO ? 'profile photo' : null,
    draft.documents.AADHAAR_FRONT || draft.documents.AADHAAR_BACK
      ? `Aadhaar ${[draft.documents.AADHAAR_FRONT ? 'front' : null, draft.documents.AADHAAR_BACK ? 'back' : null].filter(Boolean).join(' and ')}`
      : null,
    draft.documents.PAN_CARD ? 'PAN card' : null,
  ].filter(Boolean);
  const complete =
    draft.name.trim().length >= 2 &&
    dobOk(draft.dob) &&
    phone !== null &&
    isVerified(draft) &&
    draft.addressLine.trim().length >= 5 &&
    PINCODE.test(draft.pincode) &&
    draft.appliances.length > 0 &&
    draft.experience !== null &&
    documentsOk(draft);

  return (
    <StepForm onSubmit={() => complete && agreed && onSend()}>
      <dl className="flex flex-col divide-y divide-border rounded-card border border-border">
        <Row
          label="You"
          value={`${draft.name.trim()} · born ${draft.dob ? formatDate(`${draft.dob}T00:00:00`) : '—'} · ${phone ? pretty(phone) : draft.phone}${isVerified(draft) ? ' (verified)' : ''}`}
          onEdit={() => onEdit(0)}
        />
        <Row
          label="Address"
          value={[draft.addressLine.trim(), draft.locality, draft.pincode].filter(Boolean).join(', ')}
          onEdit={() => onEdit(1)}
        />
        <Row label="You repair" value={`${names.join(', ')} · ${experience}`} onEdit={() => onEdit(2)} />
        <Row
          label="Documents"
          value={`Aadhaar ending ${aadhaarDigits(draft.aadhaar).slice(-4) || '—'}${draft.pan ? ` · PAN ${draft.pan}` : ''} · ${added.join(', ') || 'none added'}`}
          onEdit={() => onEdit(3)}
        />
      </dl>

      <Field label="Anything else?" optional hint="Brands you know well, tools you have, places you've worked.">
        <Textarea rows={3} maxLength={1000} value={draft.about} onChange={(e) => update({ about: e.target.value })} />
      </Field>

      <Checkbox
        checked={agreed}
        onCheckedChange={(value) => onAgree(value === true)}
        label="Pakka Fix may call me about this application and keep these details and documents while it's reviewed."
      />

      {/* Not shown and not autofilled: only bots fill it, and their applications are dropped. */}
      <div hidden>
        <label>
          Company website
          <input type="text" name="company_url" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => onTrap(e.target.value)} />
        </label>
      </div>

      {!complete ? <Alert tone="warning" title="Something is missing" description="Go back to the step with a gap and complete it." /> : null}
      <Actions onBack={() => onEdit(3)} next="Send application" disabled={!complete || !agreed} loading={sending} />
    </StepForm>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-caption text-foreground-muted">{label}</dt>
        <dd className="text-sm font-semibold break-words text-foreground">{value}</dd>
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${label.toLowerCase()}`}>
        <Pencil aria-hidden /> Edit
      </Button>
    </div>
  );
}

function Received({ alreadyApplied, phone }: { alreadyApplied: boolean; phone: string }) {
  const shown = /^\d{10}$/.test(phone) ? pretty(phone) : phone;
  return (
    <Stack gap={4}>
      <span className="flex size-12 items-center justify-center rounded-full bg-success-subtle text-success [&_svg]:size-6">
        <CheckCircle2 aria-hidden />
      </span>
      <Heading level={1} size="h3">
        Application received
      </Heading>
      <Text tone="secondary">
        {alreadyApplied ? "We already have your application, and it's waiting for review." : 'Thank you! Our team will review it and call you, usually within 2 working days.'}
      </Text>
      <ol className="flex flex-col gap-2 text-sm text-foreground-secondary">
        <li>1. We check your details and documents.</li>
        <li>2. We call you to talk about your work.</li>
        <li>3. Once approved, we send you a WhatsApp message.</li>
      </ol>
      <Text variant="sm" tone="secondary">
        To check on it any time, sign in with <strong className="text-foreground">{shown}</strong>.
      </Text>
      <Button asChild variant="outline" size="lg" fullWidth>
        <Link to={paths.login}>Back to sign in</Link>
      </Button>
    </Stack>
  );
}

const CHIP = cn(
  'transition-interactive inline-flex min-h-10 items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-foreground-secondary hover:border-border-strong',
  'aria-pressed:border-primary aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-foreground',
);
