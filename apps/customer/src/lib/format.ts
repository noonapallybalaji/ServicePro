import type { ServiceRequestStatus } from '@servicepro/api-client';
import { Linking } from 'react-native';

import { config } from './config';

export const formatINR = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const formatDate = (value: string) => dateFormat.format(new Date(value));
export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value));

/** "+91 98765-43210", "098765 43210" → "9876543210"; null unless it's a 10-digit Indian mobile number. */
export function mobileDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const prettyPhone = (raw: string) => {
  const digits = mobileDigits(raw);
  return digits ? `${digits.slice(0, 5)} ${digits.slice(5)}` : raw;
};

export const callSupport = () => void Linking.openURL(`tel:${config.supportPhone}`);

export const whatsappSupport = (text = 'Hi Pakka Fix, I need help with an appliance repair.') =>
  void Linking.openURL(`https://wa.me/${config.whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`);

/** The six milestones a customer sees (packages/ui tokens/status.ts), with plain-language status names. */
export const MILESTONES = ['Booked', 'Technician assigned', 'On the way', 'Checking the fault', 'Repair', 'Done'] as const;

const STATUS: Record<ServiceRequestStatus, { label: string; step: number; tone: 'primary' | 'success' | 'warning' | 'neutral' }> = {
  NEW: { label: 'Booked', step: 0, tone: 'primary' },
  READY_FOR_ASSIGNMENT: { label: 'Booked', step: 0, tone: 'primary' },
  OFFERED: { label: 'Finding a technician', step: 0, tone: 'primary' },
  ACCEPTED: { label: 'Technician assigned', step: 1, tone: 'primary' },
  RESCHEDULED: { label: 'Rescheduled', step: 1, tone: 'warning' },
  EN_ROUTE: { label: 'On the way', step: 2, tone: 'primary' },
  ARRIVED: { label: 'Technician arrived', step: 3, tone: 'primary' },
  DIAGNOSING: { label: 'Checking the fault', step: 3, tone: 'primary' },
  AWAITING_ESTIMATE_APPROVAL: { label: 'Estimate waiting for you', step: 3, tone: 'warning' },
  CUSTOMER_UNAVAILABLE: { label: "Couldn't reach you", step: 3, tone: 'warning' },
  IN_PROGRESS: { label: 'Repair in progress', step: 4, tone: 'primary' },
  WAITING_FOR_PARTS: { label: 'Waiting for parts', step: 4, tone: 'warning' },
  UNABLE_TO_REPAIR: { label: "Couldn't be repaired", step: 5, tone: 'neutral' },
  COMPLETED: { label: 'Repaired', step: 5, tone: 'success' },
  CLOSED: { label: 'Repaired', step: 5, tone: 'success' },
  CLOSED_NO_REPAIR: { label: 'Closed without repair', step: 5, tone: 'neutral' },
  CANCELLED: { label: 'Cancelled', step: 0, tone: 'neutral' },
};

export const statusOf = (status: ServiceRequestStatus) => STATUS[status];

export const isActive = (status: ServiceRequestStatus) => !['COMPLETED', 'CLOSED', 'CLOSED_NO_REPAIR', 'CANCELLED', 'UNABLE_TO_REPAIR'].includes(status);
