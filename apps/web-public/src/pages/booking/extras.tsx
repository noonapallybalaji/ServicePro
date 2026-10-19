import { apiUrl, session } from '@servicepro/api-client';
import { Checkbox, Field, Input, Textarea } from '@servicepro/ui';
import { Phone, UserRound } from 'lucide-react';

import type { Draft } from './draft';

/*
 * Optional booking details. None of them is required: they help the technician find the home
 * and reach the right person.
 */

type Update = (patch: Partial<Draft>) => void;

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
  const extras = {
    accessNotes: draft.accessNotes.trim() || null,
    contactName: draft.someoneElse ? draft.contactName.trim() || null : null,
    contactPhone: draft.someoneElse ? draft.contactPhone.trim() || null : null,
    applianceBrand: null,
    applianceModel: null,
    purchaseYear: null,
    underWarranty: null,
  };
  return Object.values(extras).some((v) => v !== null) ? extras : null;
}

/** Uploads photos to a booking with the customer's session (used from My bookings); returns how many failed. */
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
