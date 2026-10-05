import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Inline,
  LoadingState,
  Skeleton,
  StepProgress,
  toast,
} from '@servicepro/ui';
import { CalendarCheck, Inbox, WifiOff } from 'lucide-react';
import { useState } from 'react';

import { DemoSection, Specimen } from '../demo-section';

function JobCardSkeleton() {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-20 rounded-pill" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-10 w-full rounded-control" />
      </div>
    </Card>
  );
}

export function FeedbackSection() {
  const [step, setStep] = useState(2);
  const totalSteps = 4;
  const stepLabels = ['Choose appliance', 'Describe the problem', 'Your details', 'Confirm'];

  return (
    <DemoSection
      id="feedback"
      title="Feedback"
      description="Every view has loading, empty, error and success states. Messages use plain words, reassure people that their data is safe, and offer one clear next step."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Alert tone="info" title="Technician is 10 minutes late" description="Ravi is stuck in traffic near Kothaguda. New ETA 11:25 AM." />
        <Alert tone="success" title="Payment received" description="₹2,599 via UPI · Receipt sent on WhatsApp." />
        <Alert
          tone="warning"
          title="Waiting for a spare part"
          description="The compressor is ordered. We'll confirm a new visit time once it arrives."
        />
        <Alert
          tone="error"
          title="Couldn't send the estimate"
          description="You're offline. It will send automatically when you're back online."
          action={
            <Button size="sm" variant="outline">
              Retry now
            </Button>
          }
        />
      </div>

      <Specimen label="Toasts" note="Toasts confirm an action worked. They're never the only place important information appears.">
        <Inline gap={3}>
          <Button variant="outline" onClick={() => toast.success('Job accepted', { description: 'SR-10234 added to today.' })}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast.info('Customer notified', { description: 'Sent on WhatsApp.' })}>
            Info toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.error('Upload failed', {
                description: 'Photo will retry on Wi-Fi.',
                action: { label: 'Retry', onClick: () => toast.info('Retrying upload…') },
              })
            }
          >
            Error toast with action
          </Button>
        </Inline>
      </Specimen>

      <Specimen label="Step progress" note="Shows where you are in a full-screen mobile flow.">
        <Card className="flex max-w-md flex-col gap-4">
          <StepProgress current={step} total={totalSteps} label={stepLabels[step - 1] ?? ''} />
          <Inline gap={2}>
            <Button size="sm" variant="outline" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            <Button size="sm" disabled={step === totalSteps} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          </Inline>
        </Card>
      </Specimen>

      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen label="Skeleton" note="Matches the shape of the content that's loading. Preferred over a spinner.">
          <div className="grid gap-3">
            <JobCardSkeleton />
            <JobCardSkeleton />
          </div>
        </Specimen>
        <Specimen label="Loading state" note="For short waits when the shape of the result isn't known.">
          <Card>
            <LoadingState label="Finding the best technician…" />
          </Card>
        </Specimen>
        <Specimen label="Empty state">
          <Card>
            <EmptyState
              icon={CalendarCheck}
              title="No jobs yet today"
              description="New job offers appear here automatically. Keep your status on duty to receive them."
            />
          </Card>
        </Specimen>
        <Specimen label="Error state">
          <Card>
            <ErrorState
              icon={WifiOff}
              title="You're offline"
              description="Your updates are saved on this phone and will sync when you reconnect."
              onRetry={() => toast.info('Reconnecting…')}
            />
          </Card>
        </Specimen>
        <Specimen label="Compact empty state" note="Inside cards and table bodies.">
          <Card>
            <EmptyState
              size="compact"
              icon={Inbox}
              title="Verification queue is clear"
              description="Leads the AI isn't sure about will show up here."
            />
          </Card>
        </Specimen>
      </div>
    </DemoSection>
  );
}
