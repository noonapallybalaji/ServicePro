# 0003 — Service-request lifecycle as an explicit transition table

**Status:** Accepted. **Deviates from PLAN.md §5.2**, which names the `Stateless` library.

**Context.** The lifecycle (PLAN.md §8) needs to answer three questions:
1. Is `from → to` legal?
2. May this **actor** (staff, technician, system, customer) perform it?
3. What **data** must accompany it (reason code, completion OTP, after-photo)?

The same answers must be exposed to clients (`GET /api/v1/meta/transitions`), so technician buttons match server rules.

**Decision.** A single immutable table, `ServiceRequestWorkflow.Transitions`. Each row declares `From`, `To`, the allowed actors and the requirements. The `ServiceRequest` aggregate consults this table for every change. The metadata endpoint serialises the same table.

**Why not Stateless.** Stateless models triggers and guards well, but its configuration isn't a data structure we can serialise for clients. Its guard model would split the rules between the library configuration and the aggregate. A plain table is about 60 lines, fully unit-testable, and has no dependency.

**Consequences.** New transitions are one row plus a test. Side effects (notifications, SignalR, ledger entries) are not in the table. They react to the `ServiceRequestStatusChanged` event (ADR 0004).
