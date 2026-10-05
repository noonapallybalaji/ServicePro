import { AuthImage, DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useGetMyJob, type ServiceRequestDetail } from '@servicepro/api-client';
import {
  Alert,
  Button,
  Card,
  CardTitle,
  Heading,
  SERVICE_REQUEST_STATUS,
  Stack,
  StatusBadge,
  StatusTimeline,
  StickyActionBar,
  Text,
  formatDateTime,
  formatINR,
  formatWindow,
  type TimelineStep,
} from '@servicepro/ui';
import { ArrowLeft, MapPin, Navigation, Phone, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { paths } from '../../app/paths';
import { directionsUrl } from '../../lib/location';
import { FORWARD_ACTIONS, primaryAction, problemActions } from './job-actions';
import { BillSheet } from './sheets/bill-sheet';
import { CompletionSheet } from './sheets/completion-sheet';
import { PaymentSheet } from './sheets/payment-sheet';
import { PhotoButton } from './sheets/photo-button';
import { ProblemSheet } from './sheets/problem-sheet';
import { useJobTransition } from './use-job-mutations';

const BILLABLE = new Set(['DIAGNOSING', 'IN_PROGRESS', 'COMPLETED', 'UNABLE_TO_REPAIR']);

/** The work surface (UX-ARCHITECTURE.md §3.2): everything for one job, one primary action. */
export function JobPage() {
  const { jobId = '' } = useParams();
  const job = useGetMyJob(jobId);

  return (
    <Stack gap={6}>
      <Link to={paths.today} className="link inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft aria-hidden className="size-4" /> Today
      </Link>
      <QueryState query={job} loading={<DefaultSkeleton rows={4} />} errorTitle="Couldn't open this job">
        {(data) => <JobDetail job={data} />}
      </QueryState>
    </Stack>
  );
}

function JobDetail({ job }: { job: ServiceRequestDetail }) {
  const [sheet, setSheet] = useState<'problem' | 'complete' | 'bill' | 'payment' | null>(null);
  const transition = useJobTransition(job.card.id);
  const primary = primaryAction(job.availableTransitions);
  const problems = problemActions(job.availableTransitions);
  const invoice = job.invoice;
  const outstanding = invoice ? invoice.total - invoice.amountPaid : 0;
  const status = job.card.status;
  const canCollect = status === 'COMPLETED' && invoice != null && outstanding > 0;
  const needsBill = status === 'COMPLETED' && invoice == null;
  const addressLine = [job.address.line1, job.address.line2, job.address.locality, job.address.city, job.address.pincode].filter(Boolean).join(', ');

  function onPrimary() {
    if (!primary) return;
    if (primary.to === 'COMPLETED') {
      setSheet('complete');
      return;
    }

    // Errors surface as a toast through the app's global mutation handler.
    void transition.run({ to: primary.to, successMessage: 'Status updated' }).catch(() => undefined);
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="overline" tone="muted">
            {job.card.srNumber}
          </Text>
          <StatusBadge status={status} audience="technician" size="sm" />
        </div>
        <Heading level={1} size="h2">
          {job.card.categoryName}
          {job.issueTypeName ? ` · ${job.issueTypeName}` : ''}
        </Heading>
        {job.card.scheduledStart ? (
          <Text tone="secondary" className="tabular-nums">
            {formatWindow(job.card.scheduledStart, job.card.scheduledEnd)}
          </Text>
        ) : null}
      </header>

      {status === 'AWAITING_ESTIMATE_APPROVAL' ? (
        <Alert tone="info" title="Waiting for the customer" description="They're reviewing the estimate. You'll be notified when they respond." />
      ) : null}
      {job.card.status === 'CLOSED' ? <Alert tone="success" title="Job closed" description="Payment received. Nice work." /> : null}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{job.card.customerName}</CardTitle>
          <Text variant="sm" tone="secondary" className="flex items-start gap-1">
            <MapPin aria-hidden className="mt-1 size-4 shrink-0" />
            <span>
              {addressLine}
              {job.address.landmark ? <span className="block text-foreground-muted">Landmark: {job.address.landmark}</span> : null}
            </span>
          </Text>
        </div>
        <div className="flex gap-3 *:flex-1">
          <Button asChild variant="outline">
            <a href={`tel:${job.card.customerPhone}`}>
              <Phone aria-hidden /> Call
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={directionsUrl({ latitude: job.address.latitude, longitude: job.address.longitude, text: addressLine })}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation aria-hidden /> Navigate
            </a>
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <Text variant="overline" tone="muted">
          Problem
        </Text>
        <Text>{job.problemDescription}</Text>
        {job.applianceDescription ? (
          <Text variant="sm" tone="secondary">
            Appliance: {job.applianceDescription}
          </Text>
        ) : null}
        {job.notes.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            {job.notes.map((note) => (
              <li key={note.id} className="text-sm text-foreground-secondary">
                {note.body} <span className="text-caption text-foreground-muted">· {formatDateTime(note.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {BILLABLE.has(status) || invoice ? (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Text variant="overline" tone="muted">
              Bill
            </Text>
            {invoice ? (
              <Text variant="sm" tone="muted">
                {invoice.invoiceNumber}
              </Text>
            ) : null}
          </div>
          {invoice ? (
            <>
              <ul className="flex flex-col gap-1">
                {invoice.lines.map((line) => (
                  <li key={line.description} className="flex justify-between gap-3 text-sm">
                    <span className="text-foreground-secondary">{line.description}</span>
                    <span className="tabular-nums">{formatINR(line.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <Text weight="semibold">Total</Text>
                <Text variant="stat-sm">{formatINR(invoice.total)}</Text>
              </div>
              {invoice.amountPaid > 0 ? (
                <Text variant="sm" tone="success">
                  Paid {formatINR(invoice.amountPaid)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="sm" tone="secondary">
              Visiting charge {formatINR(job.visitCharge)}. Add parts and labour once you know what's needed.
            </Text>
          )}
          {invoice == null || invoice.amountPaid === 0 ? (
            <Button variant="outline" onClick={() => setSheet('bill')}>
              <ReceiptText aria-hidden /> {invoice ? 'Edit bill' : 'Prepare bill'}
            </Button>
          ) : null}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3">
        <Text variant="overline" tone="muted">
          Photos
        </Text>
        {job.attachments.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {job.attachments.map((attachment) => (
              <li key={attachment.id} className="flex flex-col gap-1">
                <AuthImage src={attachment.url} alt={attachment.kind === 'PHOTO_AFTER' ? 'After repair' : 'Before repair'} className="aspect-square w-full rounded-control" />
                <Text variant="caption" tone="muted">
                  {attachment.kind === 'PHOTO_AFTER' ? 'After' : attachment.kind === 'PHOTO_BEFORE' ? 'Before' : 'Photo'}
                </Text>
              </li>
            ))}
          </ul>
        ) : (
          <Text variant="sm" tone="secondary">
            {job.requiresPhotos ? 'An after-photo is required to complete this job.' : 'Photos help if there is a dispute later.'}
          </Text>
        )}
        {!['CLOSED', 'CANCELLED', 'CLOSED_NO_REPAIR'].includes(status) ? (
          <div className="flex gap-3 *:flex-1">
            <PhotoButton jobId={job.card.id} kind="PHOTO_BEFORE" label="Before photo" />
            <PhotoButton jobId={job.card.id} kind="PHOTO_AFTER" label="After photo" />
          </div>
        ) : null}
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="history">
        <Heading level={2} size="h3" id="history">
          History
        </Heading>
        <Card>
          <StatusTimeline density="compact" steps={toTimeline(job)} />
        </Card>
      </section>

      {primary || problems.length > 0 || canCollect || needsBill ? (
        <StickyActionBar className="md:sticky md:bottom-4 md:rounded-card md:border md:border-border md:bg-surface md:p-3 md:shadow-md">
          {problems.length > 0 ? (
            <Button variant="outline" size="lg" onClick={() => setSheet('problem')} className="md:w-auto">
              Problem
            </Button>
          ) : null}
          {canCollect ? (
            <Button size="lg" className="md:flex-1" onClick={() => setSheet('payment')}>
              Collect {formatINR(outstanding)}
            </Button>
          ) : needsBill ? (
            <Button size="lg" className="md:flex-1" onClick={() => setSheet('bill')}>
              Prepare bill
            </Button>
          ) : primary ? (
            <Button size="lg" className="md:flex-1" loading={transition.isPending} onClick={onPrimary}>
              {FORWARD_ACTIONS[primary.to]}
            </Button>
          ) : null}
        </StickyActionBar>
      ) : null}

      <ProblemSheet job={job} open={sheet === 'problem'} onOpenChange={(open) => setSheet(open ? 'problem' : null)} />
      <CompletionSheet job={job} open={sheet === 'complete'} onOpenChange={(open) => setSheet(open ? 'complete' : null)} onCompleted={() => setSheet(job.invoice ? 'payment' : 'bill')} />
      <BillSheet job={job} open={sheet === 'bill'} onOpenChange={(open) => setSheet(open ? 'bill' : null)} />
      <PaymentSheet job={job} open={sheet === 'payment'} onOpenChange={(open) => setSheet(open ? 'payment' : null)} />
    </>
  );
}

function toTimeline(job: ServiceRequestDetail): TimelineStep[] {
  return job.history.map((entry, index) => ({
    id: entry.id,
    title: SERVICE_REQUEST_STATUS[entry.to].labels.technician,
    description: entry.reasonCode && !['CREATED', 'OFFERED', 'ACCEPTED'].includes(entry.reasonCode) ? entry.reasonCode.replaceAll('_', ' ').toLowerCase() : undefined,
    timestamp: formatDateTime(entry.occurredAt),
    state: index === 0 ? 'current' : 'complete',
  }));
}
