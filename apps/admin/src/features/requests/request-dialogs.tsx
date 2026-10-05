import {
  getGetServiceRequestQueryKey,
  useAddServiceRequestNote,
  useRecordPayment,
  useTransitionServiceRequest,
  useUnassignTechnician,
  useUpdateServiceRequest,
  useWaivePayment,
  type AvailableTransition,
  type PaymentMethod,
  type Priority,
  type ServiceRequestDetail,
} from '@servicepro/api-client';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  Field,
  Input,
  RadioCard,
  RadioGroup,
  SERVICE_REQUEST_STATUS,
  Select,
  Stack,
  Textarea,
  formatINR,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { fieldError } from '../../components/common';

interface DialogProps {
  request: ServiceRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useRefreshRequest(id: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetServiceRequestQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/service-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/dashboard'] }),
    ]);
}

const OFFICE_REASONS = [
  { code: 'CUSTOMER_REQUEST', label: 'Customer asked' },
  { code: 'DUPLICATE', label: 'Duplicate request' },
  { code: 'NOT_SERVICEABLE', label: "We can't serve this" },
  { code: 'CONFIRMED_BY_PHONE', label: 'Confirmed with the customer by phone' },
  { code: 'OTHER', label: 'Other (explain in the note)' },
];

/** Any status change staff may make right now (from the API's allowed list). */
export function StatusChangeDialog({ request, open, onOpenChange }: DialogProps) {
  const transitions = request.availableTransitions;
  const [target, setTarget] = useState<AvailableTransition | null>(null);
  const [reason, setReason] = useState(OFFICE_REASONS[0]?.code ?? 'OTHER');
  const [note, setNote] = useState('');
  const refresh = useRefreshRequest(request.card.id);
  const transition = useTransitionServiceRequest({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Status updated');
        onOpenChange(false);
        setTarget(null);
        setNote('');
      },
    },
  });

  const needsReason = Boolean(target && (target.requiresReason || target.requiresCompletionCode));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Change status" description="Only changes allowed from the current status are shown." />
        <DialogBody>
          <Stack gap={4}>
            <RadioGroup
              aria-label="New status"
              value={target?.to ?? ''}
              onValueChange={(value) => setTarget(transitions.find((t) => t.to === value) ?? null)}
            >
              {transitions.map((t) => (
                <RadioCard
                  key={t.to}
                  value={t.to}
                  title={SERVICE_REQUEST_STATUS[t.to].labels.staff}
                  description={t.requiresCompletionCode ? "Without the customer's code — needs a reason" : t.requiresReason ? 'Needs a reason' : undefined}
                />
              ))}
            </RadioGroup>
            {needsReason ? (
              <Field label="Reason">
                <Select value={reason} onChange={(event) => setReason(event.target.value)}>
                  {OFFICE_REASONS.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Note" optional>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={target?.to === 'CANCELLED' ? 'destructive' : 'primary'}
            disabled={!target}
            loading={transition.isPending}
            onClick={() =>
              target &&
              transition.mutate({
                serviceRequestId: request.card.id,
                data: { to: target.to, reasonCode: needsReason ? reason : null, note: note.trim() || null, completionCode: null, latitude: null, longitude: null },
              })
            }
          >
            {target ? `Move to "${SERVICE_REQUEST_STATUS[target.to].labels.staff}"` : 'Choose a status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'Urgent' },
  { value: 'EMERGENCY', label: 'Emergency' },
];

/** <input type="datetime-local"> value ↔ ISO string, in the browser's (business) time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function EditRequestDialog({ request, open, onOpenChange }: DialogProps) {
  const [problem, setProblem] = useState(request.problemDescription);
  const [priority, setPriority] = useState<Priority>(request.card.priority);
  const [start, setStart] = useState(toLocalInput(request.card.scheduledStart));
  const [end, setEnd] = useState(toLocalInput(request.card.scheduledEnd));
  const refresh = useRefreshRequest(request.card.id);
  const update = useUpdateServiceRequest({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Request updated');
        onOpenChange(false);
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title={`Edit ${request.card.srNumber}`} />
        <DialogBody>
          <Stack gap={4}>
            <Field label="Problem" error={fieldError(update.error, 'problemDescription')}>
              <Textarea value={problem} onChange={(event) => setProblem(event.target.value)} />
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Visit from" optional>
                <Input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
              </Field>
              <Field label="Visit until" optional error={fieldError(update.error, 'scheduledEnd')}>
                <Input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
              </Field>
            </div>
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
                serviceRequestId: request.card.id,
                data: {
                  applianceId: request.applianceId ?? null,
                  issueTypeId: request.issueTypeId ?? null,
                  problemDescription: problem,
                  priority,
                  preferredSlotStart: request.preferredSlotStart ?? null,
                  preferredSlotEnd: request.preferredSlotEnd ?? null,
                  scheduledStart: fromLocalInput(start),
                  scheduledEnd: fromLocalInput(end),
                },
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

/** Staff-recorded payments: UPI/bank transfers received at the office, or waiving the bill. */
export function StaffPaymentDialog({ request, open, onOpenChange }: DialogProps) {
  const outstanding = request.invoice ? Math.round((request.invoice.total - request.invoice.amountPaid) * 100) / 100 : 0;
  const [method, setMethod] = useState<PaymentMethod>('UPI_QR');
  const [amount, setAmount] = useState(String(outstanding));
  const [reference, setReference] = useState('');
  const [waive, setWaive] = useState(false);
  const [waiveReason, setWaiveReason] = useState('');
  const refresh = useRefreshRequest(request.card.id);
  const onDone = async (message: string) => {
    await refresh();
    toast.success(message);
    onOpenChange(false);
  };
  const pay = useRecordPayment({ mutation: { onSuccess: () => onDone('Payment recorded') } });
  const waivePayment = useWaivePayment({ mutation: { onSuccess: () => onDone('Payment waived — job closed') } });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Record payment" description={request.invoice ? `${request.invoice.invoiceNumber} · balance ${formatINR(outstanding)}` : 'No bill yet'} />
        <DialogBody>
          <Stack gap={4}>
            <Checkbox label="Waive the payment" description="Goodwill or warranty: closes the job without charging." checked={waive} onCheckedChange={(v) => setWaive(v === true)} />
            {waive ? (
              <Field label="Why is it waived?">
                <Input value={waiveReason} onChange={(event) => setWaiveReason(event.target.value)} />
              </Field>
            ) : (
              <>
                <Field label="Method">
                  <Select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
                    <option value="UPI_QR">UPI (business QR)</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CARD">Card</option>
                    <option value="CASH">Cash at the office</option>
                  </Select>
                </Field>
                <Field label="Amount" error={fieldError(pay.error, 'amount')}>
                  <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </Field>
                <Field label="Reference" optional>
                  <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UTR / transaction id" />
                </Field>
              </>
            )}
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {waive ? (
            <Button
              loading={waivePayment.isPending}
              disabled={waiveReason.trim().length < 3}
              onClick={() => waivePayment.mutate({ serviceRequestId: request.card.id, data: { reason: waiveReason.trim() } })}
            >
              Waive and close
            </Button>
          ) : (
            <Button
              loading={pay.isPending}
              disabled={!request.invoice || Number(amount) <= 0}
              onClick={() =>
                pay.mutate({ serviceRequestId: request.card.id, data: { method, amount: Number(amount), reference: reference.trim() || null } })
              }
            >
              Record {formatINR(Number(amount) || 0)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnassignDialog({ request, open, onOpenChange }: DialogProps) {
  const [reason, setReason] = useState('');
  const refresh = useRefreshRequest(request.card.id);
  const unassign = useUnassignTechnician({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Job returned to the queue');
        onOpenChange(false);
        setReason('');
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Take the job back?" description={`${request.technician?.fullName ?? 'The technician'} will be told the job was reassigned.`} />
        <DialogBody>
          <Field label="Reason">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Technician fell ill" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep assignment
          </Button>
          <Button variant="destructive" loading={unassign.isPending} disabled={reason.trim().length < 3} onClick={() => unassign.mutate({ serviceRequestId: request.card.id, data: { reason: reason.trim() } })}>
            Unassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddNoteForm({ requestId }: { requestId: string }) {
  const [body, setBody] = useState('');
  const [toCustomer, setToCustomer] = useState(false);
  const refresh = useRefreshRequest(requestId);
  const add = useAddServiceRequestNote({
    mutation: {
      onSuccess: async () => {
        await refresh();
        setBody('');
        setToCustomer(false);
      },
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate({ serviceRequestId: requestId, data: { body: body.trim(), visibility: toCustomer ? 'CUSTOMER' : 'INTERNAL' } });
      }}
      className="flex flex-col gap-3"
    >
      <Field label="Add a note">
        <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Visible to the office and the technician" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox label="Also show to the customer" checked={toCustomer} onCheckedChange={(v) => setToCustomer(v === true)} />
        <Button type="submit" variant="secondary" loading={add.isPending} disabled={!body.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}
