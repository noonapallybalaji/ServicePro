import {
  getListEstimatesQueryKey,
  useGetPriceList,
  useSaveInvoice,
  useSendEstimate,
  type EstimateResponse,
  type InvoiceLineInput,
  type InvoiceLineType,
  type ServiceRequestDetail,
} from '@servicepro/api-client';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  IconButton,
  Input,
  Select,
  Stack,
  Text,
  formatINR,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useRefreshJob } from '../use-job-mutations';

interface BillSheetProps {
  job: ServiceRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "estimate": the same builder sends an estimate for the customer to approve. */
  mode?: 'bill' | 'estimate';
  /** Starting lines: the latest estimate (to revise it, or to bill what was approved). */
  estimate?: EstimateResponse;
}

interface DraftLine {
  key: number;
  type: InvoiceLineType;
  description: string;
  quantity: string;
  unitPrice: string;
}

const LINE_TYPES: { value: InvoiceLineType; label: string }[] = [
  { value: 'VISIT', label: 'Visit' },
  { value: 'LABOUR', label: 'Labour' },
  { value: 'PART', label: 'Part' },
  { value: 'OTHER', label: 'Other' },
];

let nextKey = 1;

function initialLines(job: ServiceRequestDetail, estimate: EstimateResponse | undefined): DraftLine[] {
  if (job.invoice && job.invoice.lines.length > 0) {
    return job.invoice.lines.map((line) => ({
      key: nextKey++,
      type: line.type as InvoiceLineType,
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    }));
  }

  if (estimate && estimate.lines.length > 0) {
    return estimate.lines.map((line) => ({
      key: nextKey++,
      type: line.type,
      description: line.description,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
    }));
  }

  return [{ key: nextKey++, type: 'VISIT', description: 'Visiting charge', quantity: '1', unitPrice: String(job.visitCharge) }];
}

const toNumber = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/**
 * The bill builder (USER-FLOWS.md §2.2 step 8): price list first, free text second.
 * The form is a child of the dialog content, so it starts fresh from the job every time it opens.
 */
export function BillSheet({ job, open, onOpenChange, mode = 'bill', estimate }: BillSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent presentation="drawer">
        <DialogHeader
          title={mode === 'estimate' ? 'Estimate for the customer' : 'Bill'}
          description={
            mode === 'estimate'
              ? `${job.card.srNumber} · ${job.card.customerName} approves it on their phone before you start.`
              : `${job.card.srNumber} · ${job.card.customerName}`
          }
        />
        <BillForm job={job} mode={mode} estimate={estimate} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BillForm({ job, mode, estimate, onSaved }: { job: ServiceRequestDetail; mode: 'bill' | 'estimate'; estimate?: EstimateResponse; onSaved: () => void }) {
  const [lines, setLines] = useState<DraftLine[]>(() => initialLines(job, estimate));
  const queryClient = useQueryClient();
  const priceList = useGetPriceList({ categoryId: job.card.categoryId });
  const refresh = useRefreshJob(job.card.id);
  const save = useSaveInvoice({
    mutation: {
      onSuccess: async () => {
        await refresh();
        toast.success('Bill saved');
        onSaved();
      },
    },
  });

  const send = useSendEstimate({
    mutation: {
      onSuccess: async () => {
        await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey(job.card.id) })]);
        toast.success('Estimate sent', { description: "The customer approves it on WhatsApp. You'll be notified." });
        onSaved();
      },
    },
  });

  const total = lines.reduce((sum, line) => sum + toNumber(line.quantity) * toNumber(line.unitPrice), 0);
  const valid = lines.length > 0 && lines.every((l) => l.description.trim() && toNumber(l.quantity) > 0 && toNumber(l.unitPrice) >= 0);

  function update(key: number, change: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  function addFromPriceList(itemId: string) {
    const item = priceList.data?.find((p) => p.id === itemId);
    if (!item) return;
    setLines((current) => [...current, { key: nextKey++, type: 'PART', description: item.itemName, quantity: '1', unitPrice: String(item.priceMin) }]);
  }

  function submit() {
    const data: InvoiceLineInput[] = lines.map((line) => ({
      type: line.type,
      description: line.description.trim(),
      quantity: toNumber(line.quantity),
      unitPrice: toNumber(line.unitPrice),
    }));
    if (mode === 'estimate') send.mutate({ serviceRequestId: job.card.id, data: { lines: data } });
    else save.mutate({ serviceRequestId: job.card.id, data: { lines: data } });
  }

  return (
    <>
      <DialogBody className="py-4">
        <Stack gap={4}>
          {priceList.data && priceList.data.length > 0 ? (
            <Select aria-label="Add from price list" value="" onChange={(event) => addFromPriceList(event.target.value)}>
              <option value="" disabled>
                + Add from price list
              </option>
              {priceList.data
                .filter((p) => p.isActive)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemName} · {formatINR(item.priceMin)}–{formatINR(item.priceMax)}
                  </option>
                ))}
            </Select>
          ) : null}

          <ul className="flex flex-col gap-4">
            {lines.map((line, index) => (
              <li key={line.key} className="flex flex-col gap-2 rounded-card border border-border p-3">
                <div className="flex items-center gap-2">
                  <Select aria-label={`Line ${index + 1} type`} value={line.type} onChange={(event) => update(line.key, { type: event.target.value as InvoiceLineType })}>
                    {LINE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                  <IconButton icon={Trash2} label={`Remove line ${index + 1}`} onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))} />
                </div>
                <Input
                  aria-label={`Line ${index + 1} description`}
                  value={line.description}
                  onChange={(event) => update(line.key, { description: event.target.value })}
                  placeholder="What was done or fitted"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label={`Line ${index + 1} quantity`} inputMode="decimal" value={line.quantity} onChange={(event) => update(line.key, { quantity: event.target.value })} />
                  <Input aria-label={`Line ${index + 1} price in rupees`} inputMode="decimal" value={line.unitPrice} onChange={(event) => update(line.key, { unitPrice: event.target.value })} placeholder="₹" />
                </div>
              </li>
            ))}
          </ul>

          <Button variant="outline" onClick={() => setLines((c) => [...c, { key: nextKey++, type: 'LABOUR', description: '', quantity: '1', unitPrice: '' }])}>
            <Plus aria-hidden /> Add line
          </Button>
        </Stack>
      </DialogBody>
      <DialogFooter className="border-t border-border">
        <div className="flex items-baseline justify-between gap-3 md:mr-auto">
          <Text tone="secondary">Total</Text>
          <Text variant="stat-sm">{formatINR(Math.round(total * 100) / 100)}</Text>
        </div>
        <Button size="lg" loading={save.isPending || send.isPending} disabled={!valid} onClick={submit}>
          {mode === 'estimate' ? 'Send to customer' : 'Save bill'}
        </Button>
      </DialogFooter>
    </>
  );
}
