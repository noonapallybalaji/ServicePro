import {
  getGetMyAccountQueryKey,
  isApiError,
  session,
  useAddMyAddress,
  useGetMyAccount,
  useListMyBookings,
  useUpdateMyAccount,
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
  Select,
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
  getInitials,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, CalendarCheck, ChevronRight, Home, LocateFixed, LogOut, Mail, MapPinned, Pencil, Phone, Plus, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

const TABS = ['bookings', 'profile'] as const;
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
          <Text tone="secondary">Your bookings, profile and saved addresses.</Text>
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
        </TabsList>
        <TabsContent value="bookings" className="pt-2">
          <BookingsTab />
        </TabsContent>
        <TabsContent value="profile" className="pt-2">
          <ProfileTab />
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
  const [date, setDate] = useState('');

  const appliances = useMemo(() => [...new Set((bookings.data ?? []).map((b) => b.categoryName))].sort(), [bookings.data]);
  const filtered = useMemo(
    () =>
      (bookings.data ?? []).filter(
        (b) =>
          (!appliance || b.categoryName === appliance) &&
          (!srNumber.trim() || b.srNumber.toLowerCase().includes(srNumber.trim().toLowerCase())) &&
          (!date || bookingDay(b) === date),
      ),
    [bookings.data, appliance, srNumber, date],
  );
  const filtering = Boolean(appliance || srNumber.trim() || date);

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

      <Card className="flex flex-col gap-4 lg:sticky lg:top-20" role="search" aria-label="Find a booking">
        <Heading level={2} size="h3">
          Find a booking
        </Heading>
        <Field label="Appliance">
          <Select value={appliance} onChange={(e) => setAppliance(e.target.value)}>
            <option value="">All appliances</option>
            {appliances.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Request number">
          <Input leadingIcon={Search} placeholder="e.g. SR-10017" value={srNumber} onChange={(e) => setSrNumber(e.target.value)} />
        </Field>
        <Field label="Date" hint="Visit day, or the day you booked.">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Button
          variant="outline"
          disabled={!filtering}
          onClick={() => {
            setAppliance('');
            setSrNumber('');
            setDate('');
          }}
        >
          Clear filters
        </Button>
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
    <Link
      to={booking.trackingPath}
      className="pressable transition-interactive flex items-center gap-4 rounded-card border border-border bg-surface p-4 hover:border-border-strong hover:shadow-md"
    >
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
  );
}

/* ── Profile ────────────────────────────────────────────────────────────── */

function ProfileTab() {
  const account = useGetMyAccount();

  if (account.isPending) {
    return <Skeleton className="h-48 w-full rounded-card" />;
  }

  if (account.isError) {
    return <Alert tone="error" title="Couldn't load your profile" description="Check your connection and refresh the page." />;
  }

  return (
    <div className="flex flex-col gap-10">
      <ProfileCard account={account.data} />
      <SavedAddresses account={account.data} />
      <div className="border-t border-border pt-6">
        <Button variant="outline" onClick={() => void session.signOut()}>
          <LogOut aria-hidden /> Sign out
        </Button>
      </div>
    </div>
  );
}

function ProfileCard({ account }: { account: AccountResponse }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(account.fullName);
  const [email, setEmail] = useState(account.email ?? '');
  const save = useUpdateMyAccount({
    mutation: {
      meta: { silent: true },
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetMyAccountQueryKey(), updated);
        setEditing(false);
      },
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ data: { fullName, email: email.trim() || null } });
  }

  return (
    <Card padding="lg" className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <span
        aria-hidden
        className="flex size-24 shrink-0 items-center justify-center rounded-card bg-primary text-display text-primary-foreground sm:size-32"
      >
        {getInitials(account.fullName).charAt(0) || '?'}
      </span>

      {editing ? (
        <form onSubmit={submit} className="flex flex-1 flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Name" error={isApiError(save.error) ? save.error.fieldError('fullName') : undefined}>
              <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email" optional error={isApiError(save.error) ? save.error.fieldError('email') : undefined}>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={save.isPending} disabled={!fullName.trim()}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFullName(account.fullName);
                setEmail(account.email ?? '');
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Heading level={2}>{account.fullName}</Heading>
          <Text className="flex items-center gap-2 tabular-nums">
            <Phone aria-hidden className="size-4 text-primary" /> {account.phone}
          </Text>
          <Text tone={account.email ? 'default' : 'muted'} className="flex items-center gap-2">
            <Mail aria-hidden className="size-4 text-primary" /> {account.email ?? 'No email added'}
          </Text>
          <Text variant="caption" tone="muted">
            Your mobile number is how you sign in, so it can't be changed here. Call us if it has changed.
          </Text>
        </div>
      )}

      {!editing ? (
        <Button variant="outline" onClick={() => setEditing(true)} className="self-start sm:self-center">
          <Pencil aria-hidden /> Edit
        </Button>
      ) : null}
    </Card>
  );
}

const LABEL_ICON: Record<string, ReactNode> = {
  Home: <Home aria-hidden />,
  Work: <Briefcase aria-hidden />,
};

function SavedAddresses({ account }: { account: AccountResponse }) {
  const [adding, setAdding] = useState(false);

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
            No saved addresses yet. Add one here, or it is saved when you book.
          </Text>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {account.addresses.map((address) => (
            <li key={address.id}>
              <AddressCard address={address} />
            </li>
          ))}
        </ul>
      )}

      <AddAddressDialog open={adding} onOpenChange={setAdding} />
    </section>
  );
}

function AddressCard({ address }: { address: AccountAddressResponse }) {
  const label = address.label ?? 'Address';
  return (
    <Card className={cn('flex h-full items-start gap-4', address.isDefault && 'border-primary-border')}>
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
    </Card>
  );
}

const EMPTY_ADDRESS = { label: 'Home', line1: '', line2: '', landmark: '', locality: '', city: '', pincode: '', makeDefault: false };

function AddAddressDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_ADDRESS);
  const add = useAddMyAddress({
    mutation: {
      meta: { silent: true },
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetMyAccountQueryKey(), updated);
        setForm(EMPTY_ADDRESS);
        onOpenChange(false);
      },
    },
  });
  const update = (patch: Partial<typeof EMPTY_ADDRESS>) => setForm((f) => ({ ...f, ...patch }));
  const error = (field: string) => (isApiError(add.error) ? add.error.fieldError(field) : undefined);
  const ready = form.line1.trim() && form.locality.trim() && form.city.trim() && /^[1-9][0-9]{5}$/.test(form.pincode);

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate({
      data: {
        label: form.label,
        line1: form.line1,
        line2: form.line2 || null,
        landmark: form.landmark || null,
        locality: form.locality,
        city: form.city,
        pincode: form.pincode,
        makeDefault: form.makeDefault,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent presentation="sheet">
        <DialogHeader title="Add new address" description="Saved addresses are offered when you book." />
        <form onSubmit={submit} noValidate>
          <DialogBody className="flex flex-col gap-4">
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
                    'pressable transition-interactive inline-flex h-10 items-center rounded-pill border px-4 text-sm font-semibold',
                    form.label === label ? 'border-primary bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-foreground-secondary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="House / flat / floor no." error={error('line1')}>
                <Input autoComplete="address-line1" value={form.line1} onChange={(e) => update({ line1: e.target.value })} />
              </Field>
              <Field label="Building / apartment / street" optional>
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
              <Field label="Pincode" error={error('pincode')}>
                <Input inputMode="numeric" autoComplete="postal-code" maxLength={6} value={form.pincode} onChange={(e) => update({ pincode: e.target.value.replace(/\D/g, '') })} />
              </Field>
            </div>
            <Checkbox checked={form.makeDefault} onCheckedChange={(checked) => update({ makeDefault: checked === true })} label="Make this my default address" />
          </DialogBody>
          <DialogFooter>
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
