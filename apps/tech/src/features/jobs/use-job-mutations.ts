import { getGetMyJobQueryKey, getListMyJobsQueryKey, useTransitionMyJob, type ServiceRequestStatus } from '@servicepro/api-client';
import { toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';

import { currentPosition } from '../../lib/location';

/** Refetch the job and the job list after any change to it. */
export function useRefreshJob(jobId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetMyJobQueryKey(jobId) }),
      queryClient.invalidateQueries({ queryKey: getListMyJobsQueryKey() }),
    ]);
}

export interface TransitionArgs {
  to: ServiceRequestStatus;
  reasonCode?: string;
  note?: string;
  completionCode?: string;
  successMessage?: string;
}

/**
 * A status change, stamped with the technician's location when the phone allows it.
 * `silent` lets a sheet show the error inline instead of as a toast.
 */
export function useJobTransition(jobId: string, options: { silent?: boolean } = {}) {
  const refresh = useRefreshJob(jobId);
  const mutation = useTransitionMyJob({ mutation: { meta: { silent: options.silent ?? false } } });

  async function run({ to, reasonCode, note, completionCode, successMessage }: TransitionArgs) {
    const position = await currentPosition();
    await mutation.mutateAsync({
      serviceRequestId: jobId,
      data: {
        to,
        reasonCode: reasonCode ?? null,
        note: note ?? null,
        completionCode: completionCode ?? null,
        latitude: position?.latitude ?? null,
        longitude: position?.longitude ?? null,
      },
    });
    await refresh();
    if (successMessage) toast.success(successMessage);
  }

  return { run, isPending: mutation.isPending, error: mutation.error, reset: mutation.reset };
}
