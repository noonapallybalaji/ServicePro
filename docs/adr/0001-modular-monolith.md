# 0001 — Modular monolith with a shared contracts project

**Context.** PLAN.md §2 and §5 call for one deployable with strict module boundaries. One developer, one business, one database.

**Decision.**
- One ASP.NET Core host (`ServicePro.Api`) composes independent modules: `Identity`, `Catalog`, `Customers`, `Technicians`, `ServiceRequests`, `Dispatch`, `Notifications`, `Billing`.
- Each module is one project with `Domain/`, `Application/` (use-case handlers), `Infrastructure/` (EF configurations, adapters) and `Endpoints/`. It exposes a single `IModule` implementation for registration and routing.
- **Modules never reference each other.** They communicate through `ServicePro.Contracts`:
  - *Ports* — small interfaces such as `ICustomerDirectory` or `IServiceRequestWorkflow`, implemented by the owning module and consumed by others (dependency inversion).
  - *Events* — immutable records such as `ServiceRequestStatusChanged`, delivered through the outbox (ADR 0004).
- `ServicePro.SharedKernel` holds domain primitives (Entity, AggregateRoot, Result, Error, PhoneNumber, GeoLocation). `ServicePro.BuildingBlocks` holds shared technical plumbing (outbox, settings, file storage, endpoint helpers).
- `ServicePro.Infrastructure` owns the `DbContext` composition and migrations, so it is the only project that references every module.
- Architecture tests (`ServicePro.ArchitectureTests`, NetArchTest) fail the build if a module references another module.

**Consequences.**
- Adding a module means adding one project and one line in `ModuleCatalog` (open/closed).
- A cross-module write runs in one transaction, because every module uses the same scoped `DbContext` through its port.
- Any module could be extracted later, because its only external dependencies are Contracts and events.
