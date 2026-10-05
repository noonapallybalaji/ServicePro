import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetCustomerQueryKey,
  useAddCustomerAddress,
  useAddCustomerAppliance,
  useGetActiveCatalog,
  useGetCustomer,
  useListServiceRequests,
  useUpdateCustomer,
  type CustomerResponse,
} from '@servicepro/api-client';
import {
  Badge,
  Button,
  Card,
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
  PageHeader,
  Select,
  Stack,
  Text,
  Textarea,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, MapPin, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { paths } from '../../app/paths';
import { BackLink, fieldError } from '../../components/common';
import { RequestList } from '../../components/request-list';
import { AddressFields, emptyAddress, type AddressDraft } from './address-fields';

export function CustomerDetailPage() {
  const { customerId = '' } = useParams();
  const customer = useGetCustomer(customerId);
  return (
    <Stack gap={6}>
      <BackLink to={paths.customers} label="Customers" />
      <QueryState query={customer} loading={<DefaultSkeleton rows={3} />} errorTitle="Couldn't open this customer">
        {(data) => <CustomerDetail customer={data} />}
      </QueryState>
    </Stack>
  );
}

function CustomerDetail({ customer }: { customer: CustomerResponse }) {
  const [dialog, setDialog] = useState<'edit' | 'address' | 'appliance' | null>(null);
  const jobs = useListServiceRequests({ customerId: customer.id, pageSize: 50 });
  const catalog = useGetActiveCatalog();
  const categoryName = (id: string) => catalog.data?.find((c) => c.id === id)?.name ?? 'Appliance';

  return (
    <>
      <PageHeader
        title={customer.fullName}
        description={`${customer.primaryPhone}${customer.alternatePhone ? ` · ${customer.alternatePhone}` : ''}${customer.email ? ` · ${customer.email}` : ''}`}
        eyebrow={customer.isBlocked ? <Badge tone="error">Blocked</Badge> : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil aria-hidden /> Edit
            </Button>
            <Button asChild>
              <Link to={paths.newRequest(customer.id)}>
                <Plus aria-hidden /> New request
              </Link>
            </Button>
          </>
        }
      />
      {customer.notes ? (
        <Card variant="sunken">
          <Text variant="sm">{customer.notes}</Text>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="jobs" className="flex flex-col gap-3 lg:col-span-2">
          <Heading level={2} size="h3" id="jobs">
            Service history
          </Heading>
          <QueryState query={jobs} loading={<DefaultSkeleton rows={2} />}>
            {(data) =>
              data.items.length === 0 ? (
                <Card>
                  <EmptyState size="compact" icon={Inbox} title="No service requests yet" />
                </Card>
              ) : (
                <RequestList requests={data.items} showCustomer={false} />
              )
            }
          </QueryState>
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="addresses" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Heading level={2} size="h3" id="addresses">
                Addresses
              </Heading>
              <Button variant="ghost" size="sm" onClick={() => setDialog('address')}>
                <Plus aria-hidden /> Add
              </Button>
            </div>
            {customer.addresses.map((a) => (
              <Card key={a.id} padding="sm" className="flex gap-2">
                <MapPin aria-hidden className="mt-1 size-4 shrink-0 text-foreground-muted" />
                <div className="flex flex-col">
                  <Text variant="sm" weight="semibold">
                    {a.label ?? 'Address'} {a.isDefault ? <Badge size="sm">Default</Badge> : null}
                  </Text>
                  <Text variant="sm" tone="secondary">
                    {[a.line1, a.line2, a.locality, a.city, a.pincode].filter(Boolean).join(', ')}
                  </Text>
                  {a.landmark ? (
                    <Text variant="caption" tone="muted">
                      Landmark: {a.landmark}
                    </Text>
                  ) : null}
                </div>
              </Card>
            ))}
          </section>

          <section aria-labelledby="appliances" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Heading level={2} size="h3" id="appliances">
                Appliances
              </Heading>
              <Button variant="ghost" size="sm" onClick={() => setDialog('appliance')}>
                <Plus aria-hidden /> Add
              </Button>
            </div>
            {customer.appliances.length === 0 ? (
              <Text variant="sm" tone="muted">
                None recorded.
              </Text>
            ) : (
              customer.appliances.map((a) => (
                <Card key={a.id} padding="sm">
                  <Text variant="sm" weight="semibold">
                    {categoryName(a.categoryId)} {a.brand ? `· ${a.brand}` : ''}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {[a.applianceType, a.capacity, a.modelNumber, a.purchaseYear ? `bought ${a.purchaseYear}` : null].filter(Boolean).join(' · ') || 'No details'}
                  </Text>
                </Card>
              ))
            )}
          </section>
        </aside>
      </div>

      <EditCustomerDialog customer={customer} open={dialog === 'edit'} onOpenChange={(o) => setDialog(o ? 'edit' : null)} />
      <AddAddressDialog customer={customer} open={dialog === 'address'} onOpenChange={(o) => setDialog(o ? 'address' : null)} />
      <AddApplianceDialog customer={customer} open={dialog === 'appliance'} onOpenChange={(o) => setDialog(o ? 'appliance' : null)} />
    </>
  );
}

interface DialogProps {
  customer: CustomerResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useRefresh(customerId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
}

function EditCustomerDialog({ customer, open, onOpenChange }: DialogProps) {
  const [name, setName] = useState(customer.fullName);
  const [phone, setPhone] = useState(customer.primaryPhone);
  const [alternate, setAlternate] = useState(customer.alternatePhone ?? '');
  const [email, setEmail] = useState(customer.email ?? '');
  const [language, setLanguage] = useState(customer.preferredLanguage);
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [blocked, setBlocked] = useState(customer.isBlocked);
  const refresh = useRefresh(customer.id);
  const update = useUpdateCustomer({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Customer updated');
        onOpenChange(false);
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Edit customer" />
        <DialogBody>
          <Stack gap={4}>
            <Field label="Full name" error={fieldError(update.error, 'fullName')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Mobile">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Alternate phone" optional>
              <Input type="tel" value={alternate} onChange={(e) => setAlternate(e.target.value)} />
            </Field>
            <Field label="Email" optional error={fieldError(update.error, 'email')}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="en">English</option>
                <option value="te">Telugu</option>
                <option value="hi">Hindi</option>
              </Select>
            </Field>
            <Field label="Notes" optional>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Checkbox label="Blocked" description="Spam or abusive: we won't accept new requests." checked={blocked} onCheckedChange={(v) => setBlocked(v === true)} />
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            onClick={() =>
              update.mutate({
                customerId: customer.id,
                data: { fullName: name, phone, alternatePhone: alternate || null, email: email || null, preferredLanguage: language, isBlocked: blocked, notes: notes || null },
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddAddressDialog({ customer, open, onOpenChange }: DialogProps) {
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const [label, setLabel] = useState('Home');
  const [makeDefault, setMakeDefault] = useState(false);
  const refresh = useRefresh(customer.id);
  const add = useAddCustomerAddress({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Address added');
        setAddress(emptyAddress);
        onOpenChange(false);
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Add address" />
        <DialogBody>
          <Stack gap={4}>
            <Field label="Label" optional>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home, Office, Parents" />
            </Field>
            <AddressFields value={address} onChange={setAddress} error={add.error} prefix="address." />
            <Checkbox label="Make this the default address" checked={makeDefault} onCheckedChange={(v) => setMakeDefault(v === true)} />
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={add.isPending}
            onClick={() =>
              add.mutate({
                customerId: customer.id,
                data: { makeDefault, address: { ...address, label: label || null, line2: address.line2 || null, landmark: address.landmark || null, latitude: null, longitude: null } },
              })
            }
          >
            Add address
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddApplianceDialog({ customer, open, onOpenChange }: DialogProps) {
  const catalog = useGetActiveCatalog();
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');
  const [capacity, setCapacity] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const refresh = useRefresh(customer.id);
  const add = useAddCustomerAppliance({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Appliance added');
        onOpenChange(false);
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Add appliance" />
        <DialogBody>
          <Stack gap={4}>
            <Field label="Appliance">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="" disabled>
                  Choose…
                </option>
                {catalog.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Brand" optional>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </Field>
              <Field label="Type" optional>
                <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="Split, front load…" />
              </Field>
              <Field label="Capacity" optional>
                <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="1.5 ton, 7 kg…" />
              </Field>
              <Field label="Model number" optional>
                <Input value={model} onChange={(e) => setModel(e.target.value)} />
              </Field>
              <Field label="Purchase year" optional error={fieldError(add.error, 'purchaseYear')}>
                <Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
              </Field>
            </div>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={add.isPending}
            disabled={!categoryId}
            onClick={() =>
              add.mutate({
                customerId: customer.id,
                data: {
                  categoryId,
                  brand: brand || null,
                  applianceType: type || null,
                  capacity: capacity || null,
                  modelNumber: model || null,
                  serialNumber: null,
                  purchaseYear: year ? Number(year) : null,
                  warrantyUntil: null,
                },
              })
            }
          >
            Add appliance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
