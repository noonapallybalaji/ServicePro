import { AuthImage, DefaultSkeleton, QueryState, openProtectedFile } from '@servicepro/app-kit';
import { useGetServiceRequest, useListAssignmentHistory, useListNotifications, type ServiceRequestDetail } from '@servicepro/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  Heading,
  PageHeader,
  SERVICE_REQUEST_STATUS,
  Stack,
  StatusBadge,
  StatusTimeline,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TechnicianCard,
  Text,
  formatDateTime,
  formatINR,
  formatWindow,
  toast,
  type TimelineStep,
} from '@servicepro/ui';
import { Copy, FileDown, MapPin, Pencil, Phone, RefreshCw, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import { paths } from '../../app/paths';
import { BackLink, humanize } from '../../components/common';
import { StuckBadge } from '../../components/request-list';
import { AssignmentPanel } from '../dispatch/assignment-panel';
import { OnlinePaymentsPanel } from './online-payments';
import { AddNoteForm, EditRequestDialog, ReviewBookingAlert, StaffPaymentDialog, StatusChangeDialog, UnassignDialog } from './request-dialogs';

/** Customer site base URL for tracking links (VITE_PUBLIC_SITE_URL). */
const PUBLIC_SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? window.location.origin;

// NEW requests are confirmed first (ReviewBookingAlert); the workflow only offers ready jobs.
const ASSIGNABLE = new Set(['READY_FOR_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'RESCHEDULED']);

export function RequestDetailPage() {
  const { requestId = '' } = useParams();
  const request = useGetServiceRequest(requestId);

  return (
    <Stack gap={6}>
      <BackLink to={paths.requests} label="Service requests" />
      <QueryState query={request} loading={<DefaultSkeleton rows={4} />} errorTitle="Couldn't open this request">
        {(data) => <RequestDetail request={data} />}
      </QueryState>
    </Stack>
  );
}

type OpenDialog = 'assign' | 'status' | 'edit' | 'payment' | 'unassign' | null;

function RequestDetail({ request }: { request: ServiceRequestDetail }) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { card } = request;
  const canAssign = ASSIGNABLE.has(card.status);
  const outstanding = request.invoice ? request.invoice.total - request.invoice.amountPaid : 0;
  const trackingUrl = `${PUBLIC_SITE_URL}${request.trackingPath}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={card.status} />
            {card.isStuck ? <StuckBadge /> : null}
            {card.priority === 'HIGH' || card.priority === 'EMERGENCY' ? <Badge tone="error">{humanize(card.priority)}</Badge> : null}
            {request.isWarrantyVisit ? <Badge tone="info">Warranty visit</Badge> : null}
          </div>
        }
        title={`${card.srNumber} · ${card.categoryName}`}
        description={`${card.customerName} · ${card.locality}${card.scheduledStart ? ` · ${formatWindow(card.scheduledStart, card.scheduledEnd)}` : ''}`}
        actions={
          <>
            {canAssign ? (
              <Button onClick={() => setDialog('assign')}>
                <Send aria-hidden /> {card.technicianId ? 'Reassign' : 'Assign technician'}
              </Button>
            ) : null}
            {request.availableTransitions.length > 0 ? (
              <Button variant="outline" onClick={() => setDialog('status')}>
                <RefreshCw aria-hidden /> Change status
              </Button>
            ) : null}
            {!['CLOSED', 'CLOSED_NO_REPAIR', 'CANCELLED'].includes(card.status) ? (
              <Button variant="ghost" onClick={() => setDialog('edit')}>
                <Pencil aria-hidden /> Edit
              </Button>
            ) : null}
          </>
        }
      />

      {card.status === 'NEW' ? <ReviewBookingAlert request={request} /> : null}

      {card.status === 'COMPLETED' && outstanding > 0 ? (
        <Alert
          tone="warning"
          title={`${formatINR(outstanding)} still to collect`}
          description="The job closes automatically once it's fully paid."
          action={
            <Button size="sm" variant="outline" onClick={() => setDialog('payment')}>
              Record payment
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>
                  <Link to={paths.customer(card.customerId)} className="link">
                    {card.customerName}
                  </Link>
                </CardTitle>
                <Text variant="sm" tone="secondary" className="flex items-start gap-1">
                  <MapPin aria-hidden className="mt-1 size-4 shrink-0" />
                  <span>
                    {[request.address.line1, request.address.line2, request.address.locality, request.address.city, request.address.pincode].filter(Boolean).join(', ')}
                    {request.address.landmark ? <span className="block text-foreground-muted">Landmark: {request.address.landmark}</span> : null}
                  </span>
                </Text>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href={`tel:${card.customerPhone}`}>
                  <Phone aria-hidden /> {card.customerPhone}
                </a>
              </Button>
            </div>
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <Text variant="overline" tone="muted">
                Problem {request.issueTypeName ? `· ${request.issueTypeName}` : ''}
              </Text>
              <Text>{request.problemDescription}</Text>
              {request.applianceDescription ? (
                <Text variant="sm" tone="secondary">
                  Appliance: {request.applianceDescription}
                </Text>
              ) : null}
            </div>
          </Card>

          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="photos">Photos ({request.attachments.length})</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="offers">Offers</TabsTrigger>
            </TabsList>
            <TabsContent value="activity">
              <Card className="flex flex-col gap-6">
                <AddNoteForm requestId={card.id} />
                <StatusTimeline density="compact" steps={activity(request)} />
              </Card>
            </TabsContent>
            <TabsContent value="photos">
              <Card>
                {request.attachments.length === 0 ? (
                  <Text tone="secondary">No photos yet. Technicians add before/after photos from their app.</Text>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {request.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex flex-col gap-1">
                        <AuthImage src={attachment.url} alt={humanize(attachment.kind)} className="aspect-square w-full rounded-control" />
                        <Text variant="caption" tone="muted">
                          {humanize(attachment.kind)} · {formatDateTime(attachment.createdAt)}
                        </Text>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </TabsContent>
            <TabsContent value="messages">
              <MessagesLog requestId={card.id} />
            </TabsContent>
            <TabsContent value="offers">
              <OfferHistory requestId={card.id} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="who" className="flex flex-col gap-3">
            <Heading level={2} size="h3" id="who">
              Technician
            </Heading>
            {request.technician ? (
              <TechnicianCard
                name={request.technician.fullName}
                specialty={request.technician.specialty}
                rating={request.technician.ratingAverage ?? undefined}
                completedJobs={request.technician.completedJobs}
                dutyStatus={request.technician.dutyStatus}
                actions={
                  card.status === 'OFFERED' || card.status === 'ACCEPTED' ? (
                    <Button variant="outline" size="sm" onClick={() => setDialog('unassign')}>
                      Unassign
                    </Button>
                  ) : undefined
                }
                footer={
                  card.status === 'OFFERED' ? (
                    <Text variant="sm" tone="secondary">
                      Offer sent — waiting for them to accept.
                    </Text>
                  ) : undefined
                }
              />
            ) : (
              <Card>
                <Text tone="secondary">Nobody assigned yet.</Text>
                {canAssign ? (
                  <Button className="mt-3" onClick={() => setDialog('assign')}>
                    See best matches
                  </Button>
                ) : null}
              </Card>
            )}
          </section>

          <section aria-labelledby="money" className="flex flex-col gap-3">
            <Heading level={2} size="h3" id="money">
              Billing
            </Heading>
            <Card className="flex flex-col gap-3">
              <div className="flex justify-between text-sm">
                <span className="text-foreground-secondary">Visiting charge</span>
                <span className="tabular-nums">{formatINR(request.visitCharge)}</span>
              </div>
              {request.invoice ? (
                <>
                  <ul className="flex flex-col gap-1 border-t border-border pt-3">
                    {request.invoice.lines.map((line, index) => (
                      <li key={`${line.description}-${index}`} className="flex justify-between gap-3 text-sm">
                        <span className="text-foreground-secondary">
                          {line.description}
                          {line.quantity !== 1 ? ` × ${line.quantity}` : ''}
                        </span>
                        <span className="tabular-nums">{formatINR(line.amount)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between border-t border-border pt-3">
                    <Text weight="semibold">Total</Text>
                    <Text variant="stat-sm">{formatINR(request.invoice.total)}</Text>
                  </div>
                  <Text variant="sm" tone={outstanding > 0 ? 'warning' : 'success'}>
                    {outstanding > 0 ? `Balance ${formatINR(outstanding)}` : 'Fully paid'}
                  </Text>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => void openProtectedFile(`/api/v1/service-requests/${card.id}/invoice.pdf`)}>
                      <FileDown aria-hidden /> Bill PDF
                    </Button>
                    {outstanding > 0 && card.status === 'COMPLETED' ? (
                      <Button size="sm" onClick={() => setDialog('payment')}>
                        Record payment
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <Text variant="sm" tone="muted">
                  The technician prepares the bill on site.
                </Text>
              )}
            </Card>
            <OnlinePaymentsPanel request={request} />
          </section>

          <section aria-labelledby="customer-link" className="flex flex-col gap-3">
            <Heading level={2} size="h3" id="customer-link">
              Customer tracking link
            </Heading>
            <Card className="flex items-center gap-2">
              <Text variant="sm" className="min-w-0 flex-1 truncate">
                {trackingUrl}
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(trackingUrl).then(() => toast.success('Link copied'))}
              >
                <Copy aria-hidden /> Copy
              </Button>
            </Card>
          </section>
        </aside>
      </div>

      <AssignDrawer request={request} open={dialog === 'assign'} onOpenChange={(open) => setDialog(open ? 'assign' : null)} />
      <StatusChangeDialog request={request} open={dialog === 'status'} onOpenChange={(open) => setDialog(open ? 'status' : null)} />
      <EditRequestDialog request={request} open={dialog === 'edit'} onOpenChange={(open) => setDialog(open ? 'edit' : null)} />
      <StaffPaymentDialog request={request} open={dialog === 'payment'} onOpenChange={(open) => setDialog(open ? 'payment' : null)} />
      <UnassignDialog request={request} open={dialog === 'unassign'} onOpenChange={(open) => setDialog(open ? 'unassign' : null)} />
    </>
  );
}

function AssignDrawer({ request, open, onOpenChange }: { request: ServiceRequestDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <DrawerShell open={open} onOpenChange={onOpenChange} title={`Assign ${request.card.srNumber}`} description="Ranked by distance, skill, workload and track record.">
      {open ? <AssignmentPanel serviceRequestId={request.card.id} onAssigned={() => onOpenChange(false)} /> : null}
    </DrawerShell>
  );
}

function DrawerShell({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent presentation="drawer">
        <DialogHeader title={title} description={description} />
        <DialogBody className="py-4">{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function activity(request: ServiceRequestDetail): TimelineStep[] {
  const history = request.history.map((h) => ({
    id: h.id,
    at: h.occurredAt,
    step: {
      id: h.id,
      title: SERVICE_REQUEST_STATUS[h.to].labels.staff,
      description: [h.actorType === 'TECHNICIAN' ? 'by technician' : h.actorType === 'SYSTEM' ? 'automatic' : undefined, h.reasonCode && !['CREATED', 'OFFERED', 'ACCEPTED'].includes(h.reasonCode) ? humanize(h.reasonCode) : undefined, h.note ?? undefined]
        .filter(Boolean)
        .join(' · ') || undefined,
      timestamp: formatDateTime(h.occurredAt),
      state: 'complete' as const,
    },
  }));
  const notes = request.notes.map((n) => ({
    id: n.id,
    at: n.createdAt,
    step: {
      id: n.id,
      title: n.visibility === 'CUSTOMER' ? 'Note (shared with customer)' : 'Note',
      description: n.body,
      timestamp: formatDateTime(n.createdAt),
      state: 'upcoming' as const,
    },
  }));

  const merged: TimelineStep[] = [...history, ...notes].sort((a, b) => b.at.localeCompare(a.at)).map((e) => e.step);
  if (merged[0] && merged[0].state === 'complete') {
    merged[0] = { ...merged[0], state: 'current' };
  }

  return merged;
}

function MessagesLog({ requestId }: { requestId: string }) {
  const messages = useListNotifications({ serviceRequestId: requestId });
  return (
    <QueryState query={messages} loading={<DefaultSkeleton rows={2} />}>
      {(list) => (
        <Card padding="none">
          {list.length === 0 ? (
            <Text tone="secondary" className="p-4">
              No messages sent yet.
            </Text>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((message) => (
                <li key={message.id} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" tone={message.status === 'FAILED' ? 'error' : 'neutral'}>
                      {humanize(message.channel)} · {humanize(message.status)}
                    </Badge>
                    <Text variant="caption" tone="muted">
                      To {humanize(message.recipientType)} · {formatDateTime(message.createdAt)}
                    </Text>
                  </div>
                  <Text variant="sm">{message.renderedBody}</Text>
                  {message.error ? (
                    <Text variant="caption" tone="error">
                      {message.error}
                    </Text>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </QueryState>
  );
}

function OfferHistory({ requestId }: { requestId: string }) {
  const history = useListAssignmentHistory(requestId);
  return (
    <QueryState query={history} loading={<DefaultSkeleton rows={2} />}>
      {(list) => (
        <Card padding="none">
          {list.length === 0 ? (
            <Text tone="secondary" className="p-4">
              No offers yet.
            </Text>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((assignment) => (
                <li key={assignment.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm">{humanize(assignment.status)}</Badge>
                    <span className="text-foreground-muted">{formatDateTime(assignment.offeredAt)}</span>
                    {assignment.matchScore != null ? <span className="tabular-nums">match {Math.round(assignment.matchScore)}</span> : null}
                  </div>
                  {assignment.overrideReason ? <span className="text-foreground-secondary">Override: {assignment.overrideReason}</span> : null}
                  {assignment.declineReason ? <span className="text-foreground-secondary">Reason: {humanize(assignment.declineReason)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </QueryState>
  );
}
