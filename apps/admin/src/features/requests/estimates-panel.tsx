import {
  getGetServiceRequestQueryKey,
  getListEstimatesQueryKey,
  isApiError,
  useListEstimates,
  useRecordEstimateApproval,
  type EstimateResponse,
  type ServiceRequestDetail,
} from '@servicepro/api-client';
import { Alert, Badge, Button, Card, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Text, formatDateTime, formatINR, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { humanize } from '../../components/common';

const TONE = { SENT: 'info', APPROVED: 'success', REJECTED: 'error', SUPERSEDED: 'neutral' } as const;

/** Every estimate version for the job, how it was answered, and a way to record a phone approval. */
export function EstimatesPanel({ request }: { request: ServiceRequestDetail }) {
  const estimates = useListEstimates(request.card.id);
  const [recording, setRecording] = useState<EstimateResponse | null>(null);
  if (!estimates.data || estimates.data.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <Text variant="overline" tone="muted">
        Estimates
      </Text>
      <ul className="flex flex-col divide-y divide-border">
        {estimates.data.map((estimate) => (
          <li key={estimate.id} className="flex flex-col gap-1 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                v{estimate.version} · <span className="tabular-nums">{formatINR(estimate.total)}</span>
              </span>
              <Badge size="sm" tone={TONE[estimate.status]}>
                {humanize(estimate.status)}
              </Badge>
            </div>
            <Text variant="caption" tone="muted">
              Sent {formatDateTime(estimate.sentAt)}
              {estimate.respondedAt ? ` · answered ${formatDateTime(estimate.respondedAt)}` : ''}
              {estimate.approvalMethod ? ` · ${humanize(estimate.approvalMethod)}` : ''}
            </Text>
            {estimate.responseNote ? <Text variant="caption">“{estimate.responseNote}”</Text> : null}
            {estimate.status === 'SENT' ? (
              <Button size="sm" variant="outline" className="self-start" onClick={() => setRecording(estimate)}>
                Record phone approval
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {recording ? <RecordApprovalDialog requestId={request.card.id} estimate={recording} onClose={() => setRecording(null)} /> : null}
    </Card>
  );
}

function RecordApprovalDialog({ requestId, estimate, onClose }: { requestId: string; estimate: EstimateResponse; onClose: () => void }) {
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const record = useRecordEstimateApproval({
    mutation: {
      meta: { silent: true },
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListEstimatesQueryKey(requestId) }),
          queryClient.invalidateQueries({ queryKey: getGetServiceRequestQueryKey(requestId) }),
        ]);
        toast.success('Approval recorded. The technician can start the repair.');
        onClose();
      },
    },
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader
          title={`Record approval of ${formatINR(estimate.total)}`}
          description="Only when the customer clearly agreed to this amount by phone. It's logged under your name."
        />
        <DialogBody className="flex flex-col gap-4">
          {isApiError(record.error) && !record.error.fieldErrors ? <Alert tone="error" title={record.error.message} /> : null}
          <Field label="How did they approve?" hint="e.g. Customer called the office at 11:05 and agreed to ₹2,250.">
            <Input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={record.isPending}
            disabled={note.trim().length < 5}
            onClick={() => record.mutate({ serviceRequestId: requestId, estimateId: estimate.id, data: { note: note.trim() } })}
          >
            Record approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
