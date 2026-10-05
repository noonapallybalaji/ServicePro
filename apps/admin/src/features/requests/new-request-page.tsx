import {
  isApiError,
  useCreateCustomer,
  useCreateServiceRequest,
  useFindCustomerByPhone,
  useGetActiveCatalog,
  useGetCustomer,
  type CustomerResponse,
  type Priority,
  type RequestChannel,
} from '@servicepro/api-client';
import {
  Alert,
  Button,
  CATEGORY_ICONS,
  Card,
  Field,
  Heading,
  Input,
  PageHeader,
  RadioCard,
  RadioGroup,
  Select,
  Stack,
  StickyActionBar,
  Text,
  Textarea,
  formatINR,
  toast,
  type CategoryCode,
} from '@servicepro/ui';
import { Phone, Search, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { paths } from '../../app/paths';
import { BackLink, fieldError } from '../../components/common';
import { AddressFields, emptyAddress, type AddressDraft } from '../customers/address-fields';
import { fromLocalInput } from './request-dialogs';

const CHANNELS: { value: RequestChannel; label: string }[] = [
  { value: 'PHONE', label: 'Phone call' },
  { value: 'WHATS_APP', label: 'WhatsApp' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'MANUAL', label: 'Other' },
];

/**
 * Logging a call (PLAN.md §16 Phase 1): phone first — existing customers are found instantly
 * (de-duplication), new ones are created inline — then the appliance, problem and visit window.
 */
export function NewRequestPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetCustomerId = params.get('customerId');
  const [phone, setPhone] = useState('');
  const [lookupPhone, setLookupPhone] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newAddress, setNewAddress] = useState<AddressDraft>(emptyAddress);
  const [addressId, setAddressId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [problem, setProblem] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [channel, setChannel] = useState<RequestChannel>('PHONE');
  const [visitFrom, setVisitFrom] = useState('');
  const [visitTo, setVisitTo] = useState('');

  const catalog = useGetActiveCatalog();
  const preset = useGetCustomer(presetCustomerId ?? '', { query: { enabled: Boolean(presetCustomerId) } });
  const lookup = useFindCustomerByPhone(lookupPhone ?? '', { query: { enabled: Boolean(lookupPhone), retry: false } });
  const createCustomer = useCreateCustomer({ mutation: { meta: { silent: true } } });
  const createRequest = useCreateServiceRequest({ mutation: { meta: { silent: true } } });

  // Derived, not copied into state: the found customer is whatever the lookup returned.
  const customer: CustomerResponse | null = dismissed ? null : (preset.data ?? lookup.data ?? null);
  const selectedAddressId = addressId || customer?.addresses.find((a) => a.isDefault)?.id || customer?.addresses[0]?.id || '';

  const notFound = isApiError(lookup.error) && lookup.error.status === 404;
  const category = catalog.data?.find((c) => c.id === categoryId);
  const isNewCustomer = !customer && notFound;

  function findCustomer(event: FormEvent) {
    event.preventDefault();
    setDismissed(false);
    setAddressId('');
    setLookupPhone(phone.trim());
  }

  async function submit() {
    try {
      let target = customer;
      if (!target) {
        target = await createCustomer.mutateAsync({
          data: {
            fullName: newCustomerName,
            phone: lookupPhone ?? phone,
            alternatePhone: null,
            email: null,
            preferredLanguage: 'en',
            source: channel,
            notes: null,
            address: { ...newAddress, label: 'Home', line2: newAddress.line2 || null, landmark: newAddress.landmark || null, latitude: null, longitude: null },
          },
        });
      }

      const visitAddressId = customer ? selectedAddressId : target.addresses[0]?.id;
      if (!visitAddressId) return;

      const created = await createRequest.mutateAsync({
        data: {
          customerId: target.id,
          addressId: visitAddressId,
          applianceId: null,
          categoryId,
          issueTypeId: issueTypeId || null,
          problemDescription: problem,
          channel,
          priority,
          preferredSlotStart: null,
          preferredSlotEnd: null,
          scheduledStart: fromLocalInput(visitFrom),
          scheduledEnd: fromLocalInput(visitTo),
          visitChargeOverride: null,
          isWarrantyVisit: false,
          parentServiceRequestId: null,
        },
      });
      toast.success('Request created', { description: 'The customer has been sent a confirmation on WhatsApp.' });
      void navigate(paths.request(created.id));
    } catch {
      // Field errors render inline below.
    }
  }

  const error = createCustomer.error ?? createRequest.error;
  const ready = Boolean((customer ? selectedAddressId : newCustomerName.trim()) && categoryId && problem.trim() && (customer || isNewCustomer));

  return (
    <Stack gap={6}>
      <BackLink to={paths.requests} label="Service requests" />
      <PageHeader title="New service request" description="Start with the caller's phone number." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="flex flex-col gap-4">
            <Heading level={2} size="h3">
              1. Customer
            </Heading>
            {customer ? (
              <div className="flex flex-col gap-3">
                <Text>
                  <span className="font-semibold">{customer.fullName}</span> · {customer.primaryPhone}
                </Text>
                {customer.addresses.length > 0 ? (
                  <Field label="Visit address">
                    <Select value={selectedAddressId} onChange={(event) => setAddressId(event.target.value)}>
                      {customer.addresses.map((a) => (
                        <option key={a.id} value={a.id}>
                          {[a.label, a.line1, a.locality, a.pincode].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Alert tone="warning" title="This customer has no address" description="Add one from their customer page first." />
                )}
                <Button variant="ghost" className="self-start" onClick={() => { setDismissed(true); setLookupPhone(null); setAddressId(''); }}>
                  Different customer
                </Button>
              </div>
            ) : (
              <form onSubmit={findCustomer} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Mobile number" className="flex-1">
                  <Input type="tel" inputMode="numeric" leadingIcon={Phone} value={phone} onChange={(event) => setPhone(event.target.value)} />
                </Field>
                <Button type="submit" variant="outline" loading={lookup.isFetching}>
                  <Search aria-hidden /> Find
                </Button>
              </form>
            )}

            {isNewCustomer ? (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <Alert tone="info" title="New customer" description="No one has this number yet — add their name and address." />
                <Field label="Customer name" error={fieldError(createCustomer.error, 'fullName')}>
                  <Input value={newCustomerName} onChange={(event) => setNewCustomerName(event.target.value)} />
                </Field>
                <AddressFields value={newAddress} onChange={setNewAddress} error={createCustomer.error} prefix="address." />
              </div>
            ) : null}
            {isApiError(lookup.error) && !notFound ? <Text tone="error">{lookup.error.message}</Text> : null}
          </Card>

          <Card className="flex flex-col gap-4">
            <Heading level={2} size="h3">
              2. Appliance & problem
            </Heading>
            <RadioGroup
              aria-label="Appliance"
              value={categoryId}
              onValueChange={(value) => {
                setCategoryId(value);
                setIssueTypeId('');
              }}
              className="grid gap-2 sm:grid-cols-2"
            >
              {catalog.data?.map((c) => {
                const Icon = CATEGORY_ICONS[c.code as CategoryCode] ?? Wrench;
                return <RadioCard key={c.id} value={c.id} title={c.name} description={`Visit ${formatINR(c.baseVisitCharge)}`} media={<Icon aria-hidden className="size-5" />} />;
              })}
            </RadioGroup>
            {category ? (
              <Field label="Problem type" optional>
                <Select value={issueTypeId} onChange={(event) => setIssueTypeId(event.target.value)}>
                  <option value="">Not sure yet</option>
                  {category.issueTypes.map((issue) => (
                    <option key={issue.id} value={issue.id}>
                      {issue.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="What did the customer say?" error={fieldError(createRequest.error, 'problemDescription')}>
              <Textarea value={problem} onChange={(event) => setProblem(event.target.value)} placeholder="e.g. LG split AC runs but doesn't cool since yesterday" />
            </Field>
          </Card>

          <Card className="flex flex-col gap-4">
            <Heading level={2} size="h3">
              3. Visit
            </Heading>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Visit from" optional>
                <Input type="datetime-local" value={visitFrom} onChange={(event) => setVisitFrom(event.target.value)} />
              </Field>
              <Field label="Visit until" optional error={fieldError(createRequest.error, 'scheduledEnd')}>
                <Input type="datetime-local" value={visitTo} onChange={(event) => setVisitTo(event.target.value)} />
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="LOW">Low</option>
                </Select>
              </Field>
              <Field label="How did they reach us?">
                <Select value={channel} onChange={(event) => setChannel(event.target.value as RequestChannel)}>
                  {CHANNELS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <Card variant="sunken" className="flex flex-col gap-2">
            <Text variant="overline" tone="muted">
              Summary
            </Text>
            <Text weight="semibold">{customer?.fullName ?? (newCustomerName || 'Customer')}</Text>
            <Text variant="sm" tone="secondary">
              {category ? `${category.name} · visit ${formatINR(category.baseVisitCharge)}` : 'Choose an appliance'}
            </Text>
            <Text variant="sm" tone="secondary">
              The customer gets a WhatsApp confirmation with a tracking link.
            </Text>
          </Card>
          {error && !Object.keys(isApiError(error) ? error.fieldErrors : {}).length ? (
            <Alert role="alert" tone="error" title={isApiError(error) ? error.message : "Couldn't create the request."} />
          ) : null}
          <StickyActionBar className="md:flex-col">
            <Button size="lg" fullWidth loading={createCustomer.isPending || createRequest.isPending} disabled={!ready} onClick={() => void submit()}>
              Create request
            </Button>
          </StickyActionBar>
        </aside>
      </div>
    </Stack>
  );
}
