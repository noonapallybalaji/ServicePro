# 0006 — Hosted background services instead of Hangfire in Phase 1

**Status:** Accepted. **Deviates from PLAN.md §6.2**, which names Hangfire.

**Context.** Phase 1 has two kinds of background work:
- outbox dispatch (continuous)
- expiring job offers that weren't accepted in time (time-based)

Hangfire brings its own schema, a dashboard to secure, and a second retry model next to the outbox.

**Decision.** Use `BackgroundService` implementations: `OutboxProcessor` and `OfferExpiryWorker`. Both poll the database, so they survive restarts and run safely on several instances (row locks, conditional updates). Scheduling a future action is a timestamp column (`offer_expires_at`) plus a poller, not a job queue.

**Revisit when** Phase 3 brings SLA rules, reminders and maintenance campaigns. At that point many differently-scheduled jobs make Hangfire (or Quartz) worth it. The `IEventHandler` and outbox design doesn't change.
