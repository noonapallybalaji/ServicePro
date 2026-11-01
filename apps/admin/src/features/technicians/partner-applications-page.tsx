import { AuthImage, DefaultSkeleton, QueryState, openProtectedFile } from '@servicepro/app-kit';
import {
  apiFetch,
  getListTechnicianApplicationsQueryKey,
  isApiError,
  useApproveTechnicianApplication,
  useListTechnicianApplications,
  useRejectTechnicianApplication,
  type ApplicantDocumentKind,
  type ApplicantDocumentResponse,
  type TechnicianApplicationResponse,
  type TechnicianApplicationStatus,
} from '@servicepro/api-client';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmationDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Field,
  PageHeader,
  Stack,
  Text,
  Textarea,
  Skeleton,
  cn,
  formatDate,
  formatRelative,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Home, IdCard, MapPin, Phone, UserPlus, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';

/*
 * "Join as a partner" applications from the partner app. Approving creates the technician (the
 * appliances they chose as skills, the areas covering their PIN code, the usual defaults for
 * commission and daily jobs), uses their profile photo as the technician's photo and welcomes them
 * on WhatsApp with the app link. Their ID photos open from here; only the last four Aadhaar digits
 * are stored, the full number is on the card photo.
 */

/** The ranges the partner app offers, by the years it stores for each. */
const EXPERIENCE: Record<number, string> = { 0: 'Under 1 year', 2: '1–3 years', 4: '3–5 years', 7: '5–10 years', 10: '10+ years' };
const experienceText = (years: number) => EXPERIENCE[years] ?? `${years} years`;

const DOCUMENT_LABELS: Record<ApplicantDocumentKind, string> = {
  PROFILE_PHOTO: 'Profile photo',
  AADHAAR_FRONT: 'Aadhaar front',
  AADHAAR_BACK: 'Aadhaar back',
  PAN_CARD: 'PAN card',
};

/** Whole years from a yyyy-mm-dd birthday. */
function ageOf(dob: string): number {
  const born = new Date(`${dob}T00:00:00`);
  const today = new Date();
  const hadBirthday = today.getMonth() > born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  return today.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
}

const FILTERS: { value: TechnicianApplicationStatus; label: string }[] = [
  { value: 'PENDING', label: 'To review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Turned down' },
];

export function PartnerApplicationsPage() {
  const [status, setStatus] = useState<TechnicianApplicationStatus>('PENDING');
  const applications = useListTechnicianApplications({ status });

  return (
    <Stack gap={6}>
      <PageHeader title="Partner applications" description="Technicians who asked to join from the partner app. Call them, then approve or turn down." />

      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={status === f.value}
            onClick={() => setStatus(f.value)}
            className={cn(
              'transition-interactive inline-flex h-8 items-center rounded-pill border px-3 text-sm font-semibold',
              status === f.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground-secondary hover:border-border-strong',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <QueryState query={applications} loading={<DefaultSkeleton rows={3} />}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState
                icon={UserPlus}
                title={status === 'PENDING' ? 'No applications to review' : 'Nothing here yet'}
                description="Technicians apply from the partner app's sign-in screen (Join as a partner)."
              />
            </Card>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {list.map((application) => (
                <li key={application.id}>
                  <ApplicationCard application={application} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Stack>
  );
}

function ApplicationCard({ application: a }: { application: TechnicianApplicationResponse }) {
  const queryClient = useQueryClient();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListTechnicianApplicationsQueryKey() });
  const approve = useApproveTechnicianApplication();
  const photo = a.documents.find((d) => d.kind === 'PROFILE_PHOTO');
  const idDocuments = a.documents.filter((d) => d.kind !== 'PROFILE_PHOTO');

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        {photo ? (
          <button
            type="button"
            onClick={() => void openProtectedFile(photo.url)}
            className="pressable shrink-0 overflow-hidden rounded-full border border-border"
            aria-label={`Open ${a.fullName}'s photo`}
          >
            <AuthImage src={photo.url} alt="" className="size-14" />
          </button>
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-foreground-muted [&_svg]:size-6">
            <UserRound aria-hidden />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-h3 text-foreground">{a.fullName}</span>
          <a href={`tel:${a.phone}`} className="link inline-flex items-center gap-1 text-sm">
            <Phone aria-hidden className="size-3" /> {a.phone}
          </a>
        </div>
        <Text variant="caption" tone="muted" className="shrink-0">
          {formatRelative(a.submittedAt)}
        </Text>
      </div>

      <dl className="grid gap-2 text-sm">
        {a.dateOfBirth ? (
          <Detail icon={<UserRound aria-hidden />} label="Born">
            {formatDate(`${a.dateOfBirth}T00:00:00`)} ({ageOf(a.dateOfBirth)} years)
          </Detail>
        ) : null}
        {a.addressLine ? (
          <Detail icon={<Home aria-hidden />} label="Address">
            {[a.addressLine, a.locality, a.pincode].filter(Boolean).join(', ')}
          </Detail>
        ) : null}
        {a.aadhaarLast4 || a.pan ? (
          <Detail icon={<IdCard aria-hidden />} label="ID">
            {a.aadhaarLast4 ? `Aadhaar ending ${a.aadhaarLast4}` : null}
            {a.aadhaarLast4 && a.pan ? ' · ' : null}
            {a.pan ? `PAN ${a.pan}` : null}
          </Detail>
        ) : null}
      </dl>

      {idDocuments.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="ID documents">
          {idDocuments.map((document) => (
            <li key={document.kind}>
              <DocumentThumb document={document} />
            </li>
          ))}
        </ul>
      ) : a.status === 'PENDING' ? (
        <Text variant="caption" tone="muted">
          No ID photos (applied before the app asked for them). Check their ID on the call.
        </Text>
      ) : null}

      <Text variant="sm" tone="secondary" className="flex flex-wrap items-center gap-2">
        <MapPin aria-hidden className="size-4" />
        Jobs around {a.pincode}
        {a.locality ? ` · ${a.locality}` : ''}
        {a.inServiceArea ? null : (
          <Badge size="sm" tone="warning">
            Outside our areas
          </Badge>
        )}
      </Text>

      <div className="flex flex-wrap gap-1">
        {a.appliances.map((name) => (
          <Badge key={name} size="sm" tone="primary">
            {name}
          </Badge>
        ))}
        <Badge size="sm">{experienceText(a.experienceYears)}</Badge>
      </div>

      {a.about ? (
        <Text variant="sm" className="rounded-control bg-surface-sunken p-3">
          {a.about}
        </Text>
      ) : null}

      {a.status === 'PENDING' ? (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button onClick={() => setConfirmApprove(true)}>Approve</Button>
          <Button variant="outline" onClick={() => setRejecting(true)}>
            Turn down
          </Button>
        </div>
      ) : a.status === 'APPROVED' ? (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Badge tone="success">Approved {a.reviewedAt ? formatRelative(a.reviewedAt) : ''}</Badge>
          {a.technicianId ? (
            <Button asChild size="sm" variant="ghost">
              <Link to={paths.technician(a.technicianId)}>Open profile</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <Text variant="sm" tone="secondary" className="mt-auto">
          Turned down{a.reviewedAt ? ` ${formatRelative(a.reviewedAt)}` : ''}: {a.rejectionReason}
        </Text>
      )}

      <ConfirmationDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title={`Approve ${a.fullName}?`}
        description={`They become a technician who repairs ${a.appliances.join(', ')}${a.inServiceArea ? ', in the areas covering ' + a.pincode : ''}, with the usual commission and daily limit (change them on their profile). ${photo ? 'Their photo becomes their profile photo. ' : ''}We send them the app link on WhatsApp.`}
        confirmLabel="Approve"
        onConfirm={async () => {
          try {
            await approve.mutateAsync({ applicationId: a.id });
            toast.success(`${a.fullName} is now a technician`, { description: 'They can sign in to the partner app with their number.' });
            await refresh();
          } catch (error) {
            toast.error(isApiError(error) ? error.message : "Couldn't approve. Try again.");
          }
        }}
      />
      {rejecting ? <RejectDialog application={a} onClose={() => setRejecting(false)} onDone={refresh} /> : null}
    </Card>
  );
}

function RejectDialog({ application: a, onClose, onDone }: { application: TechnicianApplicationResponse; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const reject = useRejectTechnicianApplication({
    mutation: {
      onSuccess: async () => {
        toast.success('Application turned down');
        await onDone();
        onClose();
      },
    },
  });
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader title={`Turn down ${a.fullName}?`} description="They see this reason when they sign in to check their application, so keep it polite." />
        <DialogBody className="flex flex-col gap-4">
          {isApiError(reject.error) ? <Alert tone="error" title={reject.error.message} /> : null}
          <Field label="Why?" hint="e.g. We need at least 2 years of experience; the Aadhaar photo isn't readable; we don't work in your area yet.">
            <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate({ applicationId: a.id, data: { reason: reason.trim() } })}>
            Turn down
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="flex shrink-0 items-center text-foreground-muted [&_svg]:size-4" title={label}>
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="min-w-0 break-words text-foreground-secondary">{children}</dd>
    </div>
  );
}

/** An ID photo (or PDF) from an application: a thumbnail that opens the full file. */
function DocumentThumb({ document }: { document: ApplicantDocumentResponse }) {
  const [file, setFile] = useState<{ url: string; isImage: boolean } | 'failed' | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    apiFetch<Blob>(document.url)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setFile({ url, isImage: blob.type.startsWith('image/') });
      })
      .catch(() => !cancelled && setFile('failed'));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [document.url]);

  const label = DOCUMENT_LABELS[document.kind];
  return (
    <button
      type="button"
      onClick={() => (file && file !== 'failed' ? window.open(file.url, '_blank', 'noopener') : void openProtectedFile(document.url))}
      className="pressable flex w-28 flex-col overflow-hidden rounded-control border border-border text-left"
      aria-label={`Open ${label}`}
    >
      {file === null ? (
        <Skeleton className="h-20 w-full" />
      ) : file !== 'failed' && file.isImage ? (
        <img src={file.url} alt="" className="h-20 w-full object-cover" />
      ) : (
        <span className="flex h-20 w-full items-center justify-center bg-surface-sunken text-foreground-muted [&_svg]:size-6">
          <FileText aria-hidden />
        </span>
      )}
      <span className="truncate px-2 py-1 text-caption font-semibold text-foreground-secondary">{label}</span>
    </button>
  );
}
