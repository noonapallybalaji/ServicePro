import type { AvailableTransition, ServiceRequestStatus } from '@servicepro/api-client';

/*
 * Technician wording for each transition (USER-FLOWS.md §2.0). The API decides which
 * transitions are allowed; this file only decides how they read and which one is primary.
 */

/** Forward steps in the order a job normally moves. The first allowed one is the primary button. */
export const FORWARD_ACTIONS: Partial<Record<ServiceRequestStatus, string>> = {
  EN_ROUTE: 'Start travel',
  ARRIVED: "I've arrived",
  DIAGNOSING: 'Start diagnosis',
  IN_PROGRESS: 'Start repair',
  COMPLETED: 'Complete job',
};

const FORWARD_ORDER = Object.keys(FORWARD_ACTIONS) as ServiceRequestStatus[];

export interface ReasonOption {
  code: string;
  label: string;
}

/** "Problem" sheet: exception transitions and the reasons a technician can pick. */
export const PROBLEM_ACTIONS: Partial<Record<ServiceRequestStatus, { label: string; reasons: ReasonOption[] }>> = {
  CUSTOMER_UNAVAILABLE: {
    label: 'Customer not available',
    reasons: [
      { code: 'NOT_AT_HOME', label: 'Nobody at home' },
      { code: 'PHONE_UNREACHABLE', label: "Phone isn't reachable" },
      { code: 'WRONG_ADDRESS', label: 'Wrong address' },
    ],
  },
  WAITING_FOR_PARTS: {
    label: 'Need a spare part',
    reasons: [
      { code: 'PART_REQUIRED', label: 'Part needed — not carried' },
      { code: 'PART_OUT_OF_STOCK', label: 'Part out of stock' },
    ],
  },
  UNABLE_TO_REPAIR: {
    label: "Can't repair",
    reasons: [
      { code: 'BEYOND_REPAIR', label: 'Beyond repair' },
      { code: 'NEEDS_WORKSHOP', label: 'Needs workshop repair' },
      { code: 'CUSTOMER_DECLINED', label: 'Customer declined the repair' },
    ],
  },
  RESCHEDULED: {
    label: 'Reschedule visit',
    reasons: [
      { code: 'CUSTOMER_REQUEST', label: 'Customer asked for another time' },
      { code: 'RUNNING_LATE', label: "I'm running late" },
      { code: 'NEEDS_MORE_TIME', label: 'Job needs more time' },
    ],
  },
};

export function primaryAction(available: readonly AvailableTransition[]): AvailableTransition | undefined {
  return FORWARD_ORDER.map((status) => available.find((t) => t.to === status)).find((t) => t !== undefined);
}

export function problemActions(available: readonly AvailableTransition[]): AvailableTransition[] {
  return available.filter((t) => t.to in PROBLEM_ACTIONS);
}
