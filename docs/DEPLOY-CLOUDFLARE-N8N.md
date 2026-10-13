# Cloudflare Tunnel + n8n WhatsApp assistant

How to expose the ServicePro API (and the customer website for tracking links) through Cloudflare Tunnel, and how to connect the n8n workflow **ServicePro WhatsApp Enquiry Assistant** to it safely.

> **Status (13 Oct 2026):**
> - **Verified:** the API and site were run in `Public` mode behind temporary Cloudflare quick tunnels (`*.trycloudflare.com`). All 31 checks in `apps/api/scripts/verify-public-api.mjs` passed over public HTTPS.
> - **Not yet done:** your named tunnel on your own domain (needs your Cloudflare login and domain), and the n8n Cloud workflow itself (needs your n8n account). Neither is complete until the checks in [§7](#7-verify-before-going-live) pass on your real hostnames.

---

## 1. Verified endpoints

Verified against the source and over HTTPS. Error bodies are RFC 9457 problem details: `{ type, title, status, code?, errors? }`.

| Purpose | Method and path (actual) | Auth | Request | Response (200) | Errors | Anonymous internet? |
|---|---|---|---|---|---|---|
| Service catalogue | `GET /api/v1/catalog/categories` | none | — | `[{ id, code, name, baseVisitCharge, requiresPhotos, sortOrder, isActive, issueTypes: [{ id, categoryId, code, name, typicalDurationMinutes, minSkillLevel, defaultPriority, isActive }] }]` | — | Yes (read-only, public data) |
| Serviceability | `GET /api/v1/catalog/serviceability/{pincode}` | none · rate limit 120/min/IP | `pincode` in path | `{ pincode, isServiceable, areas: [string] }` | Malformed pincode → **200** with `isServiceable: false` (not an error) | Yes |
| Booking code (website) | `POST /api/v1/public/bookings/code` | none · 10/min/IP in Public mode | `{ phone }` | `{ expiresAt, codeLength, developmentCode }`. `developmentCode` is **always null outside Development** | 400 bad phone, 409 cooldown, 429 | Yes (sends an SMS) |
| Booking (website) | `POST /api/v1/public/bookings` | none (SMS code) or signed-in customer · 10/min/IP | `{ categoryId, issueTypeId?, problemDescription, fullName, phone, code?, address: { label?, line1, line2?, landmark?, locality, city, state?, pincode, latitude?, longitude? }, preferredSlotStart, preferredSlotEnd }` | `{ srNumber, trackingPath, session? }`. **`session` contains an access token**; it is for the website only | 400 validation / wrong code / not serviceable / slot invalid, 403 blocked customer | Yes, but **not for n8n** (needs an SMS code and returns a session) |
| **Booking (n8n) — new** | `POST /api/v1/integrations/bookings` | **integration key** header `X-ServicePro-Integration-Key` · 60/min/IP | `{ idempotencyKey, customerConfirmed: true, categoryId, issueTypeId?, problemDescription, fullName, phone, address: {…same…}, preferredSlotStart, preferredSlotEnd }` | `{ srNumber, status, statusText, appointmentConfirmed, preferredSlotStart, preferredSlotEnd, trackingUrl, duplicate }`. **No session, token or code** | 401 missing/wrong key, 400 validation (`customerConfirmed` false, `booking.not_serviceable`, `booking.category_invalid`, `booking.issue_invalid`, `booking.slot_invalid`, `phone.invalid`), 403 blocked customer, 429 | Only with the key |
| Public tracking | `GET /api/v1/public/track/{token}` | none · 120/min/IP | `token` in path | status, technician (name, rating), timeline, bill, photos | 404 unknown token | Yes (the token is the secret; 24 random characters) |
| Tracking **page** (customer) | `GET /t/{token}` on the **website** | — | — | HTML (noindex) | — | Yes |
| Price list | `GET /api/v1/catalog/price-list?categoryId=` | **staff or technician** sign-in | — | — | 401 | **No** (not usable by n8n) |
| Brands | `GET /api/v1/catalog/brands` | **staff or technician** sign-in | — | — | 401 | **No** |
| Customer by phone | `GET /api/v1/admin/customers/by-phone/{phone}` | **staff** sign-in | — | — | 401/403 | **No**; never give n8n staff credentials |

**Differences from your reference list**

- **Tracking:** the API route is `/api/v1/public/track/{token}`, but what customers open is the **website** page `/t/{token}`. Booking responses already contain the full link (`trackingUrl`, or `trackingPath` on the website).
- **Price list and brands:** not public. They require a staff or technician session, so n8n can't call them. Use `baseVisitCharge` from the catalogue for prices.
- **Customer lookup:** `by-phone` is an admin endpoint. n8n doesn't need it, because both booking endpoints **find or create the customer by phone automatically** (a matching address is reused). Don't add a separate customer-creation call.
- **Public booking endpoint:** `POST /api/v1/public/bookings` needs an SMS code (or a signed-in customer) and returns a customer session. It isn't suitable for a WhatsApp bot. Use the new `POST /api/v1/integrations/bookings` instead (§3).
- **Slots:** there are **no live available slots**. The API accepts a *preferred* window (any start within the next 30 days, at most 8 hours long). Every booking starts as **NEW**, and the office confirms the visit time later.

## 2. Security model

| Risk | What protects it |
|---|---|
| Development settings exposed to the internet | Run in the **`Public`** environment (`apps/api/scripts/start-public-api.ps1`). Without that, one-time codes are echoed, the repo's JWT key is used, and `/docs` is open. On startup, **`ExposureGuard` refuses to run** outside Development if the signing key is the repo's development key, codes are echoed, or **any staff account still uses the demo password `ChangeMe!2026`**. Verified: it refuses with your current database until you change the owner password. |
| Secrets in git | Secrets live in `apps/api/.env.public` (git-ignored). Only the template `public.env.example` is committed. The n8n key is stored **only as a SHA-256 hash** in the API config. The tunnel credentials stay in `%USERPROFILE%\.cloudflared`. |
| Admin APIs | Unchanged: staff JWT plus role policies. The n8n key carries role `Integration` and works **only** on `POST /api/v1/integrations/bookings` (verified: 401 on admin, price-list and brands endpoints). |
| Direct access bypassing Cloudflare | The API listens on `127.0.0.1` only, and so does the site server. cloudflared is the only way in. |
| Rate limits behind the tunnel | Limits use Cloudflare's `CF-Connecting-IP`, trusted **only** when the connection comes from localhost (cloudflared), so remote callers can't spoof their limit bucket. |
| Database | PostgreSQL stays local; it is not tunnelled. |

## 3. Booking safety (n8n endpoint)

- **Customer confirmation:** `customerConfirmed` must be `true`, otherwise you get 400. The workflow sets it only when the customer replies "yes" to the full summary (§6.3).
- **No duplicates:** `idempotencyKey` (use the WhatsApp **message id of the customer's "yes"**) is stored on the job with a unique index per channel. A retry, timeout or double webhook returns the **same** booking with `duplicate: true`. Verified: a repeat returned the same SR, and 5 simultaneous deliveries created exactly one booking. A *new* "yes" message creates a new booking, by design. The inbound-message dedup you already have (*Skip Already Processed Message*) stops the same message being processed twice.
- **Trust boundary:** the phone number comes from the **WhatsApp Trigger** (the sender, as delivered by Meta), never from the AI, so the assistant can't be talked into booking for someone else's number.
- **No secrets:** the response has no session, JWT or code.
- **Honest status:** `status` is `NEW`, `appointmentConfirmed` is `false`, and `statusText` reads "Request received. Our team will confirm the visit time and technician on WhatsApp." The assistant must repeat that, never "your appointment is confirmed".
- **Audit:** the job's history records the creator as **AI agent**, channel **WhatsApp**. Keys and phone numbers aren't logged by the integration layer.
- **Business-rule impact:** none for staff. WhatsApp bookings follow the same rules as website bookings: NEW, the office reviews (admin → *To review*, **Confirm booking**), then dispatch.

## 4. Manual setup: API and website

Do these on the machine that runs ServicePro.

1. **Change the demo owner password.** Sign in to the admin app as `owner@servicepro.local`, go to **Settings → Team**, edit Owner, and set a new strong password. The API won't start in Public mode until you do.
2. **Create the secrets file**:
   ```powershell
   cd D:\electronics
   copy apps\api\public.env.example apps\api\.env.public
   powershell -File apps\api\scripts\new-signing-key.ps1      # → Auth__SigningKey
   powershell -File apps\api\scripts\new-integration-key.ps1  # → hash for .env.public, key for n8n (shown once)
   notepad apps\api\.env.public
   ```
   Fill in:
   - `ConnectionStrings__Database` (your real database password);
   - `Auth__SigningKey`;
   - `Notifications__PublicSiteUrl=https://<www.yourdomain.com>`;
   - `Integrations__Keys__n8n=<hash>`.
3. **Build the website for your domain:**
   ```powershell
   $env:VITE_SITE_URL = 'https://<www.yourdomain.com>'; $env:VITE_BUSINESS_NAME = '<Your business name>'
   pnpm --filter @servicepro/web-public build
   ```
4. **Start the API and the website**, each in its own terminal. Stop the Development API first; both use port 5180.
   ```powershell
   powershell -ExecutionPolicy Bypass -File apps\api\scripts\start-public-api.ps1
   node apps\web-public\scripts\serve-dist.mjs      # http://127.0.0.1:5193, proxies /api to 5180
   ```

## 5. Manual setup: Cloudflare Tunnel (your domain)

Prerequisite: the domain is on Cloudflare (its nameservers point to Cloudflare). `cloudflared` 2026.9.1 is already installed here.

```powershell
cloudflared tunnel login                               # browser: pick your domain → writes cert.pem
cloudflared tunnel create servicepro                   # prints the TUNNEL_UUID, writes <UUID>.json credentials
cloudflared tunnel route dns servicepro <api.yourdomain.com>
cloudflared tunnel route dns servicepro <www.yourdomain.com>
copy infra\cloudflare\config.example.yml $env:USERPROFILE\.cloudflared\config.yml
notepad $env:USERPROFILE\.cloudflared\config.yml       # fill <TUNNEL_UUID>, <YOU>, both hostnames
cloudflared tunnel ingress validate
cloudflared tunnel run servicepro
```

To keep it running after reboots: `cloudflared service install` (from an admin terminal), and make sure the API and site start too (Task Scheduler is the simplest option).

In the Cloudflare dashboard, for the **API hostname**:
- Keep **Bot Fight Mode / Super Bot Fight Mode off**, or add a WAF *Skip* rule for `/api/v1/integrations/*`. n8n Cloud is a server, and bot rules can block it.
- Don't put Cloudflare Access in front of `/api/v1/catalog/*`, `/api/v1/public/*` or `/api/v1/integrations/*`. These must stay reachable by the website and n8n. The integration key already protects bookings.

## 6. n8n: ServicePro WhatsApp Enquiry Assistant

The workflow export isn't in this repository, so I couldn't edit or validate your nodes directly. Below are the exact values to set. Export the workflow (*… → Download*) and share the JSON if you want me to patch it and produce an importable file.

`integrations/n8n/servicepro-api-check.workflow.json` is a small **importable check workflow**. Run it in n8n Cloud first: it calls the catalogue and serviceability endpoints through your tunnel, to prove n8n can reach the API before you touch the assistant.

### 6.1 Credential (once)

*Credentials → New → **Header Auth***:
- Name: `ServicePro n8n key`
- Header name: `X-ServicePro-Integration-Key`
- Value: the key printed by `new-integration-key.ps1`

Keep it only here, never in node parameters or the prompt.

### 6.2 ServicePro Settings node (fixes the "Invalid URL: <__PLACEHOLDER_VALUE__…" error)

This is an **Edit Fields (Set)** node. Replace both placeholder values with real origins: `https`, no trailing slash, not localhost.

| Field | Value | Why |
|---|---|---|
| `apiBaseUrl` | `https://<api.yourdomain.com>` | The tunnel hostname for port 5180 |
| `trackingBaseUrl` | `https://<www.yourdomain.com>` | The **website** origin. Tracking pages are `/t/{token}` on the website, not on the API. The booking response already includes the full `trackingUrl`, so the assistant should use that. |

Reference these values from tool nodes with `$('ServicePro Settings').first().json.apiBaseUrl`. Use `.first()`: tool sub-nodes don't have a paired item for `$json`. `$env` isn't available on n8n Cloud.

### 6.3 Tools (HTTP Request Tool nodes attached to *ServicePro Support Agent*)

For each tool, set **Options → Timeout** = `15000` ms. Turn **Options → Response → Never Error** on, so 4xx bodies (problem details) reach the agent instead of crashing the run.

**get_service_catalog**
- Description (for the AI): *Lists the appliances we repair, each with its id, visiting charge and problem types (with ids). Always call this before booking; use only ids returned here.*
- Method `GET`
- URL `={{ $('ServicePro Settings').first().json.apiBaseUrl }}/api/v1/catalog/categories`
- Authentication: none

**check_serviceability**
- Description: *Checks whether we serve a 6-digit Indian pincode. If isServiceable is false, do not book; apologise and offer escalation.*
- Method `GET`
- URL `={{ $('ServicePro Settings').first().json.apiBaseUrl }}/api/v1/catalog/serviceability/{{ $fromAI('pincode', 'the customer\'s 6-digit pincode, digits only', 'string') }}`
- Authentication: none

**create_booking**
- Description: *Creates a repair request ONLY after the customer has replied yes to a full summary (appliance, problem, name, address, pincode, preferred day and time window). Returns srNumber, status text and trackingUrl. The time is a preference, not a confirmed appointment.*
- Method `POST`
- URL `={{ $('ServicePro Settings').first().json.apiBaseUrl }}/api/v1/integrations/bookings`
- Authentication: *Generic Credential Type → Header Auth →* `ServicePro n8n key`
- Send Body: JSON, **Specify Body: Using JSON**:
  ```
  ={{ JSON.stringify({
    idempotencyKey: $('WhatsApp Trigger').first().json.messages[0].id,
    customerConfirmed: $fromAI('customerConfirmed', 'true only if the customer just replied yes to the complete booking summary', 'boolean'),
    categoryId: $fromAI('categoryId', 'category id from get_service_catalog', 'string'),
    issueTypeId: $fromAI('issueTypeId', 'issue type id from get_service_catalog, or an empty string if none fits', 'string') || null,
    problemDescription: $fromAI('problemDescription', 'the problem in the customer\'s words, max 1000 characters', 'string'),
    fullName: $fromAI('fullName', 'customer full name', 'string'),
    phone: $('WhatsApp Trigger').first().json.messages[0].from,
    address: {
      label: 'Home',
      line1: $fromAI('addressLine1', 'house or flat number and street', 'string'),
      line2: null,
      landmark: $fromAI('landmark', 'landmark, or an empty string', 'string') || null,
      locality: $fromAI('locality', 'area or locality', 'string'),
      city: $fromAI('city', 'city', 'string'),
      state: null,
      pincode: $fromAI('pincode', 'serviceable 6-digit pincode', 'string'),
      latitude: null,
      longitude: null
    },
    preferredSlotStart: $fromAI('preferredSlotStart', 'start of the preferred window, ISO 8601 with +05:30, e.g. 2026-10-14T15:00:00+05:30, within the next 30 days', 'string'),
    preferredSlotEnd: $fromAI('preferredSlotEnd', 'end of the preferred window, same format, at most 8 hours after the start', 'string')
  }) }}
  ```
  - **Phone and idempotency key come from the trigger, not the AI.** Check the field paths against your WhatsApp Trigger's output (open an execution). The usual shape is `messages[0].from` and `messages[0].id`.
  - If your n8n version doesn't evaluate `$fromAI` inside `JSON.stringify`, switch to *Using Fields Below* and send `address` as a JSON string field.

**escalate_to_human**
- I couldn't inspect how this is implemented, because the workflow isn't in the repo.
- Point it at a real destination you control, for example a *WhatsApp → Send Message* to the office number, or an email or Slack node, using credentials you add yourself.
- Send only: customer first name, phone, appliance, a one-line problem summary, pincode, and the reason for escalation. No full addresses, codes or conversation dumps.
- To avoid repeat alerts, have the agent escalate at most once per conversation. Simplest: include the WhatsApp `messages[0].id` in the alert, and skip it if *Log Processed Message* already recorded an escalation for that id.

### 6.4 Rules for the agent's system prompt

Add these to *ServicePro Support Agent*:

```
- Use only ids from get_service_catalog. Never invent category or issue type ids.
- Check the pincode with check_serviceability before collecting more details. If isServiceable is false, say we don't cover that area yet and offer escalate_to_human; do not book.
- Before booking, send one summary: appliance, problem, name, address with pincode, preferred day and time window. Ask "Shall I book this? Reply YES to confirm."
- Call create_booking only when the customer's latest message is a clear yes to that summary. If they change anything, update and re-confirm.
- After booking, reply with the srNumber, the statusText and the trackingUrl exactly as returned. Say the visit time is a preference our team will confirm on WhatsApp. Never say the appointment is confirmed unless appointmentConfirmed is true.
- If create_booking returns duplicate=true, say the request was already received and give the same details. Do not book again.
- On an error (400/401/429/5xx or timeout): do not retry more than once, apologise, and use escalate_to_human. Never show raw error text, tokens or ids to the customer.
- Never ask for or repeat OTPs, passwords or payment details.
```

## 7. Verify before going live

With your real hostnames, from any machine:

```powershell
$env:SERVICEPRO_API_URL  = 'https://<api.yourdomain.com>'
$env:SERVICEPRO_SITE_URL = 'https://<www.yourdomain.com>'
$env:SERVICEPRO_N8N_KEY  = '<the n8n key>'
node apps\api\scripts\verify-public-api.mjs
```

- **Expect 31/31.** It creates two test bookings (status NEW); cancel them in the admin app.
- **Then in n8n Cloud:**
  1. Run the imported *ServicePro API check* workflow.
  2. Send a test WhatsApp conversation: unserviceable pincode, a correction before "yes", then "yes".
  3. Confirm one booking appears in admin under *To review*, and the tracking link opens.

## 8. Known limitations

- **No live slot availability:** customers choose a preferred window and the office confirms. Adding real availability would need a scheduling model (technician calendars); not in scope.
- **Website server:** `serve-dist.mjs` is a small static server with an `/api` proxy, fine for one machine behind the tunnel. For more traffic, host the built site on Cloudflare Pages (its `_redirects` and `_headers` files are included) and route `/api/*` to the tunnel.
- **Idempotency scope:** keys are unique per channel and are kept permanently on the job. Reusing a key for a *different* booking returns the original booking (by design: never create on doubt).
