# 0007 — OpenAPI document generated at build → Orval TypeScript client

**Context.** PLAN.md §6.1: the frontend client must never drift from the API.

**Decision.**
- The API uses ASP.NET Core's built-in OpenAPI generation. `Microsoft.Extensions.ApiDescription.Server` writes `apps/api/openapi/servicepro.json` on every build. The file is committed, so API changes show up as a reviewable diff.
- `packages/api-client` runs **Orval** on that file to generate typed fetch functions and TanStack Query hooks. Every app imports from `@servicepro/api-client`.
- A single custom fetcher (`packages/api-client/src/http.ts`) adds the base URL, the bearer token, one refresh-and-retry on 401, and RFC 7807 problem-details errors.
- Enums are serialised as strings and appear as string unions in TypeScript.

**Consequences.** Changing an endpoint means rebuilding the API and running `pnpm --filter @servicepro/api-client generate`. TypeScript then shows every call site that broke.
