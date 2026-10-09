import {
  isApiError,
  useBookServiceOnline,
  useGetActiveCatalog,
  useRequestBookingCode,
  type CategoryResponse,
  type OnlineBookingResponse,
} from '@servicepro/api-client';
import {
  Alert,
  Button,
  Card,
  CategoryTile,
  Container,
  Field,
  Heading,
  Input,
  OtpInput,
  RadioCard,
  RadioGroup,
  Skeleton,
  SpotArt,
  Stepper,
  StickyActionBar,
  Text,
  Textarea,
  cn,
  formatINR,
} from '@servicepro/ui';
import { ArrowLeft, BadgeIndianRupee, CircleCheck, Clock, KeyRound, LocateFixed, MapPin, MapPinned, Phone, UserRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import { SITE } from '../../site';
import { SiteLayout } from '../../components/site-layout';
import { usePageMeta } from '../../seo/head';
import { PAGES } from '../../seo/pages';
import { AddressStep } from './address-step';
import { EMPTY_DRAFT, addressOneLine, saveAddress, type Draft } from './draft';
import { SLOTS, bookableDays, slotWindow } from './slots';
import { TimeStep } from './time-step';

const STEPS = [
  { id: 'appliance', label: 'Appliance', title: 'What needs repairing?' },
  { id: 'problem', label: 'Problem', title: "What's wrong?" },
  { id: 'address', label: 'Address', title: 'Where should we come?' },
  { id: 'time', label: 'Time', title: 'When suits you?' },
  { id: 'details', label: 'Details', title: 'Your details' },
] as const;

/**
 * Online booking (USER-FLOWS.md §1): five short steps, one decision each, then the phone is
 * proven with an SMS code. The job is created as NEW and the office confirms it.
 */
export function BookingPage() {
  usePageMeta(PAGES.book);
  const [params] = useSearchParams();
  const catalog = useGetActiveCatalog();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [booked, setBooked] = useState<OnlineBookingResponse | null>(null);

  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const preset = categories.find((c) => c.code === params.get('service')?.toUpperCase());
  // A ?service= link skips straight to the problem step until the customer changes it.
  const categoryId = draft.categoryId || preset?.id || '';
  const category = categories.find((c) => c.id === categoryId);
  const currentStep = draft.categoryId || !preset ? step : Math.max(step, 1);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const go = (to: number) => {
    if (!draft.categoryId && categoryId) update({ categoryId });
    setStep(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <SiteLayout>
        <Container className="py-6 md:py-10">
          {booked ? (
            <BookingDone booking={booked} draft={draft} category={category} />
          ) : (
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
              <Card padding="lg" className="flex min-w-0 flex-col gap-6 lg:col-span-2">
                <h1 className="sr-only">Book a repair</h1>
                <Stepper
                  label="Booking progress"
                  steps={[...STEPS]}
                  current={currentStep}
                  onStepClick={go}
                  className="border-b border-border pb-6"
                />
                <div className="flex flex-col gap-2">
                  {currentStep > 0 ? (
                    <button type="button" onClick={() => go(currentStep - 1)} className="link inline-flex min-h-6 items-center gap-1 self-start text-sm">
                      <ArrowLeft aria-hidden className="size-4" /> Back
                    </button>
                  ) : null}
                  <Heading level={2}>{STEPS[currentStep]?.title}</Heading>
                </div>

                {catalog.isPending ? (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-32 rounded-card" />
                    ))}
                  </div>
                ) : catalog.isError ? (
                  <Alert tone="error" title="Couldn't load our services" description="Check your connection and refresh the page." />
                ) : currentStep === 0 ? (
                  <CategoryStep categories={categories} value={categoryId} onPick={(id) => { update({ categoryId: id, issueTypeId: '' }); go(1); }} />
                ) : currentStep === 1 && category ? (
                  <ProblemStep category={category} draft={draft} update={update} onNext={() => go(2)} />
                ) : currentStep === 2 ? (
                  <AddressStep draft={draft} update={update} onNext={() => go(3)} actions={continueButton} />
                ) : currentStep === 3 ? (
                  <TimeStep draft={draft} update={update} onNext={() => go(4)} actions={continueButton} />
                ) : category ? (
                  <DetailsStep draft={draft} update={update} category={category} onBooked={setBooked} />
                ) : null}
              </Card>

              <aside className="hidden min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:flex">
                <Summary draft={draft} category={category} />
                <Promises />
              </aside>
            </div>
          )}
        </Container>
    </SiteLayout>
  );
}

/* ── Step 1 ─────────────────────────────────────────────────────────────── */

function CategoryStep({ categories, value, onPick }: { categories: CategoryResponse[]; value: string; onPick: (id: string) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {categories.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-pressed={c.id === value}
            onClick={() => onPick(c.id)}
            className={cn(
              'pressable transition-interactive flex h-full w-full flex-col items-start gap-3 rounded-card border bg-surface p-3 text-left hover:shadow-md',
              c.id === value ? 'border-primary ring-2 ring-primary-subtle' : 'border-border hover:border-border-strong',
            )}
          >
            <CategoryTile code={c.code} size="lg" className="w-full" />
            <span className="flex flex-col gap-1">
              <span className="text-body font-semibold text-foreground">{c.name}</span>
              <span className="text-sm text-foreground-secondary">
                Visit from <span className="font-semibold text-foreground tabular-nums">{formatINR(c.baseVisitCharge)}</span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ── Step 2 ─────────────────────────────────────────────────────────────── */

interface StepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  onNext: () => void;
}

function ProblemStep({ category, draft, update, onNext }: StepProps & { category: CategoryResponse }) {
  const issues = category.issueTypes.filter((i) => i.isActive);
  const ready = draft.description.trim().length >= 3 || draft.issueTypeId !== '';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (ready) onNext();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div className="flex items-center gap-3">
        <CategoryTile code={category.code} />
        <Text weight="semibold">{category.name}</Text>
      </div>
      {issues.length > 0 ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-semibold text-foreground">Pick the closest match</legend>
          <RadioGroup value={draft.issueTypeId} onValueChange={(issueTypeId) => update({ issueTypeId })} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {issues.map((issue) => (
              <RadioCard key={issue.id} value={issue.id} title={issue.name} />
            ))}
          </RadioGroup>
        </fieldset>
      ) : null}
      <Field label="Tell us more" optional={draft.issueTypeId !== ''} hint="Brand, model, what you've noticed — anything helps the technician come prepared.">
        <Textarea rows={4} value={draft.description} onChange={(e) => update({ description: e.target.value })} maxLength={1000} />
      </Field>
      <StepActions>
        <Button type="submit" size="lg" disabled={!ready}>
          Continue
        </Button>
      </StepActions>
    </form>
  );
}

/* ── Step 5 ─────────────────────────────────────────────────────────────── */

function DetailsStep({
  draft,
  update,
  category,
  onBooked,
}: Omit<StepProps, 'onNext'> & { category: CategoryResponse; onBooked: (booking: OnlineBookingResponse) => void }) {
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const requestCode = useRequestBookingCode({ mutation: { meta: { silent: true } } });
  const book = useBookServiceOnline({ mutation: { meta: { silent: true } } });

  const phoneDigits = draft.phone.replace(/\D/g, '');
  const codeSent = sentTo !== null && sentTo.phone === draft.phone;

  function sendCode(event: { preventDefault: () => void }) {
    event.preventDefault();
    requestCode.mutate(
      { data: { phone: draft.phone } },
      {
        onSuccess: (response) => {
          setCode('');
          setSentTo({ phone: draft.phone, length: response.codeLength, developmentCode: response.developmentCode });
        },
      },
    );
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    if (!draft.slot) return;
    const visit = slotWindow(draft.date, draft.slot);
    book.mutate(
      {
        data: {
          categoryId: category.id,
          issueTypeId: draft.issueTypeId || null,
          problemDescription: problemText(draft, category),
          fullName: draft.fullName,
          phone: draft.phone,
          code,
          address: {
            label: draft.label,
            line1: draft.line1,
            line2: draft.line2 || null,
            landmark: draft.landmark || null,
            locality: draft.locality,
            city: draft.city,
            state: null,
            pincode: draft.pincode,
            latitude: draft.pin?.latitude ?? null,
            longitude: draft.pin?.longitude ?? null,
          },
          preferredSlotStart: visit.start,
          preferredSlotEnd: visit.end,
        },
      },
      {
        onSuccess: (booking) => {
          if (draft.rememberAddress) saveAddress(draft);
          onBooked(booking);
        },
      },
    );
  }

  const phoneError = isApiError(requestCode.error) ? (requestCode.error.fieldError('phone') ?? requestCode.error.message) : undefined;
  const bookError = isApiError(book.error) ? book.error.message : book.isError ? "Couldn't book. Check your connection and try again." : undefined;

  return (
    <form onSubmit={codeSent ? confirm : sendCode} className="flex flex-col gap-6" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Your name">
          <Input autoComplete="name" leadingIcon={UserRound} value={draft.fullName} onChange={(e) => update({ fullName: e.target.value })} />
        </Field>
        <Field label="Mobile number" error={phoneError} hint={codeSent ? undefined : "We'll text you a code to confirm it's you."}>
          <Input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            leadingIcon={Phone}
            placeholder="98765 43210"
            value={draft.phone}
            onChange={(e) => update({ phone: e.target.value })}
          />
        </Field>
      </div>

      {codeSent ? (
        <Field
          label={`Code sent to ${sentTo.phone}`}
          hint={sentTo.developmentCode ? `Development code: ${sentTo.developmentCode}` : 'It can take a few seconds to arrive.'}
        >
          <OtpInput length={sentTo.length} value={code} onValueChange={setCode} />
        </Field>
      ) : null}

      {bookError ? <Alert role="alert" tone="error" title={bookError} /> : null}

      <Text variant="caption" tone="muted">
        You pay only after the visit: the visiting charge is {formatINR(category.baseVisitCharge)}, and the technician explains any repair cost before starting.
      </Text>

      <StepActions>
        {codeSent ? (
          <>
            <Button type="button" variant="outline" size="lg" loading={requestCode.isPending} onClick={sendCode}>
              Resend code
            </Button>
            <Button type="submit" size="lg" loading={book.isPending} disabled={code.length !== sentTo.length}>
              <CircleCheck aria-hidden /> Confirm booking
            </Button>
          </>
        ) : (
          <Button type="submit" size="lg" loading={requestCode.isPending} disabled={!draft.fullName.trim() || phoneDigits.length < 10}>
            Send code
          </Button>
        )}
      </StepActions>
    </form>
  );
}

/** The issue the customer picked plus their own words, so the technician sees both. */
function problemText(draft: Draft, category: CategoryResponse): string {
  const issue = category.issueTypes.find((i) => i.id === draft.issueTypeId)?.name;
  const note = draft.description.trim();
  return [issue, note].filter(Boolean).join(': ') || category.name;
}

function StepActions({ children }: { children: ReactNode }) {
  return <StickyActionBar className="md:justify-end md:border-t md:border-border md:pt-6 *:max-md:w-full">{children}</StickyActionBar>;
}

const continueButton = (ready: boolean) => (
  <StepActions>
    <Button type="submit" size="lg" disabled={!ready}>
      Continue
    </Button>
  </StepActions>
);

/* ── Summary & reassurance ─────────────────────────────────────────────── */

function Summary({ draft, category }: { draft: Draft; category: CategoryResponse | undefined }) {
  const issue = category?.issueTypes.find((i) => i.id === draft.issueTypeId)?.name;
  const day = draft.date ? bookableDays(new Date()).find((d) => d.date === draft.date) : undefined;
  const slot = SLOTS.find((s) => s.id === draft.slot);

  return (
    <Card className="flex flex-col gap-4">
      <Text variant="overline" tone="muted">
        Your booking
      </Text>
      {category ? (
        <div className="flex items-center gap-3">
          <CategoryTile code={category.code} />
          <div className="flex min-w-0 flex-col">
            <Text weight="semibold">{category.name}</Text>
            {issue ? (
              <Text variant="sm" tone="secondary" className="truncate">
                {issue}
              </Text>
            ) : null}
          </div>
        </div>
      ) : (
        <Text variant="sm" tone="secondary">
          Pick an appliance to start.
        </Text>
      )}
      {draft.locality || draft.pincode ? (
        <SummaryRow icon={<MapPin aria-hidden className="size-4" />}>
          <span className="font-semibold text-foreground">{draft.label}</span> · {addressOneLine(draft)}
        </SummaryRow>
      ) : null}
      {draft.pin ? <SummaryRow icon={<LocateFixed aria-hidden className="size-4" />}>Location pinned on map</SummaryRow> : null}
      {day && slot ? (
        <SummaryRow icon={<Clock aria-hidden className="size-4" />}>
          {day.weekday} {day.dayOfMonth} {day.month} · {slot.range}
        </SummaryRow>
      ) : null}
      {category ? (
        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <Text variant="sm" tone="secondary">
            Visiting charge
          </Text>
          <Text variant="stat-sm">{formatINR(category.baseVisitCharge)}</Text>
        </div>
      ) : null}
    </Card>
  );
}

function SummaryRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-foreground-secondary">
      <span className="mt-1 text-primary">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Promises() {
  const items = [
    { icon: BadgeIndianRupee, text: 'Price explained before any repair' },
    { icon: MapPinned, text: 'Track your visit on WhatsApp' },
    { icon: KeyRound, text: 'Job closes only with your code' },
  ];
  return (
    <Card variant="sunken" className="flex flex-col gap-3">
      {items.map(({ icon: Icon, text }) => (
        <p key={text} className="flex items-center gap-3 text-sm text-foreground-secondary">
          <Icon aria-hidden className="size-5 text-primary" />
          {text}
        </p>
      ))}
    </Card>
  );
}

/* ── Done ───────────────────────────────────────────────────────────────── */

function BookingDone({ booking, draft, category }: { booking: OnlineBookingResponse; draft: Draft; category: CategoryResponse | undefined }) {
  return (
    <Card padding="lg" className="mx-auto flex max-w-sheet flex-col items-center gap-6 text-center" role="status">
      <SpotArt kind="done" className="size-32" />
      <div className="flex flex-col gap-2">
        <Heading level={1}>Booking received</Heading>
        <Text tone="secondary">
          Thanks{draft.fullName ? `, ${draft.fullName.split(' ')[0]}` : ''}! Your {category?.name ?? 'service'} request is{' '}
          <span className="font-semibold text-foreground">{booking.srNumber}</span>. We'll confirm your visit on WhatsApp shortly.
        </Text>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link to={booking.trackingPath}>Track your booking</Link>
        </Button>
        {SITE.phone ? (
          <Button asChild size="lg" variant="outline">
            <a href={`tel:${SITE.phone}`}>
              <Phone aria-hidden /> Call us
            </a>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
