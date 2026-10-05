# Architecture Decision Records

Short records of decisions that shape the codebase. Each states the context, the decision, and its consequences. A decision that **deviates from PLAN.md** says so explicitly.

| # | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with a shared contracts project | Accepted |
| [0002](0002-persistence.md) | One PostgreSQL database, one EF Core context, schema per module | Accepted |
| [0003](0003-service-request-workflow.md) | Service-request lifecycle as an explicit transition table (not the Stateless library) | Accepted (deviates) |
| [0004](0004-outbox-and-events.md) | Domain events through a transactional outbox | Accepted |
| [0005](0005-authentication.md) | JWT + rotating refresh cookie; phone OTP for technicians | Accepted |
| [0006](0006-background-processing.md) | Hosted background services instead of Hangfire in Phase 1 | Accepted (deviates) |
| [0007](0007-api-contract.md) | OpenAPI document generated at build → Orval TypeScript client | Accepted |
| [0008](0008-geo-without-postgis.md) | Latitude/longitude columns + Haversine instead of PostGIS in Phase 1 | Accepted (deviates) |
| [0009](0009-external-providers.md) | External providers behind interfaces with development fallbacks | Accepted |
