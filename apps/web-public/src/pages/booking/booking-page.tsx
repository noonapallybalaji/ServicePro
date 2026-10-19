import {
  session,
  useGetActiveCatalog,
  useGetMyAccount,
  useSession,
  type AccountAddressResponse,
  type CategoryResponse,
  type OnlineBookingResponse,
} from '@servicepro/api-client';
import {
  Alert,
  Button,
  Card,
  CategoryTile,
  Container,
  Heading,
  Skeleton,
  SpotArt,
  Stepper,
  Text,
  cn,
  formatINR,
} from '@servicepro/ui';
import { ArrowLeft, BadgeIndianRupee, KeyRound, ListChecks, MapPin, MapPinned } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { SiteLayout } from '../../components/site-layout';
import { customerFrom } from '../../customer-session';
import { getServiceLocation, openLocationPicker, useServiceLocation, type ServiceLocation } from '../../location/service-location';
import { usePageMeta } from '../../seo/head';
import { PAGES } from '../../seo/pages';
import { SITE } from '../../site';
import { ADDRESS_LABELS, EMPTY_DRAFT, addressOneLine, forgetSavedAddress, type BookingAddress, type Draft } from './draft';
import { ConfirmStep, type AddressChoice } from './confirm-step';

const STEPS = [
  { id: 'appliance', label: 'Appliance', title: 'What needs repair?' },
  { id: 'confirm', label: 'Confirm', title: 'Confirm your booking' },
] as const;


/** A random id for this booking attempt: a double tap or a retry returns the same booking. */
const newRequestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;


/** The chosen service location as an address (area, PIN code, device pin); the house number is optional. */
function addressFromLocation(location: ServiceLocation | null): BookingAddress | null {
  if (!location) return null;
  return {
    label: 'Home',
    line1: '',
    line2: '',
    locality: location.locality ?? location.areas[0] ?? '',
    landmark: '',
    city: SITE.city,
    pincode: location.pincode,
    pin: location.pin ?? null,
  };
}

function fromSaved(a: AccountAddressResponse): BookingAddress {
  const label = ADDRESS_LABELS.find((l) => l === a.label) ?? 'Other';
  return { label, line1: a.line1, line2: a.line2 ?? '', locality: a.locality, landmark: a.landmark ?? '', city: a.city, pincode: a.pincode, pin: null };
}

/**
 * What to preselect: a saved address in the chosen location's PIN code (the default one first), else
 * the default address, else the chosen location. Never a typed address: that is always the customer's choice.
 */
function autoChoice(saved: AccountAddressResponse[], location: ServiceLocation | null): AddressChoice | null {
  const inArea = saved.filter((a) => location && a.pincode === location.pincode);
  const pick = inArea.find((a) => a.isDefault) ?? inArea[0] ?? (location ? undefined : (saved.find((a) => a.isDefault) ?? saved[0]));
  if (pick) return { kind: 'saved', id: pick.id };
  return location ? { kind: 'location' } : null;
}

/**
 * Online booking (USER-FLOWS.md §1), two steps: the appliance, then one screen to confirm where and
 * who (with an optional note about the problem). No time: the technician finds the fault on the visit, and the office
 * agrees the date with the customer. The phone is proven with an SMS code when they confirm; the
 * job is created as NEW and the office takes it from there.
 */
export function BookingPage() {
  usePageMeta(PAGES.book);
  const [params] = useSearchParams();
  const catalog = useGetActiveCatalog();
  const location = useServiceLocation();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [choice, setChoice] = useState<AddressChoice | null>(null); // null: preselect automatically
  const [typedAddress, setTypedAddress] = useState<BookingAddress | null>(null);
  const [booked, setBooked] = useState<OnlineBookingResponse | null>(null);
  // Signed in: the account's saved addresses are the choices.
  const customer = customerFrom(useSession());
  const account = useGetMyAccount({ query: { enabled: customer !== null } });
  const savedAddresses = customer ? (account.data?.addresses ?? []) : [];
  const [requestId] = useState(newRequestId);

  // Location first: nothing known about where yet, so offer the picker (they can also type an address).
  useEffect(() => {
    if (!getServiceLocation() && !customerFrom(session.getState())) openLocationPicker({ automatic: true });
    forgetSavedAddress(); // addresses live in the account now
  }, []);

  const categories = (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const preset = categories.find((c) => c.code === params.get('service')?.toUpperCase());
  // A ?service= link (home page tiles and search) skips straight to confirming.
  const categoryId = draft.categoryId || preset?.id || '';
  const category = categories.find((c) => c.id === categoryId);
  const currentStep = draft.categoryId || !preset ? step : Math.max(step, 1);

  const locationAddress = addressFromLocation(location);
  const stillThere = (c: AddressChoice) =>
    c.kind === 'saved' ? savedAddresses.some((a) => a.id === c.id) : c.kind === 'location' ? locationAddress !== null : typedAddress !== null;
  const chosen = choice && stillThere(choice) ? choice : autoChoice(savedAddresses, location);
  const picked = chosen?.kind === 'saved' ? savedAddresses.find((a) => a.id === chosen.id) : undefined;
  const selected = picked ? fromSaved(picked) : chosen?.kind === 'location' ? locationAddress : chosen?.kind === 'typed' ? typedAddress : null;
  const current: Draft = { ...draft, ...(selected ?? {}), categoryId };

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
          <BookingDone booking={booked} draft={current} category={category} />
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <Card padding="lg" className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              <h1 className="sr-only">Book a repair</h1>
              <Stepper label="Booking progress" steps={[...STEPS]} current={currentStep} onStepClick={go} className="border-b border-border pb-6" />
              <div className="flex flex-col gap-2">
                {currentStep > 0 ? (
                  <button type="button" onClick={() => go(0)} className="link inline-flex min-h-6 items-center gap-1 self-start text-sm">
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
              ) : currentStep === 0 || !category ? (
                <CategoryStep
                  categories={categories}
                  value={categoryId}
                  onPick={(id) => {
                    update({ categoryId: id });
                    go(1);
                  }}
                />
              ) : (
                <ConfirmStep
                  draft={current}
                  update={update}
                  category={category}
                  savedAddresses={savedAddresses}
                  addressesLoading={customer !== null && account.isPending}
                  locationAddress={locationAddress}
                  typedAddress={typedAddress}
                  chosen={chosen}
                  selected={selected}
                  onChoose={setChoice}
                  onTyped={setTypedAddress}
                  onChangeAppliance={() => go(0)}
                  requestId={requestId}
                  onBooked={setBooked}
                />
              )}
            </Card>

            <aside className="hidden min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:flex">
              <Summary draft={current} category={category} />
              <Promises />
            </aside>
          </div>
        )}
      </Container>
    </SiteLayout>
  );
}

/* ── Step 1: the appliance ────────────────────────────────────────────── */

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

/* ── Summary & reassurance ─────────────────────────────────────────────── */

function Summary({ draft, category }: { draft: Draft; category: CategoryResponse | undefined }) {
  return (
    <Card className="flex flex-col gap-4">
      <Text variant="overline" tone="muted">
        Your booking
      </Text>
      {category ? (
        <div className="flex items-center gap-3">
          <CategoryTile code={category.code} />
          <Text weight="semibold">{category.name}</Text>
        </div>
      ) : (
        <Text variant="sm" tone="secondary">
          Pick an appliance to start.
        </Text>
      )}
      {draft.locality || draft.pincode ? (
        <p className="flex items-start gap-2 text-sm text-foreground-secondary">
          <MapPin aria-hidden className="mt-1 size-4 text-primary" />
          <span className="min-w-0">{addressOneLine(draft)}</span>
        </p>
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

function Promises() {
  const items = [
    { icon: BadgeIndianRupee, text: 'Price explained before any repair' },
    { icon: MapPinned, text: 'Track your visit live' },
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

/* ── Done ───────────────────────────────────────────────────────────── */

function BookingDone({ booking, draft, category }: { booking: OnlineBookingResponse; draft: Draft; category: CategoryResponse | undefined }) {
  return (
    <Card padding="lg" className="mx-auto flex max-w-sheet flex-col items-center gap-6 text-center" role="status">
      <SpotArt kind="done" className="size-32" />
      <div className="flex flex-col gap-2">
        <Heading level={1}>Booking received</Heading>
        <Text tone="secondary">
          Thanks{draft.fullName ? `, ${draft.fullName.split(' ')[0]}` : ''}! Your {category?.name ?? 'service'} request is{' '}
          <span className="font-semibold text-foreground">{booking.srNumber}</span>. Our team will call or WhatsApp you shortly to agree a visit time.
        </Text>
      </div>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg">
          <Link to={booking.trackingPath}>Track your booking</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/account">
            <ListChecks aria-hidden /> My bookings
          </Link>
        </Button>
      </div>
    </Card>
  );
}
