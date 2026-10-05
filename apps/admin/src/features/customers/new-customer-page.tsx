import { isApiError, useCreateCustomer, type RequestChannel } from '@servicepro/api-client';
import { Alert, Button, Card, Field, Heading, Input, PageHeader, Select, Stack, StickyActionBar, Textarea, toast } from '@servicepro/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { paths } from '../../app/paths';
import { BackLink, fieldError } from '../../components/common';
import { AddressFields, emptyAddress, type AddressDraft } from './address-fields';

export function NewCustomerPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('en');
  const [source, setSource] = useState<RequestChannel>('PHONE');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState<AddressDraft>(emptyAddress);
  const create = useCreateCustomer({
    mutation: {
      meta: { silent: true },
      onSuccess: (customer) => {
        toast.success('Customer added');
        void navigate(paths.customer(customer.id));
      },
    },
  });
  const duplicate = isApiError(create.error) && create.error.code === 'customer.phone_taken';

  return (
    <Stack gap={6}>
      <BackLink to={paths.customers} label="Customers" />
      <PageHeader title="New customer" />
      {duplicate ? <Alert role="alert" tone="warning" title="This phone number already belongs to a customer" description="Search for it on the Customers page instead." /> : null}
      <Card className="flex max-w-prose flex-col gap-5">
        <Heading level={2} size="h3">
          Contact
        </Heading>
        <Field label="Full name" error={fieldError(create.error, 'fullName')}>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mobile" error={fieldError(create.error, 'phone') ?? (isApiError(create.error) && create.error.code?.startsWith('phone.') ? create.error.message : undefined)}>
            <Input type="tel" inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Alternate phone" optional>
            <Input type="tel" inputMode="numeric" value={alternatePhone} onChange={(event) => setAlternatePhone(event.target.value)} />
          </Field>
          <Field label="Email" optional error={fieldError(create.error, 'email')}>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Language">
            <Select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">English</option>
              <option value="te">Telugu</option>
              <option value="hi">Hindi</option>
            </Select>
          </Field>
          <Field label="First contact via">
            <Select value={source} onChange={(event) => setSource(event.target.value as RequestChannel)}>
              <option value="PHONE">Phone</option>
              <option value="WHATS_APP">WhatsApp</option>
              <option value="WALK_IN">Walk-in</option>
              <option value="REFERRAL">Referral</option>
              <option value="MANUAL">Other</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes" optional>
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <Heading level={2} size="h3">
          Address
        </Heading>
        <AddressFields value={address} onChange={setAddress} error={create.error} prefix="address." />
      </Card>
      <StickyActionBar className="md:max-w-prose md:justify-start">
        <Button
          size="lg"
          loading={create.isPending}
          disabled={!name.trim() || !phone.trim()}
          onClick={() =>
            create.mutate({
              data: {
                fullName: name,
                phone,
                alternatePhone: alternatePhone || null,
                email: email || null,
                preferredLanguage: language,
                source,
                notes: notes || null,
                address: address.line1
                  ? { ...address, label: 'Home', line2: address.line2 || null, landmark: address.landmark || null, latitude: null, longitude: null }
                  : null,
              },
            })
          }
        >
          Save customer
        </Button>
      </StickyActionBar>
    </Stack>
  );
}
