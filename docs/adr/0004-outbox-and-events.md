# 0004 — Domain events through a transactional outbox

**Context.** PLAN.md §5.2–5.3: a status change and its side effects (WhatsApp message, live dashboard push) must neither be lost nor sent twice, and modules must not call each other synchronously for side effects.

**Decision.**
- Aggregates raise events (`AggregateRoot.Raise`). Event types are public records in `ServicePro.Contracts.Events`.
- A SaveChanges interceptor serialises raised events into `platform.outbox_messages` **in the same transaction** as the state change.
- `OutboxProcessor` (a hosted service) polls unprocessed messages with `FOR UPDATE SKIP LOCKED`. That makes it safe with several instances. It resolves every `IEventHandler<TEvent>` from DI and invokes each one.
- Delivery is at-least-once. Each successful handler run is recorded in `platform.outbox_consumers (message_id, handler)`, so a retry skips handlers that already succeeded. Handlers are therefore effectively idempotent.
- Failed messages are retried with backoff and marked dead after 10 attempts. That shows up in logs and health.

**Consequences.** Side effects are eventually consistent, usually within a second. Handlers must not assume ordering across different service requests.
