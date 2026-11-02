import type { TicketCategory, TicketStatus } from '@servicepro/api-client';

import type { BadgeTone, IconName } from '@/components/ui';

/** Help request topics, in the customer's words. */
export const TOPICS: { value: TicketCategory; label: string; icon: IconName }[] = [
  { value: 'BOOKING', label: 'My booking', icon: 'calendar' },
  { value: 'LATE_TECHNICIAN', label: 'Technician is late', icon: 'time' },
  { value: 'PAYMENT', label: 'Payment or bill', icon: 'card' },
  { value: 'REPAIR_QUALITY', label: 'Repair quality', icon: 'construct' },
  { value: 'DAMAGE_OR_SAFETY', label: 'Damage or safety', icon: 'warning' },
  { value: 'OTHER', label: 'Something else', icon: 'help-circle' },
];

const OTHER = { value: 'OTHER' as TicketCategory, label: 'Something else', icon: 'help-circle' as IconName };

export const topicOf = (category: TicketCategory) => TOPICS.find((t) => t.value === category) ?? OTHER;

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'With our team', tone: 'primary' },
  WAITING_ON_CUSTOMER: { label: 'Waiting for you', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
};
