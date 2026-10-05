import { getGetMyEarningsQueryKey, useRecordPayment, type PaymentMethod, type ServiceRequestDetail } from '@servicepro/api-client';
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, RadioCard, RadioGroup, Stack, Text, formatINR, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, QrCode } from 'lucide-react';
import { useState } from 'react';

import { useRefreshJob } from '../use-job-mutations';

interface PaymentSheetProps {
  job: ServiceRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Phase 1 payments are recorded by hand (UX-ARCHITECTURE.md §0 C12): cash goes on the
 * technician's cash-in-hand; UPI paid to the business QR is recorded with its reference.
 */
export function PaymentSheet({ job, open, onOpenChange }: PaymentSheetProps) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const queryClient = useQueryClient();
  const refresh = useRefreshJob(job.card.id);
  const outstanding = job.invoice ? Math.round((job.invoice.total - job.invoice.amountPaid) * 100) / 100 : 0;

  const pay = useRecordPayment({
    mutation: {
      onSuccess: async () => {
        await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: getGetMyEarningsQueryKey() })]);
        toast.success('Payment recorded', {
          description: method === 'CASH' ? `${formatINR(outstanding)} added to your cash in hand.` : 'The job is closed.',
        });
        onOpenChange(false);
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent presentation="dialog">
        <DialogHeader title={`Collect ${formatINR(outstanding)}`} description={`${job.invoice?.invoiceNumber ?? ''} · ${job.card.customerName}`} />
        <DialogBody>
          <Stack gap={4}>
            <RadioGroup value={method} onValueChange={(value) => setMethod(value as PaymentMethod)} aria-label="How did the customer pay?">
              <RadioCard value="CASH" title="Cash" description="You'll deposit it with the office" media={<Banknote aria-hidden className="size-5" />} />
              <RadioCard value="UPI_QR" title="UPI to the business QR" description="Check the payment on the customer's phone" media={<QrCode aria-hidden className="size-5" />} />
            </RadioGroup>
            {method === 'UPI_QR' ? (
              <Field label="UPI reference" optional hint="The 12-digit UTR from the customer's payment screen.">
                <Input inputMode="numeric" value={reference} onChange={(event) => setReference(event.target.value)} />
              </Field>
            ) : null}
            <Text variant="sm" tone="secondary">
              The customer can see the bill and download it from their tracking link.
            </Text>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            loading={pay.isPending}
            disabled={outstanding <= 0}
            onClick={() =>
              pay.mutate({ serviceRequestId: job.card.id, data: { method, amount: outstanding, reference: reference.trim() || null } })
            }
          >
            {method === 'CASH' ? `Cash received ${formatINR(outstanding)}` : 'Payment received'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
