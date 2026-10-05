import { Field, Input } from '@servicepro/ui';
import type { ChangeEvent } from 'react';

import { fieldError } from '../../components/common';

export interface AddressDraft {
  line1: string;
  line2: string;
  landmark: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
}

export const emptyAddress: AddressDraft = {
  line1: '',
  line2: '',
  landmark: '',
  locality: '',
  city: 'Hyderabad',
  state: 'Telangana',
  pincode: '',
};

/**
 * Indian address entry (PLAN.md §7.4): landmark gets its own field because it's often more
 * useful to the technician than the street. `prefix` maps API field errors ("address.pincode").
 */
export function AddressFields({
  value,
  onChange,
  error,
  prefix = '',
}: {
  value: AddressDraft;
  onChange: (next: AddressDraft) => void;
  error?: unknown;
  prefix?: string;
}) {
  const set = (key: keyof AddressDraft) => (event: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: event.target.value });
  const err = (key: string) => fieldError(error, `${prefix}${key}`);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Flat / house, building" className="sm:col-span-2" error={err('line1')}>
        <Input value={value.line1} onChange={set('line1')} autoComplete="address-line1" />
      </Field>
      <Field label="Street" optional className="sm:col-span-2">
        <Input value={value.line2} onChange={set('line2')} autoComplete="address-line2" />
      </Field>
      <Field label="Landmark" optional className="sm:col-span-2" hint="e.g. Opposite Ratnadeep, near Kondapur RTO">
        <Input value={value.landmark} onChange={set('landmark')} />
      </Field>
      <Field label="Locality" error={err('locality')}>
        <Input value={value.locality} onChange={set('locality')} />
      </Field>
      <Field label="Pincode" error={err('pincode')}>
        <Input inputMode="numeric" maxLength={6} value={value.pincode} onChange={set('pincode')} autoComplete="postal-code" />
      </Field>
      <Field label="City" error={err('city')}>
        <Input value={value.city} onChange={set('city')} autoComplete="address-level2" />
      </Field>
      <Field label="State" error={err('state')}>
        <Input value={value.state} onChange={set('state')} autoComplete="address-level1" />
      </Field>
    </div>
  );
}
