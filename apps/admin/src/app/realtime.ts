import type { RealtimeMessage } from '@servicepro/api-client';

/**
 * What to refetch when the ops hub says something changed (PLAN.md §5.3). Prefixes match the
 * generated query keys (their URLs), so one entry covers lists, details and nested resources.
 */
const SERVICE_REQUEST_VIEWS = [
  '/api/v1/admin/dashboard',
  '/api/v1/admin/service-requests',
  '/api/v1/service-requests',
  '/api/v1/admin/notifications',
  '/api/v1/admin/billing',
] as const;

export const LIVE_INVALIDATION: Partial<Record<RealtimeMessage, readonly string[]>> = {
  serviceRequestChanged: SERVICE_REQUEST_VIEWS,
  technicianChanged: ['/api/v1/admin/technicians', '/api/v1/admin/service-requests'],
  supportChanged: ['/api/v1/admin/support'],
};
