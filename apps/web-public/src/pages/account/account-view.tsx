import {
  getGetMyAccountQueryKey,
  isApiError,
  session,
  useAddMyAddress,
  useDeleteMyAccount,
  useListMyInvoices,
  useRemoveMyAddress,
  useUpdateMyAddress,
  useGetMyAccount,
  useListMyBookings,
  type AccountAddressResponse,
  type AccountResponse,
  type MyBookingResponse,
} from '@servicepro/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  CategoryTile,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  Heading,
  Input,
  Skeleton,
  SpotArt,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  cn,
  formatDateTime,
  formatINR,
  formatWindow,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, CalendarCheck, ChevronRight, Download, Home, LocateFixed, LogOut, MapPinned, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import { clearServiceLocation } from '../../location/service-location';
import { forgetSavedAddress } from '../booking/draft';
import { downloadProtected } from './download';
import { ANY_DATE, Chip, ChipRow, DateChips, matchesDate, type DateFilter } from './booking-filters';
import { BookingChanges } from './booking-changes';
import { HelpTab } from './help-tab';
import { ProfileCard } from './profile-card';

const TABS = ['bookings', 'profile', 'help'] as const;
type Tab = (typeof TABS)[number];

/** Signed in: greeting, then Bookings and Profile tabs (?tab= keeps the choice in the URL). */
export function AccountView({ fullName }: { fullName: string }) {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'bookings';
  const firstName = fullName.split(' ')[0] ?? '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <Heading level={1}>Hi, {firstName}</Heading>
          <Text tone="secondary">Your bookings, profile, saved addresses and help.</Text>
        </div>
        <Button asChild variant="accent">
          <Link to="/book">
            <CalendarCheck aria-hidden /> Book a repair
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(next) => setParams(next === 'bookings' ? {} : { tab: next }, { replace: true })}>
        <TabsList aria-label="Account sections" className="gap-8">
          <TabsTrigger value="bookings" className="min-w-24">
            Bookings
          </TabsTrigger>
          <TabsTrigger value="profile" className="min-w-24">
            Profile
          </TabsTrigger>
          <TabsTrigger value="help" className="min-w-24">
            Help
          </TabsTrigger>
        </TabsList>
        <TabsContent value="bookings" className="pt-2">
          <BookingsTab />
        </TabsContent>
        <TabsContent value="profile" className="pt-2">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="help" className="pt-2">
          <HelpTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ── Bookings ───────────────────────────────────────────────────────────── */

const DONE = new Set(['COMPLETED', 'CLOSED', 'CLOSED_NO_REPAIR', 'CANCELLED']);

/** Date (YYYY-MM-DD, India time) a booking is about: the visit if scheduled, else the preferred day, else when booked. */
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
const bookingDay = (b: MyBookingResponse) => ymd.format(new Date(b.scheduledStart ?? b.preferredSlotStart ?? b.createdAt));

function BookingsTab() {
  const bookings = useListMyBookings();
  const [appliance, setAppliance] = useState('');
  const [srNumber, setSrNumber] = useState('');
  const [date, setDate] = useState<DateFilter>(ANY_DATE);

  const appliances = useMemo(() => [...new Set((bookings.data ?? []).map((b) => b.categoryName))].sort(), [bookings.data]);
  const filtered = useMemo(
    () =>
      (bookings.data ?? []).filter(
        (b) =>
          (!appliance || b.categoryName === appliance) &&
          (!srNumber.trim() || b.srNumber.toLowerCase().includes(srNumber.trim().toLowerCase())) &&
          matchesDate(date, bookingDay(b)),
      ),
    [bookings.data, appliance, srNumber, date],
  );
  const filtering = Boolean(appliance || srNumber.trim() || date.kind !== 'any');
  const bookedDays = useMemo(() => new Set((bookings.data ?? []).map(bookingDay)), [bookings.data]);
  const clear = () => {
    setAppliance('');
    setSrNumber('');
    setDate(ANY_DATE);
  };

  if (bookings.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    );
  }

  if (bookings.isError) {
    return <Alert tone="error" title="Couldn't load your bookings" description="Check your connection and refresh the page." />;
  }

  if (bookings.data.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarCheck}
          illustration={<SpotArt kind="calendar" />}
          title="No bookings yet"
          description="When you book a repair it shows up here, with live status and your bill."
          action={
            <Button asChild>
              <Link to="/book">Book a repair</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <section aria-label="Your bookings" className="flex min-w-0 flex-col gap-3 lg:col-span-2">
        <Text variant="sm" tone="secondary" role="status">
          {filtering ? `${filtered.length} of ${bookings.data.length} bookings` : `${bookings.data.length} ${bookings.data.length === 1 ? 'booking' : 'bookings'}`}
        </Text>
        {filtered.length === 0 ? (
          <Card variant="sunken">
            <EmptyState size="compact" icon={Search} illustration={<SpotArt kind="search" />} title="No bookings match" description="Try a different appliance, number or date." />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((booking) => (
              <li key={booking.id}>
                <BookingCard booking={booking} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Phones and tablets: compact, above the list. Desktop: a sticky panel beside it. */}
      <Card className="flex flex-col gap-3 max-lg:order-first max-lg:p-4 lg:sticky lg:top-20 lg:gap-4" role="search" aria-label="Find a booking">
        <div className="flex items-center justify-between gap-3">
          <Heading level={2} size="h3">
            Find a booking
          </Heading>
          {filtering ? (
            <button type="button" className="link text-sm" onClick={clear}>
              Clear all
            </button>
          ) : null}
        </div>
        <Field label="Request number" className="max-lg:[&_label]:text-caption">
          <Input leadingIcon={Search} placeholder="e.g. SR-10017" value={srNumber} onChange={(e) => setSrNumber(e.target.value)} />
        </Field>
        {appliances.length > 1 ? (
          <ChipRow label="Appliance">
            <Chip selected={!appliance} onClick={() => setAppliance('')}>
              All
            </Chip>
            {appliances.map((name) => (
              <Chip key={name} selected={appliance === name} onClick={() => setAppliance(name)}>
                {name}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        <DateChips value={date} onChange={setDate} bookedDays={bookedDays} />
        <Text variant="caption" tone="muted" className="max-lg:hidden">
          Date: the visit day, or the day you booked.
        </Text>
      </Card>
    </div>
  );
}

function BookingCard({ booking }: { booking: MyBookingResponse }) {
  const when = booking.scheduledStart
    ? `Visit ${formatWindow(booking.scheduledStart, booking.scheduledEnd)}`
    : booking.preferredSlotStart
      ? `Preferred ${formatWindow(booking.preferredSlotStart, booking.preferredSlotEnd)}`
      : `Booked ${formatDateTime(booking.createdAt)}`;

  return (
    <div className="transition-interactive overflow-hidden rounded-card border border-border bg-surface hover:border-border-strong hover:shadow-md">
      <Link to={`/account/bookings/${booking.id}`} className="pressable flex items-center gap-4 p-4">
        <CategoryTile code={booking.categoryCode} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-body font-semibold text-foreground">{booking.categoryName}</span>
            <StatusBadge status={booking.status} audience="customer" size="sm" />
          </span>
          <span className="truncate text-sm text-foreground-secondary">{booking.problemDescription}</span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-foreground-muted">
            <span className="tabular-nums">{booking.srNumber}</span>
            <span className="tabular-nums">{when}</span>
            {booking.technicianName && !DONE.has(booking.status) ? <span>Technician: {booking.technicianName}</span> : null}
            {booking.finalAmount != null ? <span className="tabular-nums">Bill {formatINR(booking.finalAmount)}</span> : null}
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground-muted" />
      </Link>
      <BookingChanges booking={booking} />
    </div>
  );
}

/* ── Profile ────────────────────────────────────────────────────────────── */

function ProfileTab() {
  const account = useGetMyAccount();

  if (account.isPending) {
    return <Skeleton className="h-[12rem] w-full rounded-card" />;
  }

  if (account.isError) {
    return <Alert tone="error" title="Couldn't load your profile" description="Check your connection and refresh the page." />;
  }

  return (
    <div className="flex flex-col gap-10">
      <ProfileCard account={account.data} />
      <SavedAddresses account={account.data} />
      <MyBills />
      <YourData />
      <div className="border-t border-border pt-6">
        <Button variant="outline" onClick={() => void session.signOut()}>
          <LogOut aria-hidden /> Sign out
        </Button>
      </div>
    </div>
  );
}

/* ── Your data: delete (DPDP Act) ──────────────────────────────────────── */

function YourData() {
  const [deleting, setDeleting] = useState(false);

  return (
    <section aria-labelledby="your-data" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Heading level={2} size="h3" id="your-data">
          Your data
        </Heading>
        <Text variant="sm" tone="secondary">
          Delete your account and the personal data we hold. To get a copy of your data, contact us. Read our{' '}
          <Link className="link" to="/privacy">
            privacy policy
          </Link>
          .
        </Text>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="ghost" className="text-error" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden /> Delete my account
        </Button>
      </div>
      <DeleteAccountDialog open={deleting} onOpenChange={setDeleting} />
    </section>
  );
}

function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [understood, setUnderstood] = useState(false);
  const remove = useDeleteMyAccount({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        forgetSavedAddress();
        clearServiceLocation();
        await session.signOut();
      },
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setUnderstood(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader title="Delete your account?" description="This can't be undone." />
        <DialogBody className="flex flex-col gap-4">
          {isApiError(remove.error) ? <Alert role="alert" tone="error" title={remove.error.message} /> : remove.isError ? <Alert role="alert" tone="error" title="Couldn't delete your account. Check your connection and try again." /> : null}
          <ul className="ml-5 flex list-disc flex-col gap-2 text-body text-foreground-secondary">
            <li>We remove your name, phone number, email, saved addresses and the messages we sent you.</li>
            <li>We keep your bills and payment records, because tax law requires it, and the record that each job took place.</li>
            <li>You'll be signed out. You can book again any time with the same number, as a new customer.</li>
          </ul>
          <Checkbox checked={understood} onCheckedChange={(checked) => setUnderstood(checked === true)} label="I understand, delete my account" />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Keep my account
          </Button>
          <Button type="button" variant="destructive" disabled={!understood} loading={remove.isPending} onClick={() => remove.mutate()}>
            Delete my account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LABEL_ICON: Record<string, ReactNode> = {
  Home: <Home aria-hidden />,
  Work: <Briefcase aria-hidden />,
};

function SavedAddresses({ account }: { account: AccountResponse }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccountAddressResponse | null>(null);

  return (
    <section aria-labelledby="saved-addresses" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading level={2} id="saved-addresses">
          Saved addresses
        </Heading>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden /> Add new address
        </Button>
      </div>

      {account.addresses.length === 0 ? (
        <Card variant="sunken">
          <Text variant="sm" tone="secondary">
            No saved addresses yet. Add one here; addresses you book with are saved too.
          </Text>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {account.addresses.map((address) => (
            <li key={address.id}>
              <AddressCard address={address} onEdit={() => setEditing(address)} />
            </li>
          ))}
        </ul>
      )}

      <AddressDialog open={adding} onOpenChange={setAdding} />
      {editing ? <AddressDialog key={editing.id} open editing={editing} onOpenChange={(open) => (open ? undefined : setEditing(null))} /> : null}
    </section>
  );
}

function AddressCard({ address, onEdit }: { address: AccountAddressResponse; onEdit: () => void }) {
  // Addresses saved from a booking may have no label: name them by their area.
  const label = address.label || address.locality;
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const saved = { meta: { silent: true }, onSuccess: (updated: AccountResponse) => queryClient.setQueryData(getGetMyAccountQueryKey(), updated) };
  const remove = useRemoveMyAddress({ mutation: saved });
  const makeDefault = useUpdateMyAddress({ mutation: saved });
  return (
    <Card className={cn('flex h-full flex-col gap-3', address.isDefault && 'border-primary-border')}>
      <div className="flex items-start gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary [&_svg]:size-5">
        {LABEL_ICON[label] ?? <MapPinned aria-hidden />}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <Text weight="semibold">{label}</Text>
          {address.isDefault ? (
            <Badge tone="primary" size="sm">
              Default
            </Badge>
          ) : null}
        </span>
        <Text variant="sm" tone="secondary">
          {[address.line1, address.line2, address.landmark, address.locality, address.city, address.pincode].filter(Boolean).join(', ')}
        </Text>
        {address.hasLocation ? (
          <Text variant="caption" tone="muted" className="flex items-center gap-1">
            <LocateFixed aria-hidden className="size-3" /> Location saved
          </Text>
        ) : null}
      </div>
      </div>
      {isApiError(remove.error) ? <Alert tone="error" title={remove.error.message} /> : null}
      {isApiError(makeDefault.error) ? <Alert tone="error" title={makeDefault.error.message} /> : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {confirming ? (
          <>
            <Text variant="sm">Remove this address?</Text>
            <Button size="sm" variant="destructive" loading={remove.isPending} onClick={() => remove.mutate({ addressId: address.id })}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil aria-hidden /> Edit
            </Button>
            {address.isDefault ? null : (
              <Button
                size="sm"
                variant="ghost"
                loading={makeDefault.isPending}
                onClick={() =>
                  makeDefault.mutate({
                    addressId: address.id,
                    data: {
                      label: address.label,
                      line1: address.line1,
                      line2: address.line2,
                      landmark: address.landmark,
                      locality: address.locality,
                      city: address.city,
                      pincode: address.pincode,
                      makeDefault: true,
                    },
                  })
                }
              >
                <Star aria-hidden /> Make default
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-error" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden /> Remove
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

const EMPTY_ADDRESS = { label: 'Home', line1: '', line2: '', landmark: '', locality: '', city: '', pincode: '', makeDefault: false };

function AddressDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (open: boolean) => void; editing?: AccountAddressResponse }) {
  const queryClient = useQueryClient();
  const initial = editing
    ? {
        label: editing.label ?? 'Home',
        line1: editing.line1,
        line2: editing.line2 ?? '',
        landmark: editing.landmark ?? '',
        locality: editing.locality,
        city: editing.city,
        pincode: editing.pincode,
        makeDefault: editing.isDefault,
      }
    : EMPTY_ADDRESS;
  const [form, setForm] = useState(initial);
  const onSaved = {
    meta: { silent: true },
    onSuccess: (updated: AccountResponse) => {
      queryClient.setQueryData(getGetMyAccountQueryKey(), updated);
      setForm(EMPTY_ADDRESS);
      onOpenChange(false);
    },
  };
  const addAddress = useAddMyAddress({ mutation: onSaved });
  const updateAddress = useUpdateMyAddress({ mutation: onSaved });
  const add = editing ? updateAddress : addAddress;
  const update = (patch: Partial<typeof EMPTY_ADDRESS>) => setForm((f) => ({ ...f, ...patch }));
  const error = (field: string) => (isApiError(add.error) ? add.error.fieldError(field) : undefined);
  const ready = form.locality.trim() && form.city.trim() && /^[1-9][0-9]{5}$/.test(form.pincode);

  function submit(event: FormEvent) {
    event.preventDefault();
    const data = {
        label: form.label,
        line1: form.line1,
        line2: form.line2 || null,
        landmark: form.landmark || null,
        locality: form.locality,
        city: form.city,
        pincode: form.pincode,
        makeDefault: form.makeDefault,
    };
    if (editing) updateAddress.mutate({ addressId: editing.id, data });
    else addAddress.mutate({ data });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent presentation="sheet">
        <DialogHeader
          title={editing ? 'Edit address' : 'Add new address'}
          description={editing ? undefined : 'You can pick saved addresses when you book.'}
        />
        {/* A flex column, so the fields scroll inside the sheet and Save always stays on screen. */}
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="flex flex-col gap-3 md:gap-4">
            {isApiError(add.error) && !add.error.fieldErrors ? <Alert tone="error" title={add.error.message} /> : null}
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Save address as">
              {['Home', 'Work', 'Other'].map((label) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={form.label === label}
                  onClick={() => update({ label })}
                  className={cn(
                    'pressable transition-interactive inline-flex h-8 items-center rounded-pill border px-3 text-sm font-semibold md:h-10 md:px-4',
                    form.label === label ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-foreground-secondary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Phones: compact labels, and the short fields in pairs. */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 max-md:[&_label]:text-caption">
              <Field label="House / flat no." optional error={error('line1')} className="col-span-2 md:col-span-1">
                <Input autoComplete="address-line1" value={form.line1} onChange={(e) => update({ line1: e.target.value })} />
              </Field>
              <Field label="Building / street" optional className="col-span-2 md:col-span-1">
                <Input autoComplete="address-line2" value={form.line2} onChange={(e) => update({ line2: e.target.value })} />
              </Field>
              <Field label="Area / locality" error={error('locality')}>
                <Input autoComplete="address-level3" value={form.locality} onChange={(e) => update({ locality: e.target.value })} />
              </Field>
              <Field label="Landmark" optional>
                <Input value={form.landmark} onChange={(e) => update({ landmark: e.target.value })} />
              </Field>
              <Field label="City" error={error('city')}>
                <Input autoComplete="address-level2" value={form.city} onChange={(e) => update({ city: e.target.value })} />
              </Field>
              <Field label="PIN code" error={error('pincode')}>
                <Input inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, '') })} />
              </Field>
            </div>
            <Checkbox checked={form.makeDefault} onCheckedChange={(checked) => update({ makeDefault: checked === true })} label="Make this my default address" />
            {editing ? (
              <Text variant="caption" tone="muted">
                Changing the house number clears the saved map location.
              </Text>
            ) : null}
          </DialogBody>
          <DialogFooter className="max-md:flex-row max-md:*:flex-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={add.isPending} disabled={!ready}>
              Save address
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Bills ──────────────────────────────────────────────────────────────── */

function MyBills() {
  const bills = useListMyInvoices();
  const [failed, setFailed] = useState(false);
  if (!bills.data || bills.data.length === 0) return null;

  return (
    <section aria-labelledby="my-bills" className="flex flex-col gap-4">
      <Heading level={2} id="my-bills">
        My bills
      </Heading>
      {failed ? <Alert tone="error" title="Couldn't download the bill" description="Check your connection and try again." /> : null}
      <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
        {bills.data.map((bill) => (
          <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="flex flex-col">
              <Text weight="semibold" className="tabular-nums">
                {bill.invoiceNumber} · {formatINR(bill.total)}
              </Text>
              <Text variant="caption" tone="muted" className="tabular-nums">
                {bill.srNumber} · {formatDateTime(bill.issuedAt)} · {bill.amountPaid >= bill.total ? 'Paid' : `Paid ${formatINR(bill.amountPaid)}`}
              </Text>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFailed(false);
                downloadProtected(`/api/v1/account/invoices/${bill.id}/pdf`, `${bill.invoiceNumber}.pdf`).catch(() => setFailed(true));
              }}
            >
              <Download aria-hidden /> PDF
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
