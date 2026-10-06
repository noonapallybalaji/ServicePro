# ServicePro

Service management and technician dispatch for an appliance-repair business: requests, dispatch, a technician app, live tracking for customers, billing. See [PLAN.md](PLAN.md) for the product, [docs/](docs/) for UX and design, and [docs/adr/](docs/adr/) for architecture decisions.

**Status:** Phase 0 (foundations) and Phase 1 (digitise operations) of PLAN.md §16, plus online booking brought forward from Phase 2. AI intake isn't started.

## What's here

| Path | What |
|---|---|
| `apps/api` | ASP.NET Core 10 modular monolith (ADR 0001): Identity, Catalog, Customers, Technicians, ServiceRequests, Dispatch, Notifications, Billing |
| `apps/admin` | Owner/dispatcher web app: dashboard, live board, requests, dispatch, customers, technicians, billing, settings · `/design-system` |
| `apps/tech` | Technician PWA: OTP sign-in, offers, job workflow, completion code, bill, payment, earnings |
| `apps/web-public` | Customer site: landing, services, service pages, about, contact, FAQ (pre-rendered for SEO — [docs/SEO.md](docs/SEO.md)), online booking `/book`, tracking `/t/{token}` |
| `packages/ui` | Design system (tokens, components) — [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) |
| `packages/api-client` | Generated TypeScript client + React Query hooks (ADR 0007) |
| `packages/app-kit` | Shared app plumbing: providers, session guard, query states |
| `infra/docker-compose.yml` | Local PostgreSQL (+ optional Seq) |

## Run locally

Prerequisites: .NET SDK 10, Node 20.19+, pnpm 10, Docker.

```bash
# 1. Database
docker compose -f infra/docker-compose.yml up -d

# 2. API — migrates and seeds demo data on start (http://localhost:5180, docs at /docs)
cd apps/api
dotnet run --project src/ServicePro.Api --launch-profile http

# 3. Apps (each in its own terminal, from the repo root)
pnpm install
pnpm --filter @servicepro/admin dev       # http://localhost:5190
pnpm --filter @servicepro/tech dev        # http://localhost:5191
pnpm --filter @servicepro/web-public dev  # http://localhost:5192
```

**Demo sign-ins (Development only):**

| App | Sign in |
|---|---|
| Admin | `owner@servicepro.local` / `ChangeMe!2026` |
| Technician | Ravi `9876500001`, Suresh `9876500002`, Anil `9876500003`, Priya `9876500004`. The OTP is shown on screen in Development |
| Customer | Book at http://localhost:5192/book (try pincode `500081`; the SMS code is shown on screen in Development), or open a tracking link from a request's detail page |

WhatsApp/SMS messages are written to the API log until a provider is configured (ADR 0009).

## Common tasks

```bash
# Backend tests
cd apps/api
dotnet test --project tests/ServicePro.UnitTests
dotnet test --project tests/ServicePro.ArchitectureTests
dotnet test --project tests/ServicePro.IntegrationTests   # needs Docker

# After changing an API endpoint: rebuild the API (writes openapi/servicepro.json), then
pnpm --filter @servicepro/api-client generate

# New EF migration
cd apps/api
dotnet ef migrations add <Name> --project src/ServicePro.Infrastructure --startup-project src/ServicePro.Infrastructure --output-dir Persistence/Migrations

# Frontend quality gates
pnpm lint && pnpm typecheck && pnpm build
```

## Configuration

Secrets never live in the repo. Outside Development, set them as environment variables (`__` separates sections):

| Setting | Purpose |
|---|---|
| `ConnectionStrings__Database` | PostgreSQL |
| `Auth__SigningKey` | JWT signing key (≥ 32 chars) |
| `Notifications__PublicSiteUrl` | Base URL for customer tracking links |
| `Notifications__WhatsApp__PhoneNumberId`, `…__AccessToken` | Meta WhatsApp Cloud API (otherwise messages are logged) |
| `Seed__OwnerEmail`, `Seed__OwnerPassword` | First owner account on an empty database |

Business rules (offer timeout, matching weights, GST, stuck threshold…) are edited in the admin app under **Settings → Business rules**.
