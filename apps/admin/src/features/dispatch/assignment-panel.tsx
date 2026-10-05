import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetServiceRequestQueryKey,
  getListServiceRequestsQueryKey,
  useAssignTechnician,
  useGetDispatchCandidates,
  type CandidateResponse,
} from '@servicepro/api-client';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DutyStatusBadge,
  EmptyState,
  Field,
  Input,
  Text,
  cn,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Star, UserSearch } from 'lucide-react';
import { useState } from 'react';

const FACTOR_LABEL: Record<string, string> = {
  distance: 'Distance',
  skill: 'Skill',
  workload: 'Workload',
  performance: 'Performance',
  continuity: 'Served before',
  fairness: 'Fair share',
};

/**
 * Ranked technicians with the WHY of each score (PLAN.md §10, suggest mode). Not-recommended
 * people stay visible with their reasons; assigning them needs a short override reason.
 */
export function AssignmentPanel({ serviceRequestId, onAssigned }: { serviceRequestId: string; onAssigned?: () => void }) {
  const candidates = useGetDispatchCandidates(serviceRequestId);
  const [overrideFor, setOverrideFor] = useState<{ candidate: CandidateResponse; markAccepted: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();

  const assign = useAssignTechnician({
    mutation: {
      onSuccess: async (assignment) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetServiceRequestQueryKey(serviceRequestId) }),
          queryClient.invalidateQueries({ queryKey: getListServiceRequestsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: ['/api/v1/admin/dashboard'] }),
        ]);
        toast.success(assignment.status === 'ACCEPTED' ? 'Technician assigned' : 'Offer sent', {
          description: assignment.status === 'ACCEPTED' ? 'They can start the job from their app.' : 'They have a few minutes to accept.',
        });
        setOverrideFor(null);
        setReason('');
        onAssigned?.();
      },
    },
  });

  function start(candidate: CandidateResponse, markAccepted: boolean) {
    if (!candidate.isRecommended) {
      setOverrideFor({ candidate, markAccepted });
      return;
    }

    assign.mutate({ serviceRequestId, data: { technicianId: candidate.technicianId, markAccepted, overrideReason: null } });
  }

  return (
    <>
      <QueryState query={candidates} loading={<DefaultSkeleton rows={3} />} errorTitle="Couldn't rank technicians">
        {(list) =>
          list.length === 0 ? (
            <EmptyState size="compact" icon={UserSearch} title="Nobody has this skill yet" description="Add the skill to a technician under Technicians." />
          ) : (
            <ul className="flex flex-col gap-3">
              {list.map((candidate) => (
                <li key={candidate.technicianId}>
                  <CandidateRow
                    candidate={candidate}
                    busy={assign.isPending && assign.variables?.data.technicianId === candidate.technicianId}
                    onOffer={() => start(candidate, false)}
                    onAssign={() => start(candidate, true)}
                  />
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>

      <Dialog open={overrideFor !== null} onOpenChange={(open) => !open && setOverrideFor(null)}>
        <DialogContent>
          <DialogHeader
            title={`Assign ${overrideFor?.candidate.fullName ?? ''} anyway?`}
            description={`Not recommended: ${overrideFor?.candidate.reasons.join('; ') ?? ''}`}
          />
          <DialogBody>
            <Field label="Reason" hint="Saved with the assignment so the decision can be understood later.">
              <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Agreed by phone, he'll go after his shift" />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideFor(null)}>
              Cancel
            </Button>
            <Button
              loading={assign.isPending}
              disabled={reason.trim().length < 3}
              onClick={() =>
                overrideFor &&
                assign.mutate({
                  serviceRequestId,
                  data: { technicianId: overrideFor.candidate.technicianId, markAccepted: overrideFor.markAccepted, overrideReason: reason.trim() },
                })
              }
            >
              {overrideFor?.markAccepted ? 'Assign' : 'Send offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CandidateRow({ candidate, busy, onOffer, onAssign }: { candidate: CandidateResponse; busy: boolean; onOffer: () => void; onAssign: () => void }) {
  return (
    <Card padding="sm" className={cn('flex flex-col gap-3', !candidate.isRecommended && 'bg-surface-sunken')}>
      <div className="flex items-start gap-3">
        <Avatar name={candidate.fullName} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text weight="semibold">
              #{candidate.rank} {candidate.fullName}
            </Text>
            {candidate.isRecommended ? (
              <Badge tone="success" size="sm">
                Recommended
              </Badge>
            ) : (
              <Badge tone="warning" size="sm">
                Not recommended
              </Badge>
            )}
            <DutyStatusBadge status={candidate.dutyStatus} size="sm" />
          </div>
          <Text variant="sm" tone="secondary">
            {candidate.specialty}
            {candidate.distanceKm != null ? ` · ${candidate.distanceKm} km` : ''} · {candidate.jobsToday}/{candidate.maxJobsPerDay} jobs today
            {candidate.ratingAverage != null ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Star aria-hidden className="size-3 fill-rating text-rating" />
                {candidate.ratingAverage.toFixed(1)}
              </span>
            ) : null}
          </Text>
          {candidate.reasons.length > 0 ? (
            <Text variant="sm" tone="warning">
              {candidate.reasons.join(' · ')}
            </Text>
          ) : null}
        </div>
        <div className="flex flex-col items-end">
          <Text variant="stat-sm">{Math.round(candidate.matchScore)}</Text>
          <Text variant="caption" tone="muted">
            match
          </Text>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Score breakdown">
        {Object.entries(candidate.breakdown).map(([factor, points]) => (
          <li key={factor}>
            <Badge size="sm" appearance="outline">
              {FACTOR_LABEL[factor] ?? factor} {points}
            </Badge>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 *:flex-1 sm:*:flex-none">
        <Button size="sm" variant="outline" disabled={busy} onClick={onAssign}>
          Assign directly
        </Button>
        <Button size="sm" loading={busy} onClick={onOffer}>
          Send offer
        </Button>
      </div>
    </Card>
  );
}
