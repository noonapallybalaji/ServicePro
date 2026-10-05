import {
  AiSummary,
  Button,
  ConfirmationDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
  Field,
  formatINR,
  Inline,
  Input,
  StatusBadge,
  StatusTimeline,
  Text,
  toast,
  Tooltip,
} from '@servicepro/ui';
import { useState } from 'react';

import { ADMIN_ACTIVITY_STEPS } from '../demo-data';
import { DemoSection, Specimen } from '../demo-section';

const ESTIMATE_LINES = [
  { label: 'Visiting charge', amount: 349 },
  { label: 'Gas top-up (R32)', amount: 1800 },
  { label: 'Labour', amount: 450 },
] as const;

export function OverlaySection() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const total = ESTIMATE_LINES.reduce((sum, line) => sum + line.amount, 0);

  return (
    <DemoSection
      id="overlays"
      title="Overlays"
      description="One component with three presentations, switched by CSS. Open each one on a phone and on a desktop to compare."
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Specimen label="Dialog" note="Bottom sheet on phones, centred modal from tablet up.">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Review estimate</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader title="Estimate for your AC" description="Nothing is charged until you approve." />
              <DialogBody>
                <dl className="flex flex-col divide-y divide-border">
                  {ESTIMATE_LINES.map((line) => (
                    <div key={line.label} className="flex justify-between gap-4 py-3">
                      <dt className="text-body text-foreground-secondary">{line.label}</dt>
                      <dd className="text-body font-semibold text-foreground tabular-nums">{formatINR(line.amount)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-body font-semibold text-foreground">Total</dt>
                    <dd className="text-stat-sm text-foreground tabular-nums">{formatINR(total)}</dd>
                  </div>
                </dl>
              </DialogBody>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Not now</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button onClick={() => toast.success('Estimate approved', { description: 'Ravi will start the repair now.' })}>
                    Approve {formatINR(total)}
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Specimen>

        <Specimen label="Bottom sheet" note="Always a sheet. Used for quick technician actions.">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Report a problem</Button>
            </DialogTrigger>
            <DialogContent presentation="sheet">
              <DialogHeader title="What's stopping the job?" />
              <DialogBody className="flex flex-col gap-2 pb-4">
                {['Customer not available', 'Need a spare part', 'Unable to repair', 'Customer asked to reschedule'].map(
                  (reason) => (
                    <DialogClose key={reason} asChild>
                      <Button
                        variant="secondary"
                        size="lg"
                        fullWidth
                        className="justify-start"
                        onClick={() => toast.info('Status updated', { description: reason })}
                      >
                        {reason}
                      </Button>
                    </DialogClose>
                  ),
                )}
              </DialogBody>
            </DialogContent>
          </Dialog>
        </Specimen>

        <Specimen label="Drawer" note="Full-screen with a back arrow on phones, side panel on desktop.">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open SR-10234</Button>
            </DialogTrigger>
            <DialogContent presentation="drawer">
              <DialogHeader
                title="SR-10234 · LG split AC"
                description="Rahul Kumar · Kondapur"
                actions={<StatusBadge status="EN_ROUTE" size="sm" />}
              />
              <DialogBody className="flex flex-col gap-6 py-5">
                <AiSummary meta="From a 2 min 14 s call · Telugu">
                  LG split AC (3 yrs) running but not cooling for 2 days. Prefers today before 1 PM.
                </AiSummary>
                <Field label="Internal note" optional>
                  <Input placeholder="Visible to staff only" />
                </Field>
                <div className="flex flex-col gap-3">
                  <Text variant="overline" tone="muted">
                    Activity
                  </Text>
                  <StatusTimeline steps={ADMIN_ACTIVITY_STEPS} density="compact" />
                </div>
              </DialogBody>
              <DialogFooter className="border-t border-border pt-4">
                <Button variant="outline">Reassign</Button>
                <Button>Call customer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Specimen>

        <Specimen label="Confirmation" note="Irreversible actions need a clear yes. Clicking outside won't close it.">
          <Inline gap={3}>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Cancel job
            </Button>
            <Tooltip content="Tooltips only add to what's already shown. Touch screens never display them.">
              <Button variant="ghost">Hover me</Button>
            </Tooltip>
          </Inline>
          <ConfirmationDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            tone="destructive"
            title="Cancel SR-10234?"
            description="The customer and Ravi will be told by WhatsApp. This can't be undone."
            confirmLabel="Cancel job"
            cancelLabel="Keep job"
            onConfirm={() =>
              new Promise<void>((resolve) => {
                window.setTimeout(() => {
                  toast.show('Job cancelled', { description: 'SR-10234' });
                  resolve();
                }, 900);
              })
            }
          />
        </Specimen>
      </div>
    </DemoSection>
  );
}
