import { isApiError, useReissueCompletionCode, type ServiceRequestDetail } from '@servicepro/api-client';
import { Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, OtpInput, Stack, Text, toast } from '@servicepro/ui';
import { useState } from 'react';

import { useJobTransition } from '../use-job-mutations';
import { PhotoButton } from './photo-button';

interface CompletionSheetProps {
  job: ServiceRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

const CODE_LENGTH = 4;

/**
 * Completion = after-photo (when the category needs it) + the customer's 4-digit code
 * (USER-FLOWS.md §2.2 step 12). The code proves the visit and the customer's acceptance.
 */
export function CompletionSheet({ job, open, onOpenChange, onCompleted }: CompletionSheetProps) {
  const [code, setCode] = useState('');
  const transition = useJobTransition(job.card.id, { silent: true });
  const reissue = useReissueCompletionCode({
    mutation: { onSuccess: () => toast.info('New code sent', { description: 'The customer gets it on WhatsApp in a moment.' }) },
  });

  const hasAfterPhoto = job.attachments.some((a) => a.kind === 'PHOTO_AFTER');
  const photoMissing = job.requiresPhotos && !hasAfterPhoto;
  const error = isApiError(transition.error) ? transition.error.message : undefined;

  async function complete() {
    try {
      await transition.run({ to: 'COMPLETED', completionCode: code, successMessage: 'Job completed' });
      setCode('');
      onOpenChange(false);
      onCompleted();
    } catch {
      // Shown inline below the code field.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) transition.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent presentation="dialog">
        <DialogHeader title="Complete the job" description="Ask the customer for the code we sent them on WhatsApp." />
        <DialogBody>
          <Stack gap={5}>
            {photoMissing ? (
              <Alert
                tone="warning"
                title="Add an after-photo first"
                description="This appliance needs a photo of the finished work."
                action={<PhotoButton jobId={job.card.id} kind="PHOTO_AFTER" label="Take after-photo" />}
              />
            ) : null}
            <Field label="Customer's completion code" error={error}>
              <OtpInput length={CODE_LENGTH} value={code} onValueChange={setCode} disabled={photoMissing} />
            </Field>
            <Text variant="sm" tone="secondary">
              Customer lost the code?{' '}
              <button
                type="button"
                className="link"
                disabled={reissue.isPending}
                onClick={() => reissue.mutate({ serviceRequestId: job.card.id })}
              >
                Send a new one
              </button>
            </Text>
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not yet
          </Button>
          <Button size="lg" loading={transition.isPending} disabled={photoMissing || code.length !== CODE_LENGTH} onClick={() => void complete()}>
            Confirm completion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
