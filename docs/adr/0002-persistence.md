# 0002 — One PostgreSQL database, one EF Core context, schema per module

**Context.** PLAN.md §7 defines one PostgreSQL schema design. The modules must stay separate, but one business transaction often touches two modules, e.g. assigning a technician updates both the assignment and the service request.

**Decision.**
- One `ServiceProDbContext` in `ServicePro.Infrastructure`. It applies `IEntityTypeConfiguration` classes from every module assembly.
- Modules depend on the base `DbContext` type (`db.Set<T>()`), never on the concrete context. This keeps the dependency direction module → EF Core, not module → Infrastructure.
- Each module maps its tables into its own PostgreSQL schema: `identity`, `catalog`, `crm`, `workforce`, `ops`, `dispatch`, `comms`, `billing`, and `platform` for the outbox, settings and audit.
- Naming is snake_case (EFCore.NamingConventions), matching PLAN.md §7.1.
- Conventions from PLAN §7.1 are enforced centrally:
  - UUIDv7 keys (`Guid.CreateVersion7()`).
  - A `tenant_id` global query filter on every `ITenantOwned` entity.
  - `created_at` / `updated_at` stamped by a SaveChanges interceptor.
  - `xmin` concurrency tokens on contended aggregates.
  - Enums stored as text.
- Migrations live in one place (`ServicePro.Infrastructure/Persistence/Migrations`) and are applied at startup in Development and by the pipeline elsewhere.

**Consequences.** There's one migration history and atomic cross-module writes, but no compile-time protection against one module querying another module's table. Architecture tests and code review cover that gap.
