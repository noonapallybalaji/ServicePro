import type { ServiceRequestDetail, ServiceRequestStatus } from '@servicepro/api-client';
import { Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Stack, Text, Textarea } from '@servicepro/ui';
import { useState } from 'react';

import { PROBLEM_ACTIONS, problemActions } from '../job-actions';
import { useJobTransition } from '../use-job-mutations';

interface ProblemSheetProps {
  job: ServiceRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Two taps: what's wrong → why (USER-FLOWS.md §2.0). The customer is informed automatically. */
export function ProblemSheet({ job, open, onOpenChange }: ProblemSheetProps) {
  const [target, setTarget] = useState<ServiceRequestStatus | null>(null);
  const [note, setNote] = useState('');
  const transition = useJobTransition(job.card.id);
  const options = problemActions(job.availableTransitions);
  const selected = target ? PROBLEM_ACTIONS[target] : undefined;

  function close(next: boolean) {
    if (!next) {
      setTarget(null);
      setNote('');
    }

    onOpenChange(next);
  }

  async function submit(reasonCode: string) {
    if (!target) return;
    try {
      await transition.run({ to: target, reasonCode, note: note.trim() || undefined, successMessage: 'Updated — the office and customer have been told' });
      close(false);
    } catch {
      // Toast already shown.
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent presentation="sheet">
        <DialogHeader
          title={selected ? selected.label : "What's stopping the job?"}
          description={selected ? 'Pick the closest reason.' : undefined}
        />
        <DialogBody className="pb-4">
          {selected ? (
            <Stack gap={3}>
              {selected.reasons.map((reason) => (
                <Button
                  key={reason.code}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="justify-start"
                  loading={transition.isPending}
                  onClick={() => void submit(reason.code)}
                >
                  {reason.label}
                </Button>
              ))}
              <Field label="Note for the office" optional>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Needs a 1.5 ton compressor" />
              </Field>
            </Stack>
          ) : (
            <Stack gap={3}>
              {options.length === 0 ? (
                <Text tone="secondary">There's nothing to report at this step. Call the office if you need help.</Text>
              ) : (
                options.map((option) => (
                  <Button key={option.to} variant="secondary" size="lg" fullWidth className="justify-start" onClick={() => setTarget(option.to)}>
                    {PROBLEM_ACTIONS[option.to]?.label}
                  </Button>
                ))
              )}
            </Stack>
          )}
        </DialogBody>
        {selected ? (
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Back
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
