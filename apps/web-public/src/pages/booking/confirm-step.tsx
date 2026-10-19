import {
  getGetMyAccountQueryKey,
  isApiError,
  session,
  useAddMyAddress,
  useBookServiceOnline,
  useRequestBookingCode,
  useSession,
  type AccountAddressResponse,
  type AccountResponse,
  type CategoryResponse,
  type OnlineBookingResponse,
} from '@servicepro/api-client';
import {
  Alert,
  Button,
  CategoryTile,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Heading,
  Input,
  OtpInput,
  Skeleton,
  StickyActionBar,
  Text,
  Textarea,
  cn,
  formatINR,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, ChevronRight, CircleCheck, Home, KeyRound, LocateFixed, MapPin, Pencil, Phone, Plus, UserRound } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';

import { PolicyNotice } from '../../components/policy-notice';
import { customerFrom, signInWith } from '../../customer-session';
import { openLocationPicker } from '../../location/service-location';
import { SITE } from '../../site';
import { AddressForm, addressReady, usePincodeCheck } from './address-step';
import { EMPTY_DRAFT, type BookingAddress, type Draft } from './draft';
import { AccessNotes, SomeoneElse, bookingExtras } from './extras';

/*
 * Step 2 of booking, one short page: each part shows what's chosen with a "Change" button that opens
 * a sheet with a clear way back. Visit address (saved addresses, the current location, or a new one),
 * contact (signed in: their verified number; otherwise name, number and an SMS code in its own sheet),
 * and optional notes. Nothing here is a dead end.
 */

const PHONE = /^[6-9][0-9]{9}$/;

/** Which address the booking goes to. */
export type AddressChoice = { kind: 'saved'; id: string } | { kind: 'location' } | { kind: 'typed' };

export interface ConfirmStepProps {
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  category: CategoryResponse;
  savedAddresses: AccountAddressResponse[];
  addressesLoading: boolean;
  locationAddress: BookingAddress | null;
  typedAddress: BookingAddress | null;
  chosen: AddressChoice | null;
  /** The address the booking will use (from the choice), if any. */
  selected: BookingAddress | null;
  onChoose: (choice: AddressChoice) => void;
  onTyped: (address: BookingAddress) => void;
  onChangeAppliance: () => void;
  requestId: string;
  onBooked: (booking: OnlineBookingResponse) => void;
}

export function ConfirmStep(props: ConfirmStepProps) {
  const { draft, update, category, selected, chosen, requestId, onBooked } = props;
  const customer = customerFrom(useSession());
  const [addressSheet, setAddressSheet] = useState<'list' | 'new' | null>(null);
  const [touched, setTouched] = useState(false);
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<{ phone: string; length: number; developmentCode: string | null | undefined } | null>(null);
  const requestCode = useRequestBookingCode({ mutation: { meta: { silent: true } } });
  const book = useBookServiceOnline({ mutation: { meta: { silent: true } } });
  // Guards against a double tap before React re-renders with isPending.
  const submitting = useRef(false);

  const digits = draft.phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  const contactOk = customer !== null || (draft.fullName.trim().length > 0 && PHONE.test(digits));
  const codeOpen = customer === null && sentTo !== null && sentTo.phone === draft.phone;
  const hasChoices = props.savedAddresses.length > 0 || props.locationAddress !== null || props.typedAddress !== null;

  function sendCode() {
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

  function confirm() {
    if (!selected || submitting.current || book.isPending) return;
    submitting.current = true;
    book.mutate(
      {
        data: {
          categoryId: category.id,
          issueTypeId: null,
          // Optional: left out, the API records that the technician will check it on the visit.
          problemDescription: draft.problem.trim() || null,
          fullName: customer ? customer.fullName : draft.fullName.trim(),
          phone: customer ? customer.phone : draft.phone,
          code: customer ? null : code,
          address: {
            // "Home" only for a first address from the location; a new address keeps the label chosen in its form.
            label: chosen?.kind === 'typed' ? selected.label : chosen?.kind === 'location' && props.savedAddresses.length === 0 ? 'Home' : null,
            line1: selected.line1.trim() || null,
            line2: selected.line2.trim() || null,
            landmark: selected.landmark.trim() || null,
            locality: selected.locality,
            city: selected.city,
            state: null,
            pincode: selected.pincode,
            latitude: selected.pin?.latitude ?? null,
            longitude: selected.pin?.longitude ?? null,
          },
          acceptedPolicies: true,
          extras: bookingExtras(draft),
          requestId,
          // A saved address is booked as stored (no copies in the account).
          addressId: customer && chosen?.kind === 'saved' ? chosen.id : null,
        },
      },
      {
        onSuccess: (booking) => {
          // A verified booking signs the customer in, so "My bookings" works straight away.
          if (booking.session) signInWith(booking.session);
          onBooked(booking);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!selected) {
      document.getElementById('visit-address')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!contactOk) return;
    if (customer) confirm();
    else sendCode();
  }

  const phoneError = touched && !customer && !PHONE.test(digits) ? 'Enter a 10-digit mobile number.' : undefined;
  const nameError = touched && !customer && !draft.fullName.trim() ? 'Enter your name.' : undefined;
  const codeError = isApiError(requestCode.error) ? (requestCode.error.fieldError('phone') ?? requestCode.error.message) : undefined;
  const bookError = isApiError(book.error)
    ? book.error.message
    : book.isError
      ? "Couldn't send your request. Check your connection and try again — you won't be booked twice."
      : undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {/* Appliance */}
      <Row
        icon={<CategoryTile code={category.code} size="sm" />}
        title={`${category.name} repair`}
        text={
          <>
            Visiting charge <span className="font-semibold text-foreground tabular-nums">{formatINR(category.baseVisitCharge)}</span>
          </>
        }
        action={{ label: 'Change', onClick: props.onChangeAppliance }}
      />

      {/* Visit address */}
      <Section title="Visit address" id="visit-address">
        {props.addressesLoading ? (
          <Skeleton className="h-16 rounded-card" />
        ) : selected ? (
          <Row
            icon={<AddressIcon label={chosen?.kind === 'location' ? 'location' : addressTitle(selected, chosen, props.savedAddresses)} />}
            title={addressTitle(selected, chosen, props.savedAddresses)}
            text={addressText(selected)}
            action={{ label: 'Change', onClick: () => setAddressSheet('list') }}
            highlight
          />
        ) : (
          <div className={cn('flex flex-col gap-3 rounded-card border border-dashed p-4', touched ? 'border-error' : 'border-border-strong')}>
            <Text tone={touched ? undefined : 'secondary'} className={touched ? 'text-error' : undefined}>
              {touched ? 'Add where the technician should come.' : 'Where should the technician come?'}
            </Text>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" onClick={() => openLocationPicker()}>
                <LocateFixed aria-hidden /> Use my location
              </Button>
              <Button type="button" variant="outline" onClick={() => setAddressSheet(hasChoices ? 'list' : 'new')}>
                <Plus aria-hidden /> Add address
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* Contact */}
      <Section title="Your details">
        {customer ? (
          <Row
            icon={<UserRound aria-hidden />}
            title={customer.fullName}
            text={<span className="tabular-nums">{customer.phone} · signed in</span>}
            footer={
              <span className="text-caption text-foreground-secondary">
                Not you?{' '}
                <button type="button" className="link" onClick={() => void session.signOut()}>
                  Sign out
                </button>
              </span>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Your name" error={nameError}>
              <Input autoComplete="name" leadingIcon={UserRound} value={draft.fullName} onChange={(e) => update({ fullName: e.target.value })} />
            </Field>
            <Field label="Mobile number" error={phoneError ?? codeError} hint={phoneError || codeError ? undefined : "We'll text a code to confirm it's you."}>
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
        )}
        <SomeoneElse draft={draft} update={update} />
      </Section>

      {/* Optional notes */}
      <Section title="Anything we should know?" optional>
        <Field label="Describe the problem" optional hint="For example: not cooling, making a noise, error code E4.">
          <Textarea rows={2} maxLength={1000} value={draft.problem} onChange={(e) => update({ problem: e.target.value })} />
        </Field>
        <OptionalDirections draft={draft} update={update} />
      </Section>

      {bookError && !codeOpen ? <Alert role="alert" tone="error" title={bookError} /> : null}

      <Text variant="sm" tone="secondary">
        You pay only after the visit. Our team will call or WhatsApp you to agree a visit time, and the technician explains any repair cost before starting.
      </Text>
      <PolicyNotice action="confirming this booking" />

      <StickyActionBar className="md:justify-end md:border-t md:border-border md:pt-6 *:max-md:w-full">
        {customer ? (
          <Button type="submit" size="lg" loading={book.isPending}>
            <CircleCheck aria-hidden /> Confirm booking
          </Button>
        ) : (
          <Button type="submit" size="lg" loading={requestCode.isPending}>
            <KeyRound aria-hidden /> Send code to confirm
          </Button>
        )}
      </StickyActionBar>

      {addressSheet ? (
        <AddressSheet
          {...props}
          customerSignedIn={customer !== null}
          mode={addressSheet}
          onMode={setAddressSheet}
          onClose={() => setAddressSheet(null)}
        />
      ) : null}

      {codeOpen && sentTo ? (
        <Dialog open onOpenChange={(open) => !open && setSentTo(null)}>
          <DialogContent presentation="sheet" aria-describedby={undefined}>
            <DialogHeader title="Enter the code" />
            <DialogBody className="flex flex-col gap-4">
              <Text variant="sm" tone="secondary">
                We sent a {sentTo.length}-digit code to <span className="font-semibold text-foreground tabular-nums">{sentTo.phone}</span>.{' '}
                <button type="button" className="link" onClick={() => setSentTo(null)}>
                  Change number
                </button>
              </Text>
              <Field label="Code" hint={sentTo.developmentCode ? `Development code: ${sentTo.developmentCode}` : 'It can take a few seconds to arrive.'}>
                <OtpInput length={sentTo.length} value={code} onValueChange={setCode} />
              </Field>
              {bookError ? <Alert role="alert" tone="error" title={bookError} /> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" loading={requestCode.isPending} disabled={book.isPending} onClick={sendCode}>
                Resend code
              </Button>
              <Button type="button" loading={book.isPending} disabled={code.length !== sentTo.length} onClick={confirm}>
                <CircleCheck aria-hidden /> Confirm booking
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </form>
  );
}

/* ── Address sheet ─────────────────────────────────────────────────────── */

function AddressSheet(
  props: ConfirmStepProps & { customerSignedIn: boolean; mode: 'list' | 'new'; onMode: (mode: 'list' | 'new') => void; onClose: () => void },
) {
  const { savedAddresses, locationAddress, typedAddress, chosen, mode, onMode, onClose, onChoose } = props;
  const hasList = savedAddresses.length > 0 || locationAddress !== null || typedAddress !== null;
  // The location is listed too, unless a saved address already covers that PIN code.
  const showLocation = locationAddress !== null && !savedAddresses.some((a) => a.pincode === locationAddress.pincode);
  const pick = (choice: AddressChoice) => {
    onChoose(choice);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent presentation="sheet" aria-describedby={undefined}>
        <DialogHeader title={mode === 'list' ? 'Choose a visit address' : 'Add a new address'} />
        {mode === 'list' ? (
          <DialogBody className="flex flex-col gap-2 pb-6">
            <div role="radiogroup" aria-label="Visit address" className="flex flex-col gap-2">
              {savedAddresses.map((a) => (
                <AddressOption
                  key={a.id}
                  selected={chosen?.kind === 'saved' && chosen.id === a.id}
                  onSelect={() => pick({ kind: 'saved', id: a.id })}
                  icon={<AddressIcon label={a.label} />}
                  title={a.label || a.locality}
                  badge={a.isDefault ? 'Default' : undefined}
                  text={[a.line1, a.line2, a.locality, a.city, a.pincode].filter(Boolean).join(', ')}
                  pincode={a.pincode}
                />
              ))}
              {typedAddress ? (
                <AddressOption
                  selected={chosen?.kind === 'typed'}
                  onSelect={() => pick({ kind: 'typed' })}
                  icon={<AddressIcon label={typedAddress.label} />}
                  title={typedAddress.label}
                  text={addressText(typedAddress)}
                  pincode={typedAddress.pincode}
                />
              ) : null}
              {showLocation && locationAddress ? (
                <AddressOption
                  selected={chosen?.kind === 'location'}
                  onSelect={() => pick({ kind: 'location' })}
                  icon={<AddressIcon label="location" />}
                  title="Current location"
                  text={addressText(locationAddress)}
                  pincode={locationAddress.pincode}
                />
              ) : null}
            </div>
            <div className="mt-2 flex flex-col divide-y divide-border rounded-card border border-border">
              <SheetAction icon={<Plus aria-hidden />} label="Add a new address" onClick={() => onMode('new')} />
              <SheetAction
                icon={<LocateFixed aria-hidden />}
                label="Detect my current location"
                onClick={() => {
                  onClose();
                  onChoose({ kind: 'location' });
                  openLocationPicker();
                }}
              />
            </div>
          </DialogBody>
        ) : (
          <NewAddress {...props} onBack={hasList ? () => onMode('list') : undefined} onSaved={pick} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The "Add a new address" form. Signed in, it's saved to the account straight away; otherwise it's used for this booking. */
function NewAddress({
  customerSignedIn,
  locationAddress,
  onTyped,
  onBack,
  onSaved,
}: ConfirmStepProps & { customerSignedIn: boolean; onBack?: () => void; onSaved: (choice: AddressChoice) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BookingAddress>(() => ({
    ...EMPTY_DRAFT,
    label: 'Home',
    city: SITE.city,
    // Start from the current location's PIN code and area: often it's the same place.
    pincode: locationAddress?.pincode ?? '',
    locality: locationAddress?.locality ?? '',
    pin: locationAddress?.pin ?? null,
  }));
  const [touched, setTouched] = useState(false);
  const check = usePincodeCheck(form.pincode);
  const ready = addressReady(form, check.covered || check.failed);
  const save = useAddMyAddress({
    mutation: {
      meta: { silent: true },
      onSuccess: (updated: AccountResponse) => {
        const before = new Set((queryClient.getQueryData<AccountResponse>(getGetMyAccountQueryKey())?.addresses ?? []).map((a) => a.id));
        queryClient.setQueryData(getGetMyAccountQueryKey(), updated);
        const added = updated.addresses.find((a) => !before.has(a.id));
        if (added) onSaved({ kind: 'saved', id: added.id });
      },
    },
  });

  function submit() {
    setTouched(true);
    if (!ready) return;
    if (customerSignedIn) {
      save.mutate({
        data: {
          label: form.label,
          line1: form.line1.trim(),
          line2: form.line2.trim() || null,
          landmark: form.landmark.trim() || null,
          locality: form.locality.trim(),
          city: form.city.trim(),
          pincode: form.pincode,
          makeDefault: false,
          latitude: form.pin?.latitude ?? null,
          longitude: form.pin?.longitude ?? null,
        },
      });
    } else {
      onTyped(form);
      onSaved({ kind: 'typed' });
    }
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        {onBack ? (
          <button type="button" onClick={onBack} className="link inline-flex items-center gap-1 self-start text-sm">
            <ArrowLeft aria-hidden className="size-4" /> Back to my addresses
          </button>
        ) : null}
        <AddressForm value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        {touched && !ready ? (
          <Text variant="sm" className="text-error">
            Enter a PIN code we serve, the area and the city.
          </Text>
        ) : null}
        {isApiError(save.error) ? <Alert role="alert" tone="error" title={save.error.message} /> : null}
        <Text variant="caption" tone="muted">
          {customerSignedIn ? "It's saved to your addresses for next time." : "We'll save it to your account when you book."}
        </Text>
      </DialogBody>
      <DialogFooter>
        <Button type="button" className="max-md:w-full" loading={save.isPending} onClick={submit}>
          {customerSignedIn ? 'Save and use this address' : 'Use this address'}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Small parts ───────────────────────────────────────────────────────── */

function Section({ title, id, optional = false, children }: { title: string; id?: string; optional?: boolean; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-24 flex-col gap-3">
      <Heading level={3} size="h3">
        {title}
        {optional ? <span className="ml-2 text-sm font-normal text-foreground-muted">optional</span> : null}
      </Heading>
      {children}
    </section>
  );
}

/** One chosen thing with a "Change" button. */
function Row({
  icon,
  title,
  text,
  action,
  footer,
  highlight = false,
}: {
  icon: ReactNode;
  title: string;
  text: ReactNode;
  action?: { label: string; onClick: () => void };
  footer?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={cn('flex items-start gap-3 rounded-card border p-3', highlight ? 'border-primary-border bg-primary-subtle' : 'border-border bg-surface')}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-primary [&_svg]:size-5">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-caption text-foreground-secondary">{text}</span>
        {footer}
      </div>
      {action ? (
        <Button type="button" variant="outline" size="sm" onClick={action.onClick} className="shrink-0">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

function AddressOption({
  selected,
  onSelect,
  icon,
  title,
  badge,
  text,
  pincode,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  badge?: string;
  text: string;
  pincode: string;
}) {
  const check = usePincodeCheck(pincode);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'transition-interactive flex items-start gap-3 rounded-card border p-3 text-left',
        selected ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-surface text-primary [&_svg]:size-4">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {badge ? <span className="rounded-pill bg-primary-subtle px-2 text-caption font-semibold text-primary-subtle-foreground">{badge}</span> : null}
        </span>
        <span className="text-caption text-foreground-secondary">{text}</span>
        {check.notCovered ? <span className="text-caption font-semibold text-error">We don't serve this PIN code yet</span> : null}
      </span>
      <span aria-hidden className={cn('mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-primary' : 'border-border-strong')}>
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
    </button>
  );
}

function SheetAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="transition-interactive flex min-h-12 items-center gap-3 px-3 text-left text-sm font-semibold text-primary hover:bg-surface-sunken [&_svg]:size-5">
      {icon}
      <span className="flex-1">{label}</span>
      <ChevronRight aria-hidden className="text-foreground-muted" />
    </button>
  );
}

/** "Directions for the technician", folded away until wanted. */
function OptionalDirections({ draft, update }: { draft: Draft; update: (patch: Partial<Draft>) => void }) {
  const [open, setOpen] = useState(draft.accessNotes.length > 0);
  return open ? (
    <AccessNotes draft={draft} update={update} />
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="link inline-flex items-center gap-1 self-start text-sm">
      <Pencil aria-hidden className="size-4" /> Add directions for the technician
    </button>
  );
}

function AddressIcon({ label }: { label: string | null | undefined }) {
  if (label === 'location') return <LocateFixed aria-hidden />;
  if (label === 'Home') return <Home aria-hidden />;
  if (label === 'Work') return <Briefcase aria-hidden />;
  return <MapPin aria-hidden />;
}

function addressTitle(address: BookingAddress, chosen: AddressChoice | null, saved: AccountAddressResponse[]): string {
  if (chosen?.kind === 'location') return 'Current location';
  if (chosen?.kind === 'saved') {
    const a = saved.find((x) => x.id === chosen.id);
    return a?.label || address.locality;
  }
  return address.label || address.locality;
}

export function addressText(a: BookingAddress): string {
  return [a.line1, a.line2, a.locality, a.city, a.pincode].filter((part) => part.trim()).join(', ');
}
