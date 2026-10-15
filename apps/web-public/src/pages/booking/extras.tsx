import { apiUrl, session, useListBrands } from '@servicepro/api-client';
import { Button, Checkbox, Field, Input, RadioCard, RadioGroup, Text, Textarea } from '@servicepro/ui';
import { ChevronDown, ImagePlus, Phone, UserRound, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import type { Draft } from './draft';

/*
 * Optional booking details. None of them is required: they help the technician find the home,
 * reach the right person, and arrive with the right parts.
 */

type Update = (patch: Partial<Draft>) => void;

export const MAX_PHOTOS = 3;

/** Brand, model, year bought and "under warranty?", folded away until the customer opens it. */
export function ApplianceDetails({ draft, update }: { draft: Draft; update: Update }) {
  const [open, setOpen] = useState(Boolean(draft.applianceBrand || draft.applianceModel || draft.purchaseYear));
  const brands = useListBrands({ query: { enabled: open, staleTime: 60 * 60 * 1000 } });
  const listId = useId();

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <ChevronDown aria-hidden /> Add brand and model (optional)
      </Button>
    );
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">About the appliance (optional)</legend>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Brand">
          <Input list={listId} value={draft.applianceBrand} maxLength={80} onChange={(e) => update({ applianceBrand: e.target.value })} />
        </Field>
        <datalist id={listId}>
          {brands.data?.filter((b) => b.isActive).map((b) => <option key={b.id} value={b.name} />)}
        </datalist>
        <Field label="Model" hint="On the sticker, often inside the door or at the back.">
          <Input value={draft.applianceModel} maxLength={80} onChange={(e) => update({ applianceModel: e.target.value })} />
        </Field>
        <Field label="Year bought">
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="e.g. 2021"
            value={draft.purchaseYear}
            onChange={(e) => update({ purchaseYear: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Is it under the maker's warranty?</legend>
        <RadioGroup value={draft.underWarranty} onValueChange={(v) => update({ underWarranty: v as Draft['underWarranty'] })} className="grid grid-cols-3 gap-2">
          <RadioCard value="yes" title="Yes" />
          <RadioCard value="no" title="No" />
          <RadioCard value="unsure" title="Not sure" />
        </RadioGroup>
      </fieldset>
    </fieldset>
  );
}

/** Up to three photos of the problem. They upload right after the booking is made. */
export function ProblemPhotos({ draft, update }: { draft: Draft; update: Update }) {
  const previews = useMemo(() => draft.photos.map((file) => URL.createObjectURL(file)), [draft.photos]);
  const inputId = useId();

  // Free the preview URLs when the photos change or the step closes.
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(files: FileList | null) {
    const images = Array.from(files ?? []).filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= 10 * 1024 * 1024);
    update({ photos: [...draft.photos, ...images].slice(0, MAX_PHOTOS) });
  }

  return (
    <div className="flex flex-col gap-2">
      <Text variant="sm" weight="semibold">
        Photos of the problem <span className="font-normal text-foreground-muted">(optional)</span>
      </Text>
      <div className="flex flex-wrap gap-3">
        {previews.map((url, index) => (
          <div key={url} className="relative size-20 overflow-hidden rounded-control border border-border">
            <img src={url} alt={`Your upload ${index + 1}`} className="size-full object-cover" />
            <button
              type="button"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => update({ photos: draft.photos.filter((_, i) => i !== index) })}
              className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-pill bg-surface/90 text-foreground"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
        {draft.photos.length < MAX_PHOTOS ? (
          <label
            htmlFor={inputId}
            className="pressable transition-interactive flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-border-strong text-caption text-foreground-secondary hover:border-primary"
          >
            <ImagePlus aria-hidden className="size-5" /> Add
            <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
        ) : null}
      </div>
      <Text variant="caption" tone="muted">
        Error codes, leaks, the model sticker: up to {MAX_PHOTOS} photos help the technician bring the right parts.
      </Text>
    </div>
  );
}

export function AccessNotes({ draft, update }: { draft: Draft; update: Update }) {
  return (
    <Field label="Directions for the technician" optional hint="Gate code, floor, parking, “call when you arrive”…">
      <Textarea rows={2} maxLength={300} value={draft.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} />
    </Field>
  );
}

/** "Someone else will be at home": name and number the technician calls instead. */
export function SomeoneElse({ draft, update, phoneError }: { draft: Draft; update: Update; phoneError?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Checkbox
        checked={draft.someoneElse}
        onCheckedChange={(checked) => update({ someoneElse: checked === true })}
        label="Someone else will be at home"
        description="For example, booking for your parents. The technician will call them."
      />
      {draft.someoneElse ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Their name">
            <Input leadingIcon={UserRound} value={draft.contactName} maxLength={120} onChange={(e) => update({ contactName: e.target.value })} />
          </Field>
          <Field label="Their mobile number" error={phoneError}>
            <Input type="tel" inputMode="numeric" leadingIcon={Phone} placeholder="98765 43210" value={draft.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** The optional details as the API expects them (null when the customer gave none). */
export function bookingExtras(draft: Draft) {
  const year = Number.parseInt(draft.purchaseYear, 10);
  const extras = {
    accessNotes: draft.accessNotes.trim() || null,
    contactName: draft.someoneElse ? draft.contactName.trim() || null : null,
    contactPhone: draft.someoneElse ? draft.contactPhone.trim() || null : null,
    applianceBrand: draft.applianceBrand.trim() || null,
    applianceModel: draft.applianceModel.trim() || null,
    purchaseYear: Number.isFinite(year) ? year : null,
    underWarranty: draft.underWarranty === 'yes' ? true : draft.underWarranty === 'no' ? false : null,
  };
  return Object.values(extras).some((v) => v !== null) ? extras : null;
}

/** Uploads the booking's photos with the session the booking just created; returns how many failed. */
export async function uploadPhotos(serviceRequestId: string, photos: File[]): Promise<number> {
  let failed = 0;
  for (const photo of photos) {
    const form = new FormData();
    form.append('file', photo);
    try {
      const response = await fetch(apiUrl(`/api/v1/account/bookings/${serviceRequestId}/photos`), {
        method: 'POST',
        body: form,
        headers: { Authorization: `Bearer ${session.getAccessToken() ?? ''}` },
        credentials: 'same-origin',
      });
      if (!response.ok) failed++;
    } catch {
      failed++;
    }
  }

  return failed;
}
