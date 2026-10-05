# UX Architecture

> Status: **Draft for approval.** No product screens get built until this document and [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) are signed off.
> Source of truth for business behaviour: [PLAN.md](../PLAN.md). Where this document and PLAN.md disagree, §0 lists the conflict and the resolution proposed here.

Related: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) · [USER-FLOWS.md](USER-FLOWS.md) · [COMPONENT-ARCHITECTURE.md](COMPONENT-ARCHITECTURE.md) · [RESPONSIVE-STRATEGY.md](RESPONSIVE-STRATEGY.md)

---

## 0. Conflicts between the design brief and PLAN.md

Each item needs a decision. "Proposed" is what the design currently assumes.

| # | Design brief says | PLAN.md says | Proposed resolution | Needs PLAN change? |
|---|---|---|---|---|
| C1 | Customer has **History** and **Profile** | §3: "Customer: no account. Signed tracking link; OTP only for sensitive actions" | Keep accounts out. Add a **phone-OTP session** (no password) that unlocks *My services* (history), saved addresses and language. Tracking links keep working without signing in. | **Yes.** Add `LOGIN` to customer `otp_challenges.purpose`, plus a customer session token. |
| C2 | Customer **books** a service (picks a slot) | §4.1–4.2: the web form creates a **lead** and the AI call confirms the details and slot | The web flow is a **request**: appliance → problem → details → optional preferred time window. The screen promises a call ("We'll call you in about a minute") rather than a confirmed booking. Self-serve slot booking can come later; the slots API already exists for the voice agent. | No |
| C3 | Customer app offers **AI voice assistance** | The AI talks to customers **by phone** (outbound + inbound line). There is no voice agent in the browser | The customer UI shows **call status** (calling → understanding → confirmed / missed) and a **"Call us now"** `tel:` link. No in-browser voice or chatbot. | No |
| C4 | **Verified technicians** trust badge | No verification process or field exists | `TechnicianCard` shows a credential **only when real data supplies it**. If the owner does ID/background checks, add `technicians.id_verified_at`. Until then the card shows name, photo, specialty, rating and jobs completed. Those are real trust signals. | **Yes, if** checks are done |
| C5 | Technician flow: Assigned → En Route → Arrived → Diagnosing → In Progress → Completed | §8 also has `OFFERED/ACCEPTED`, `AWAITING_ESTIMATE_APPROVAL`, and requires **completion OTP + after-photo** | Follow PLAN. The single-button flow still holds: one primary action per status, with estimate approval and OTP as the only steps that need input. | No |
| C6 | Technician **Navigation** | No in-app routing. Location pings + Maps for distance/ETA | "Navigate" opens **Google Maps** via deep link. No in-app turn-by-turn. | No |
| C7 | Admin **AI Analytics** as a top-level area | §7.12 `mv_ai_quality` is one of the reports | **Reports → AI performance** tab. AI *thresholds* live in **Settings → AI**. Keeps the nav short; can be promoted later. | No |
| C8 | Admin **Payments** | Billing module: estimates, invoices, payments, technician cash ledger, spare parts | Nav item **Billing** with tabs *Payments · Invoices · Cash ledger*. **Parts** goes under Billing (inventory + part requests). | No |
| C9 | Not in brief | PLAN has **escalations / SLA**, **catalog**, **price list**, **service areas**, **templates** | Escalations appear as the Dashboard's *Needs attention* panel and as a Service Requests filter. Everything else goes under **Settings**. | No |
| C10 | "One React codebase, no separate mobile/desktop apps" | §13: one monorepo with **three role apps** (`web-public`, `admin`, `tech`) sharing `packages/ui` | Compatible. Apps are split **by role** (different users, auth and bundle budgets), never by device. Every app is responsive. No microfrontends. | No |
| C11 | Customer **Help** | Only `request_human_callback` + WhatsApp exist | Help = *Call us*, *WhatsApp us*, *Request a callback*. No FAQ content system. | No |
| C12 | **Payment** step | UPI payment links arrive in **Phase 3**. Phase 1 records cash/UPI manually | The payment UI degrades gracefully: Phase 1 shows the amount + "Pay the technician", Phase 3 adds a *Pay by UPI* button. | No |

---

## 1. Experience principles

1. **Always answer the four questions.** On every customer screen: *What is happening? Who is handling it? What will it cost? What happens next?* If a screen can't answer one of them, it says when it will.
2. **One primary action per screen region.** The thing we want the person to do is obvious and in the thumb zone.
3. **Ask less, infer more.** The AI call collects the details, so forms collect only what the call can't (name, phone, pincode, appliance).
4. **Human language, audience-specific.** The same status reads "En route" to staff and "On the way" to customers ([status.ts](../packages/ui/src/tokens/status.ts)).
5. **Progress, not process.** Customers see 6 milestones, not 17 statuses. Technicians see the next step, not the state machine.
6. **Exceptions are first-class.** Every flow designs the "something went wrong" path as carefully as the happy path.
7. **AI is a colleague, not a feature.** Customers meet the business. Staff see what the AI did and why, and can override it.
8. **Speed for technicians, overview for owners, reassurance for customers.** Each app is tuned for its user's job.

---

## 2. App map

| App (PLAN §13) | Users | Primary device | Auth | Design priority |
|---|---|---|---|---|
| `apps/web-public` | Customers, ad traffic | Phone (budget Android, 4G) | None → tracking token → optional phone OTP (C1) | Fast load, trust, conversion |
| `apps/tech` (PWA) | Technicians | Phone, outdoors, one hand | Phone OTP, long session | Speed, minimal taps, offline tolerance |
| `apps/admin` | Owner, dispatcher | Desktop, sometimes phone | Email + password (+TOTP) | Overview, triage, density |

---

## 3. Information architecture

### 3.1 Customer (`web-public`)

```text
Home (landing)                      /
├── Services                        /services
│   └── Service detail              /services/:category        (e.g. /services/ac)
├── Request service (flow)          /request/:category?        full-screen steps
│   ├── 1 Appliance                 (skipped when :category is given)
│   ├── 2 Problem
│   ├── 3 Your details              name · phone · pincode/address · consent
│   ├── 4 Review & submit
│   └── Call status                 calling → understanding → confirmed | missed
├── Track                           /t/:token                  ← tracking links land here (no login)
│   ├── Service details             (sheet / section)          appliance, problem, address, slot
│   ├── Technician                  (card)                     name, photo, rating, call/message
│   ├── Estimate                    /t/:token/estimate/:id     approve / decline (+OTP over threshold)
│   ├── Payment                     /t/:token/pay              Phase 3 UPI; Phase 1 "pay technician"
│   ├── Completion & photos         (section)                  before/after, invoice
│   └── Review                      /t/:token/review
├── My services  (OTP, C1)          /account/services          history, repeat booking, warranty visits
├── Profile      (OTP, C1)          /account                   name, addresses, language
└── Help                            /help                      call · WhatsApp · request callback
```

**Navigation:**
- *Landing/services (not signed in):* top bar with logo, **Call us**, and a **Request service** button. No bottom nav. Ad visitors get one job.
- *Tracking page:* no global nav. A back link to *My services* appears only with an OTP session. Help is always in the header.
- *Signed-in (OTP):* bottom nav with 3 items, **Home · My services · Help**. Profile sits behind the avatar in the header. With fewer than 4 destinations, a tab bar adds more weight than it gives.

### 3.2 Technician (`tech`)

```text
Today (home)                        /                    duty switch · next job hero · today's list
├── Offers                          /offers              pending offers with countdown (badge count)
├── Job                             /jobs/:id            the work surface — see below
│   ├── Overview                    customer, address, problem, AI summary, history of this appliance
│   ├── Navigate                    → Google Maps deep link (C6)
│   ├── Diagnosis                   notes, issue confirmation, photos (before)
│   ├── Estimate builder            full-screen flow: lines → review → send
│   ├── Parts request               sheet: part / description → qty → submit
│   ├── Completion                  after-photos → customer OTP → payment
│   └── Problem / exception         sheet: not available, need part, unable to repair, reschedule
├── Schedule                        /schedule            upcoming days
├── Earnings                        /earnings            commission, cash collected, cash to deposit (ledger)
└── Profile                         /profile             duty hours, skills (read-only), language, sign out
```

**Navigation:** bottom nav, **Today · Offers · Schedule · Earnings**, with Profile in the header avatar. A job opens as a **full-screen page** with a sticky **JobActionBar** (one primary button + a "Problem" secondary). An incoming offer shows as a **full-width banner + sheet** on any screen.

### 3.3 Owner / admin (`admin`)

```text
Dashboard                 /                       KPIs · live board · needs attention · technician map
Leads                     /leads                  all leads, source/campaign, call attempts
Verification              /verification           AI review queue (badge count) — split view
Service requests          /requests               table ⇄ board · filters · saved views
  └── SR detail           /requests/:id           drawer from list, full page on direct link
Dispatch                  /dispatch               unassigned queue + map + ranked candidates
Technicians               /technicians            list · live status · profile/skills/areas/shifts
Customers                 /customers              search by phone · history · appliances
Billing                   /billing                Payments · Invoices · Cash ledger · Parts   (C8)
Reports                   /reports                Operations · Campaign ROI · Technicians · AI performance (C7)
Settings                  /settings               Business · Catalog & prices · Service areas · SLA rules ·
                                                  Message templates · AI thresholds · Users & roles
```

**Navigation:**
- **≥ lg:** persistent left sidebar in three groups. *Operate* (Dashboard, Verification, Requests, Dispatch), *Manage* (Leads, Technicians, Customers, Billing), *Analyse* (Reports), with Settings pinned at the bottom. A global search (phone / SR number / name) sits in the header with ⌘K.
- **md:** the sidebar collapses to an icon rail with tooltips.
- **< md:** bottom nav **Dashboard · Verification · Requests · More**. *More* opens a sheet with the remaining items. The owner on a phone mostly checks the board and clears exceptions.
- Badge counts: Verification (open tasks), Requests (escalations).

---

## 4. Screen-level composition rules

| Element | Customer | Technician | Admin |
|---|---|---|---|
| Header | Logo + Help/Call | Title + duty dot + avatar | Search + notifications + user |
| Primary action | Sticky bottom bar (mobile), inline (desktop) | **JobActionBar** always sticky | Top-right of page/drawer |
| Detail views | Sections on one page | Full-screen page | Drawer over the list (keeps context) |
| Lists | Cards | Cards | Tables (≥ md), cards (< md) |
| Density | Comfortable | Comfortable, large targets | Compact on pointer-fine |
| Language | Customer labels, `te/hi/en` | Technician labels, `te/hi/en` | Staff labels, `en` (+ `te`) |

---

## 5. Cross-cutting UX states

Every data view implements all five. The component for each is in brackets.

| State | Rule |
|---|---|
| **Loading** | Skeleton matching the final layout `[Skeleton]`. Spinner only for short unknown-shape waits `[LoadingState]`. Never a blank screen. |
| **Empty** | Explain why and what happens next ("New offers appear here automatically") `[EmptyState]`. |
| **Error** | Plain words, reassure about data, one way forward `[ErrorState]`, `[Alert]`. No raw codes. |
| **Offline** (tech) | Status updates queue locally and show a "Will sync" chip. Writes are never silently lost. |
| **Success** | Confirm in place (status badge changes + `rise-in`), plus a toast for actions taken elsewhere. Big moments (job completed, request confirmed) get the `pop-in` check. |

---

## 6. AI UX

The AI should feel useful, not like a gimmick. Concretely:

### 6.1 Rules
1. **Customers never see "AI"**: no sparkles, robots, chat bubbles or "AI is thinking". The assistant speaks as the business, in brand colour.
2. **Staff always see provenance.** Anything AI-generated carries the violet `AI` badge (`AiBadge`, `AiSummary`), so staff know what to double-check.
3. **Confidence is staff-only**, shown as score + band + **breakdown** (`ConfidenceMeter`). The breakdown matters more than the number because it tells the reviewer what to check.
4. **AI suggests, people decide.** Every AI decision shown to staff has an override within one click (approve/edit/reject, reassign).
5. **Verbs, not magic.** "Understanding your service request…", "Matching you with a technician", "Checking in with Ravi". Each phrase describes what's being done for the person.

### 6.2 Patterns

| Moment | Customer sees | Staff sees |
|---|---|---|
| **AI calling customer** | `IntakeCallStatus: calling`: voice-wave, "Calling you now", masked caller number, ~2 min estimate | Lead row: `Calling` badge with attempt *n/3* and a live call-duration timer |
| **Processing the conversation** | `understanding`: calm pulsing dots, "Understanding your service request…" | Lead: "Analysing call" skeleton in the summary slot |
| **Qualification result** | `confirmed`: pop-in check + SR number + appliance + slot. No score | `ConfidenceMeter` + decision band + flags |
| **Human verification** | Nothing changes. Still "We're confirming your request" (with SLA, e.g. within 15 min) | Verification split view: audio player + transcript (left), **editable extracted fields** pre-filled (right). Low-confidence fields highlighted in warning. Primary action: **Approve & create SR** |
| **AI-generated summary** | Plain summary in the SR details ("AC not cooling for 2 days"), no AI label. It reads as our note | `AiSummary` panel with call length, language and prompt version |
| **AI escalation** | If the customer is waiting: "A team member will call you shortly" | `Alert` in Needs-attention: reason + the AI's attempted action + "Take over" |
| **AI follow-up** (technician check-in) | Status updates normally | Activity entry: "AI checked in with Ravi → reply 'customer asked to come tomorrow 11' → **Rescheduled**". Undo available for 10 min |
| **Missed call** | `missed`: "We couldn't reach you" + next retry time + **Call us now** / **Call me again** | Lead: `Unreachable` with retry schedule |

### 6.3 Voice-call state visuals
- **Voice wave** (4 bars) = *a phone call is happening*. Reserved for real calls only.
- **Processing dots** = *we're working on it*. Never a spinner, which reads as "stuck".
- Both stop under `prefers-reduced-motion`, and the state is still announced via `role="status"`.

---

## 7. Trust & conversion

| Trust element | Where | How (component) | Backed by (PLAN) |
|---|---|---|---|
| **Transparent visiting charge** | Service cards, request review, tracking | "Visit from ₹349" on every `ServiceCard`. Review step restates it | `price_list`, `base_visit_charge` |
| **Named technician** | Tracking | `TechnicianCard`: photo, name, specialty, rating, jobs done | `technicians`, `reviews` |
| **Verified badge** | Tracking | Only with real verification data (C4) | *pending decision* |
| **ETA** | Tracking (en route) | Large tabular `stat-sm` "25 min" + timeline | Maps ETA |
| **Live status** | Tracking | `StatusTimeline` (6 milestones) + status LED | `service_status_history` |
| **Estimate approval** | Tracking → Estimate | Itemised lines, total, "Nothing is charged until you approve", Approve / Decline | `estimates`, `estimate_lines` |
| **Completion confirmation** | Arrival → completion | "Share code **4821** only after the work is done" | completion OTP |
| **Before/after photos** | Completion section | Photo pair with timestamps | `sr_attachments` |
| **Secure payment** | Payment | UPI via Razorpay; amount = approved estimate; receipt on WhatsApp | `payments`, `invoices` |
| **Reviews** | Technician card, post-job | Rating + count; request after completion | `reviews` |
| **Support** | Header of every customer screen | Call · WhatsApp · Request callback | `request_human_callback` |

**Conversion rules for the landing → request flow:**
- Show the first meaningful screen in < 2 s on 4G (PLAN §6.1). The landing app ships no admin code.
- Above the fold: what we fix, the price from, one **Request service** button, and a **Call us** alternative.
- No account and no OTP before submitting a request. The AI call verifies the number (PLAN §9.3).
- The progress indicator always shows "Step *n* of 4". Back never loses entered data.
- After submit, the person always knows *when* we'll call and *from which number*.
