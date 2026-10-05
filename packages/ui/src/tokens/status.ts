import {
  Ban,
  CalendarClock,
  CircleCheck,
  CircleCheckBig,
  CircleMinus,
  CircleX,
  Coffee,
  Inbox,
  MapPin,
  Moon,
  Navigation,
  PackageSearch,
  PhoneMissed,
  ReceiptText,
  ScanSearch,
  Send,
  UserCheck,
  UserSearch,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { Tone } from './tones';

/**
 * Service-request lifecycle — must match the backend state machine (PLAN.md §8).
 * The UI never decides which transition is allowed; it reads that from the API
 * (`GET /api/meta/transitions`). This file only describes how each status LOOKS and READS.
 */
export const SERVICE_REQUEST_STATUSES = [
  'NEW',
  'READY_FOR_ASSIGNMENT',
  'OFFERED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'DIAGNOSING',
  'AWAITING_ESTIMATE_APPROVAL',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'RESCHEDULED',
  'CUSTOMER_UNAVAILABLE',
  'UNABLE_TO_REPAIR',
  'COMPLETED',
  'CLOSED',
  'CLOSED_NO_REPAIR',
  'CANCELLED',
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

/** Who is reading. The same status is worded differently for each audience. */
export type StatusAudience = 'staff' | 'technician' | 'customer';

export interface StatusDefinition {
  tone: Tone;
  icon: LucideIcon;
  labels: Record<StatusAudience, string>;
  /** Something is actively happening right now → pulsing status LED. */
  live?: boolean;
  terminal?: boolean;
}

// TODO(i18n): labels move to the shared translation catalogue (packages/i18n) in the next phase.
export const SERVICE_REQUEST_STATUS: Record<ServiceRequestStatus, StatusDefinition> = {
  NEW: {
    tone: 'neutral',
    icon: Inbox,
    labels: { staff: 'New', technician: 'New', customer: 'Request received' },
  },
  READY_FOR_ASSIGNMENT: {
    tone: 'info',
    icon: UserSearch,
    labels: { staff: 'Ready to assign', technician: 'Unassigned', customer: 'Finding your technician' },
  },
  OFFERED: {
    tone: 'info',
    icon: Send,
    labels: { staff: 'Offered', technician: 'New job offer', customer: 'Finding your technician' },
  },
  ACCEPTED: {
    tone: 'primary',
    icon: UserCheck,
    labels: { staff: 'Accepted', technician: 'Accepted', customer: 'Technician assigned' },
  },
  EN_ROUTE: {
    tone: 'primary',
    icon: Navigation,
    live: true,
    labels: { staff: 'En route', technician: 'On the way', customer: 'On the way' },
  },
  ARRIVED: {
    tone: 'primary',
    icon: MapPin,
    labels: { staff: 'Arrived', technician: 'Arrived', customer: 'Technician has arrived' },
  },
  DIAGNOSING: {
    tone: 'primary',
    icon: ScanSearch,
    live: true,
    labels: { staff: 'Diagnosing', technician: 'Diagnosing', customer: 'Checking your appliance' },
  },
  AWAITING_ESTIMATE_APPROVAL: {
    tone: 'warning',
    icon: ReceiptText,
    labels: {
      staff: 'Awaiting approval',
      technician: 'Waiting for customer',
      customer: 'Estimate ready for you',
    },
  },
  IN_PROGRESS: {
    tone: 'primary',
    icon: Wrench,
    live: true,
    labels: { staff: 'In progress', technician: 'Repairing', customer: 'Repair in progress' },
  },
  WAITING_FOR_PARTS: {
    tone: 'warning',
    icon: PackageSearch,
    labels: {
      staff: 'Waiting for parts',
      technician: 'Waiting for parts',
      customer: 'Waiting for a spare part',
    },
  },
  RESCHEDULED: {
    tone: 'warning',
    icon: CalendarClock,
    labels: { staff: 'Rescheduled', technician: 'Rescheduled', customer: 'Rescheduled' },
  },
  CUSTOMER_UNAVAILABLE: {
    tone: 'warning',
    icon: PhoneMissed,
    labels: {
      staff: 'Customer unavailable',
      technician: 'Customer unavailable',
      customer: 'We missed you',
    },
  },
  UNABLE_TO_REPAIR: {
    tone: 'error',
    icon: Ban,
    labels: { staff: 'Unable to repair', technician: 'Unable to repair', customer: "Couldn't be repaired" },
  },
  COMPLETED: {
    tone: 'success',
    icon: CircleCheck,
    labels: { staff: 'Completed', technician: 'Completed', customer: 'Service completed' },
  },
  CLOSED: {
    tone: 'success',
    icon: CircleCheckBig,
    terminal: true,
    labels: { staff: 'Closed', technician: 'Closed', customer: 'Closed' },
  },
  CLOSED_NO_REPAIR: {
    tone: 'neutral',
    icon: CircleMinus,
    terminal: true,
    labels: { staff: 'Closed · no repair', technician: 'Closed', customer: 'Closed' },
  },
  CANCELLED: {
    tone: 'neutral',
    icon: CircleX,
    terminal: true,
    labels: { staff: 'Cancelled', technician: 'Cancelled', customer: 'Cancelled' },
  },
};

/**
 * The customer never sees 17 statuses. They see six milestones (USER-FLOWS.md §1).
 * Exception statuses map onto the milestone they interrupt and render in an "attention" state.
 */
export const CUSTOMER_MILESTONES = [
  { id: 'confirmed', title: 'Request confirmed' },
  { id: 'assigned', title: 'Technician assigned' },
  { id: 'en-route', title: 'On the way' },
  { id: 'inspection', title: 'Inspection & estimate' },
  { id: 'repair', title: 'Repair' },
  { id: 'completed', title: 'Completed' },
] as const;

export type CustomerMilestoneId = (typeof CUSTOMER_MILESTONES)[number]['id'];

export const STATUS_TO_CUSTOMER_MILESTONE: Record<ServiceRequestStatus, CustomerMilestoneId> = {
  NEW: 'confirmed',
  READY_FOR_ASSIGNMENT: 'confirmed',
  OFFERED: 'confirmed',
  ACCEPTED: 'assigned',
  RESCHEDULED: 'assigned',
  EN_ROUTE: 'en-route',
  ARRIVED: 'inspection',
  DIAGNOSING: 'inspection',
  AWAITING_ESTIMATE_APPROVAL: 'inspection',
  CUSTOMER_UNAVAILABLE: 'inspection',
  IN_PROGRESS: 'repair',
  WAITING_FOR_PARTS: 'repair',
  UNABLE_TO_REPAIR: 'completed',
  COMPLETED: 'completed',
  CLOSED: 'completed',
  CLOSED_NO_REPAIR: 'completed',
  CANCELLED: 'confirmed',
};

/** Technician duty status (PLAN.md §7.8 `technicians.duty_status`). */
export const TECHNICIAN_DUTY_STATUSES = ['AVAILABLE', 'ON_JOB', 'ON_BREAK', 'OFF_DUTY'] as const;
export type TechnicianDutyStatus = (typeof TECHNICIAN_DUTY_STATUSES)[number];

export interface DutyStatusDefinition {
  label: string;
  icon: LucideIcon;
  /** Literal class for the status dot (Tailwind must see the full string). */
  dotClass: string;
  tone: Tone;
}

export const TECHNICIAN_DUTY_STATUS: Record<TechnicianDutyStatus, DutyStatusDefinition> = {
  AVAILABLE: { label: 'Available', icon: Zap, dotClass: 'bg-tech-available', tone: 'success' },
  ON_JOB: { label: 'On a job', icon: Wrench, dotClass: 'bg-tech-on-job', tone: 'primary' },
  ON_BREAK: { label: 'On break', icon: Coffee, dotClass: 'bg-tech-break', tone: 'warning' },
  OFF_DUTY: { label: 'Off duty', icon: Moon, dotClass: 'bg-tech-offline', tone: 'neutral' },
};

/**
 * Default AI decision bands (PLAN.md §9.3). The live values come from the `settings`
 * table via the API; these are fallbacks for previews and tests only.
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS = { autoApprove: 85, review: 60 } as const;

export type ConfidenceBand = 'auto' | 'review' | 'reject';

export function getConfidenceBand(
  score: number,
  thresholds: { autoApprove: number; review: number } = DEFAULT_CONFIDENCE_THRESHOLDS,
): ConfidenceBand {
  if (score >= thresholds.autoApprove) return 'auto';
  if (score >= thresholds.review) return 'review';
  return 'reject';
}
