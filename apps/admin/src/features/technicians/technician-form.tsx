import type { CategoryResponse, CommissionType, EmploymentType, ServiceAreaResponse, SkillInput } from '@servicepro/api-client';
import { Checkbox, Field, Input, Select, Text } from '@servicepro/ui';

import { fieldError } from '../../components/common';

export interface ProfileDraft {
  fullName: string;
  phone: string;
  employeeCode: string;
  employmentType: EmploymentType;
  maxJobsPerDay: string;
  commissionType: CommissionType;
  commissionValue: string;
  homeLatitude: string;
  homeLongitude: string;
}

export const emptyProfile: ProfileDraft = {
  fullName: '',
  phone: '',
  employeeCode: '',
  employmentType: 'EMPLOYEE',
  maxJobsPerDay: '6',
  commissionType: 'PERCENT',
  commissionValue: '20',
  homeLatitude: '',
  homeLongitude: '',
};

export function toProfileInput(draft: ProfileDraft) {
  return {
    fullName: draft.fullName,
    phone: draft.phone,
    employeeCode: draft.employeeCode || null,
    employmentType: draft.employmentType,
    maxJobsPerDay: Number(draft.maxJobsPerDay) || 0,
    commissionType: draft.commissionType,
    commissionValue: Number(draft.commissionValue) || 0,
    homeLatitude: draft.homeLatitude ? Number(draft.homeLatitude) : null,
    homeLongitude: draft.homeLongitude ? Number(draft.homeLongitude) : null,
  };
}

/** Name, phone (their login), job cap and commission (PLAN.md §7.8). */
export function ProfileFields({ value, onChange, error, prefix = '' }: { value: ProfileDraft; onChange: (next: ProfileDraft) => void; error?: unknown; prefix?: string }) {
  const set = <K extends keyof ProfileDraft>(key: K, v: ProfileDraft[K]) => onChange({ ...value, [key]: v });
  const err = (key: string) => fieldError(error, `${prefix}${key}`);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" error={err('fullName')}>
        <Input value={value.fullName} onChange={(e) => set('fullName', e.target.value)} />
      </Field>
      <Field label="Mobile (used to sign in)" error={err('phone')}>
        <Input type="tel" inputMode="numeric" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="Employee code" optional>
        <Input value={value.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} />
      </Field>
      <Field label="Employment">
        <Select value={value.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
          <option value="EMPLOYEE">Employee</option>
          <option value="CONTRACTOR">Contractor</option>
        </Select>
      </Field>
      <Field label="Max jobs per day" error={err('maxJobsPerDay')}>
        <Input inputMode="numeric" value={value.maxJobsPerDay} onChange={(e) => set('maxJobsPerDay', e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Commission">
          <Select value={value.commissionType} onChange={(e) => set('commissionType', e.target.value as CommissionType)}>
            <option value="PERCENT">% of bill</option>
            <option value="FIXED">₹ per job</option>
          </Select>
        </Field>
        <Field label="Value" error={err('commissionValue')}>
          <Input inputMode="decimal" value={value.commissionValue} onChange={(e) => set('commissionValue', e.target.value)} />
        </Field>
      </div>
      <Field label="Home latitude" optional hint="Used for distance until the app reports live location.">
        <Input inputMode="decimal" value={value.homeLatitude} onChange={(e) => set('homeLatitude', e.target.value)} />
      </Field>
      <Field label="Home longitude" optional>
        <Input inputMode="decimal" value={value.homeLongitude} onChange={(e) => set('homeLongitude', e.target.value)} />
      </Field>
    </div>
  );
}

/** Skill per appliance category, level 1 (trainee) – 5 (expert). Level 0 = no skill. */
export function SkillsEditor({ categories, value, onChange }: { categories: readonly CategoryResponse[]; value: SkillInput[]; onChange: (next: SkillInput[]) => void }) {
  const levelOf = (categoryId: string) => value.find((s) => s.categoryId === categoryId)?.level ?? 0;
  const setLevel = (categoryId: string, level: number) =>
    onChange(level === 0 ? value.filter((s) => s.categoryId !== categoryId) : [...value.filter((s) => s.categoryId !== categoryId), { categoryId, level }]);

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {categories.map((category) => (
        <li key={category.id}>
          <Field label={category.name}>
            <Select value={String(levelOf(category.id))} onChange={(e) => setLevel(category.id, Number(e.target.value))}>
              <option value="0">No skill</option>
              <option value="1">1 · Trainee</option>
              <option value="2">2 · Basic</option>
              <option value="3">3 · Skilled</option>
              <option value="4">4 · Senior</option>
              <option value="5">5 · Expert</option>
            </Select>
          </Field>
        </li>
      ))}
    </ul>
  );
}

export function AreasEditor({ areas, value, onChange }: { areas: readonly ServiceAreaResponse[]; value: string[]; onChange: (next: string[]) => void }) {
  if (areas.length === 0) {
    return (
      <Text variant="sm" tone="secondary">
        No service areas yet — add them under Settings → Service areas.
      </Text>
    );
  }

  return (
    <ul className="grid gap-1 sm:grid-cols-2">
      {areas.map((area) => (
        <li key={area.id}>
          <Checkbox
            label={area.name}
            description={area.pincodes.join(', ')}
            checked={value.includes(area.id)}
            onCheckedChange={(checked) => onChange(checked === true ? [...value, area.id] : value.filter((id) => id !== area.id))}
          />
        </li>
      ))}
    </ul>
  );
}
