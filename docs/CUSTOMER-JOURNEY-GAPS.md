# Customer journey: what exists and what's missing

A gap analysis of the customer portal (`apps/web-public`) and the APIs behind it, from first visit to job completion and support. It checks the product against what customers expect from on-demand apps like Uber, Swiggy, Zomato and Ola. The closest model for home repairs is Urban Company. Based on the code as of 14 Oct 2026 (branch `feat/phase-0-1`).

**Legend:**
- ✅ built
- 🟡 partly built: exists for staff or in the data model, but not usable by the customer
- ❌ missing
- 🔌 built; works as soon as the business adds its provider account details (nothing else to code)

**Priority:**
- **P0:** needed before taking real customers' money at scale
- **P1:** expected by customers of on-demand apps
- **P2:** growth and polish

**Effort** (rough): S ≈ days, M ≈ 1–2 weeks, L ≈ 3+ weeks.

---

## 1. Discover and choose a service

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 1.1 | Landing page, service pages, FAQ, SEO | ✅ | Pre-rendered, sitemap, structured data | — | — |
| 1.2 | Clear price per problem before booking | 🟡 | Only the visiting charge is public. The price list exists, but it's **staff-only** (`/catalog/price-list` needs sign-in). Customers can't see "Gas refill from ₹1,500". | P1 | S |
| 1.3 | Customer reviews and ratings shown on pages | ❌ | No review collection exists yet (see 9.1), so there's nothing to show. | P1 | S (after 9.1) |
| 1.4 | Search ("fridge not cooling") | ❌ | Only browsing by appliance. | P2 | S |
| 1.5 | Offers, coupons, first-booking discount | ❌ | No coupon model, pricing rules or redemption. | P2 | M |
| 1.6 | City or area selector, "available in your area" banner | 🟡 | Pincode check at booking only; single city in config. | P2 | S |
| 1.7 | Telugu and Hindi interface | 🟡 | Fonts and line-height support exist, but there are no translations and no language switch. | P1 | M |
| 1.8 | Installable app (PWA) or Android/iOS apps | ❌ | The customer site isn't a PWA (the technician app is). No push notifications without it. | P1 | M (PWA) / L (native) |

## 2. Registration and sign-in

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 2.1 | Sign in with phone and one-time code | ✅ | At booking (automatic) and on "My bookings". Customer sessions are separate from staff. | — | — |
| 2.2 | **Codes actually delivered by SMS or WhatsApp** | 🔌 | Codes go by SMS (MSG91) or WhatsApp (authentication template with a copy-code button), whichever is live, preferred channel first (`Notifications__OtpChannel`). If no live channel takes the code, the customer sees "We couldn't send the code" instead of waiting for nothing. Needs MSG91 + DLT templates and/or Meta credentials. | **P0** | S–M |
| 2.3 | Terms of Service and Privacy Policy acceptance | ✅ | Booking and sign-in say "By confirming, you agree to our terms and privacy policy"; the API refuses without `acceptedPolicies` and records consent per customer with the policy version (`Legal__PolicyVersion`) and channel. WhatsApp bookings via n8n don't record consent yet. | **P0** | S |
| 2.4 | Delete account and download my data (DPDP Act 2023) | ✅ | Profile → "Download my data" (JSON) and "Delete my account" (also staff: `POST /admin/customers/{id}/erase`, admin only). Blocked while a job is open. Erases name, phones, email, notes, street address, pin, serial numbers, sessions, pending codes, the customer's audit history and the text and number of every message sent to them; keeps invoices and the anonymous job record. No automatic retention purge yet (see 14.x). | **P0** | M |
| 2.5 | Marketing and WhatsApp opt-in, opt-out | ❌ | Needed for promotional WhatsApp templates and DPDP consent. | P1 | S |
| 2.6 | Captcha or bot protection on code requests | 🟡 | Rate limits per IP and per-number cooldown exist; no Turnstile/captcha (SMS-pumping fraud risk once SMS is real). | P1 | S |
| 2.7 | Social sign-in (Google) | ❌ | Optional for this market; phone is the identity. | P2 | S |

## 3. Booking

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 3.1 | 5-step booking: appliance, problem, address, time, details | ✅ | With pincode check, saved address, optional device pin, signed-in fast path. | — | — |
| 3.2 | **Real slot availability** (only show times we can serve) | ❌ | Customers pick any morning/afternoon/evening in 7 days. No capacity, technician calendars or slot holds, so we can promise slots we can't meet. | **P0** | L |
| 3.3 | Instant or urgent booking ("as soon as possible") | ❌ | Priority exists for staff (HIGH/EMERGENCY) but the customer can't request it; no surge or urgent fee. | P1 | M |
| 3.4 | Photos or video of the problem at booking | 🟡 | Attachments exist for staff and technicians (`PHOTO_ISSUE` kind) but the booking form has no upload. | P1 | S |
| 3.5 | Appliance details: brand, model, age, under warranty? | 🟡 | The customer appliance model exists (staff side). The booking doesn't ask, so technicians arrive without parts info. | P1 | S |
| 3.6 | Book for someone else (contact person at the address) | ❌ | Booking phone = visit contact. Common case: children booking for parents. | P1 | S |
| 3.7 | Access notes (gate code, floor, "call on arrival") | ❌ | Only "landmark". | P1 | S |
| 3.8 | Multiple appliances or services in one booking (cart) | ❌ | One appliance per request. | P2 | M |
| 3.9 | Map pin picker with drag to adjust | ❌ | Device GPS pin only (optional). Needs a maps provider (Google Maps API key). | P2 | M |
| 3.10 | Price summary and taxes before confirming | 🟡 | Visiting charge shown; no GST breakdown, convenience fee or coupon line. | P1 | S |

## 4. Confirmation and assignment

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 4.1 | Booking received screen and tracking link | ✅ | | — | — |
| 4.2 | **Automatic confirmation and technician assignment** | 🟡 | Online and WhatsApp bookings wait in NEW for **manual** staff review; dispatch is "suggest" mode. Customers expect "Technician assigned" within minutes. The matching engine and offers exist; AUTO_OFFER is planned (PLAN Phase 3). | **P0** | M |
| 4.3 | **Customer notified at each step** (confirmed, assigned, on the way, done) | 🔌 | Self-booked requests get "received" and then a separate "confirmed" message when staff confirm (the old "is confirmed" wording at booking was wrong). Staff-created jobs get one "confirmed" message. Sends once 11.1 or 11.2 is live. | **P0** | S (after 11.1) |
| 4.4 | Technician profile: photo, rating, jobs done, verified badge | 🟡 | Tracking shows name, rating and job count when available. No photo upload; "verified" needs a real ID-check process first. | P1 | S |
| 4.5 | Promised arrival time (ETA) | ❌ | Only the preferred window. | P1 | M |

## 5. Manage my booking (self-service)

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 5.1 | List of my bookings with status | ✅ | With filters. | — | — |
| 5.2 | **Cancel a booking** (with a clear cancellation policy and fee rules) | ✅ | "Cancel booking" in My bookings until the technician sets out (signed in; a forwarded tracking link can't cancel). Offer/assignment released, technician told (`TECH_JOB_CANCELLED`). Settings: `booking.customer_can_cancel`, `booking.customer_change_cutoff_minutes`. No cancellation fee: nothing is paid upfront to charge it against (would need 8.5). | **P0** | M |
| 5.3 | **Reschedule** | ✅ | "Change time" in My bookings (same day/time picker as booking). Before a technician accepts, only the time changes; after, the job goes to RESCHEDULED for the office to reconfirm, and the technician is told (`TECH_JOB_MOVED`). Customer gets `BOOKING_MOVED`. Limit `booking.customer_max_reschedules` (default 2). | **P0** | M |
| 5.4 | Booking detail page inside the account (not just the public tracking link) | 🟡 | Cards link to `/t/{token}`; no account-scoped detail page, notes or history. | P1 | S |
| 5.5 | Edit problem details, add notes or photos after booking | ❌ | | P1 | S |
| 5.6 | Call or message the technician with **masked numbers** | 🟡 | Tracking exposes the technician's real phone (`TrackingTechnician.Phone`). Needs call masking (Exotel/Knowlarity) or in-app chat. | P1 | M |
| 5.7 | Book again or repeat with one tap | ❌ | | P2 | S |

## 6. Live tracking (the "Uber" part)

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 6.1 | Status timeline (6 milestones) | ✅ | Polls every 30 s. | — | — |
| 6.2 | **Technician's live location on a map, with ETA** | ❌ | The technician app sends location only with status changes (`TransitionRequest.latitude/longitude`). No continuous GPS stream, map or ETA. | P1 | L |
| 6.3 | Real-time updates (no refresh) | 🟡 | SignalR hubs exist for staff and technicians; customers poll. | P1 | S |
| 6.4 | Push notifications (web push or app) | ❌ | | P1 | M |
| 6.5 | Arrival verification (start code or OTP at the door) | 🟡 | Completion code exists (sent on arrival, checked at completion). No start-of-job check. | P2 | S |

## 7. During the service

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 7.1 | **Digital estimate the customer approves before work** | ✅ | Technician app: "Send estimate" (bill builder, price list) while diagnosing or mid-repair; revisions supersede. Customer gets `ESTIMATE_SENT` and approves on the tracking page with a code to the booking phone (`estimates.code_required_above`, default 0 = always), or declines (job goes to UNABLE_TO_REPAIR, visit charge only). Staff can record a phone approval with a note (logged; technicians can't). The bill starts from the approved estimate. `estimates.required_before_repair` (default off) makes it mandatory. | **P0** | M |
| 7.2 | Spare parts with prices from the price list, shown to the customer | 🟡 | Technician bill builder exists (staff side); customer sees lines only on the bill. | P1 | S |
| 7.3 | Before and after photos | ✅ | Shown on tracking. | — | — |
| 7.4 | Completion code shared with the technician | ✅ | | — | — |

## 8. Payment

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 8.1 | Bill and invoice PDF | ✅ | Downloadable from tracking. | — | — |
| 8.2 | **Pay online** (UPI intent, UPI QR, cards, net banking) | 🔌 | Razorpay Payment Links. Recorded only on the gateway's word: signed webhook (`payment_link.paid`) or our own status check when the customer returns; idempotent per gateway payment id. Paying twice queues the extra for refund. Open links are cancelled when the bill is settled another way. Needs `Payments__Razorpay__*` keys and the webhook. | **P0** | M |
| 8.3 | Pay from the tracking page or WhatsApp link | 🔌 | "Pay ₹X online" on the tracking page once the job is complete; staff (admin job page) and technicians (payment sheet) can send the link on WhatsApp (`PAYMENT_LINK`); receipt message `PAYMENT_RECEIVED`. | **P0** | S |
| 8.4 | **Refunds** (cancellation, overpayment, failed repair) | ✅ | Admin job page: refund any payment (owner/admin only), never more than was paid. Online payments refund through Razorpay (status via `refund.processed`/`refund.failed` webhooks); cash/UPI refunds are recorded by staff. Customer gets `REFUND_PROCESSED`. Refund policy page exists (13.1). | **P0** | M |
| 8.5 | Advance or prepaid booking (visiting charge upfront) | ❌ | Reduces no-shows; optional. | P2 | S |
| 8.6 | Wallet, credits, saved cards | ❌ | | P2 | M |
| 8.7 | GST-compliant invoices (GSTIN, HSN/SAC codes, tax split) | 🟡 | GST rate is in settings; check invoice format with an accountant before launch. | P1 | S |

## 9. After the service

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 9.1 | **Rate and review the technician and service** | 🟡 | `Technician.RatingAverage/RatingCount` exist but **nothing writes them**: no feedback request, screen or endpoint. | **P0** | S |
| 9.2 | Complaint or "problem came back" request (re-visit under warranty) | 🟡 | Warranty visits exist for staff (`IsWarrantyVisit`, parent job); customer can't raise one. | P1 | M |
| 9.3 | Warranty card per repair (period, what's covered) | ❌ | No warranty terms stored per job. | P1 | S |
| 9.4 | Invoices list in the account | ❌ | Only per booking via tracking. | P1 | S |
| 9.5 | Service reminders and annual maintenance contracts (AMC) | ❌ | PLAN Phase 3 mentions AC pre-summer reminders. | P2 | L |
| 9.6 | Referral programme | ❌ | Deliberately not shown until rules exist (reward, eligibility, fraud limits). | P2 | M |

## 10. Customer support and chat

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 10.1 | Call and WhatsApp buttons | ✅ | Static links to the business number. | — | — |
| 10.2 | **In-app chat with support** (per booking, with history) | ❌ | No conversations model, chat UI or staff inbox. | **P0** | L |
| 10.3 | Chat with the technician (masked) | ❌ | See 5.6. | P1 | M |
| 10.4 | WhatsApp AI assistant (n8n) | 🟡 | Booking API ready and tested; workflow setup and escalation pending (docs/DEPLOY-CLOUDFLARE-N8N.md). | P1 | S |
| 10.5 | Help centre: issue categories ("payment", "late technician", "damage") with self-help | ❌ | Only a general FAQ page. | P1 | M |
| 10.6 | Tickets with status, SLA and escalation; staff support console | ❌ | Admin has no support queue. | **P0** | L |
| 10.7 | Damage or safety incident reporting | ❌ | Important for in-home services (and insurance). | P1 | S |

## 11. Notifications

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 11.1 | **WhatsApp messages actually delivered** | 🔌 | Cloud API channel is built. Add `Notifications__WhatsApp__*` and each approved template name in Admin → Settings → Messages, which also shows whether each channel is live. Delivery/read receipts are not tracked: Meta allows one webhook per app and n8n already uses it. | **P0** | S (+ Meta approval time) |
| 11.2 | **SMS delivery** (DLT registration in India) | 🔌 | MSG91 flow API channel is built. Add `Notifications__Sms__Provider=Msg91`, `Notifications__Sms__AuthKey`, and each template's MSG91 flow ID in Admin → Settings → Messages. | **P0** | S (+ DLT approval) |
| 11.3 | Email (receipts, invoices) | ❌ | | P2 | S |
| 11.4 | Web or app push | ❌ | See 1.8, 6.4. | P1 | M |
| 11.5 | Notification preferences | ❌ | See 2.5. | P2 | S |

## 12. Account

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 12.1 | Profile (name, email), saved addresses, add address | ✅ | | — | — |
| 12.2 | Edit, delete, set default address | ❌ | Add only; backend has update (staff) but no customer endpoint for edit/delete. | P1 | S |
| 12.3 | My appliances (brand, model, purchase date, warranty) | 🟡 | Model exists (staff side). | P2 | S |
| 12.4 | Language preference | 🟡 | `PreferredLanguage` stored; no UI or translations. | P1 | S (after 1.7) |
| 12.5 | Saved payment methods | ❌ | After 8.2. | P2 | M |

## 13. Trust, safety and legal

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 13.1 | **Terms, Privacy, Cancellation and Refund policy pages** | 🔌 | `/terms`, `/privacy`, `/cancellation-and-refunds`, linked in the footer. Wording describes what the system actually does. Until the business sets `VITE_LEGAL_ENTITY_NAME`, `VITE_GRIEVANCE_OFFICER_NAME`/`_EMAIL`, `VITE_POLICY_EFFECTIVE_DATE` and `VITE_REFUND_WORKING_DAYS`, each page shows a "Draft" notice and is noindex. **Needs a lawyer's review before launch.** | **P0** | S (pages) |
| 13.2 | Technician verification (ID, police verification) shown to customers | ❌ | Show a "verified" badge only once the process exists (UX rule in the repo). | P1 | M (process) |
| 13.3 | Phone number masking | ❌ | See 5.6. | P1 | M |
| 13.4 | Fraud and abuse (fake bookings, SMS pumping, payment fraud) | 🟡 | Rate limits, staff review of new bookings, blocked customers; no captcha, no velocity rules per number. | P1 | S |

## 14. Platform behind the customer experience

| | Capability | Status | Notes | Priority | Effort |
|---|---|---|---|---|---|
| 14.1 | Hosting and HTTPS | 🟡 | Cloudflare Tunnel path built and tested with quick tunnels; your named tunnel isn't set up yet. A single machine is a single point of failure: plan a server or cloud host plus database backups. | **P0** | M |
| 14.2 | Database backups and restore drill | ❌ | | **P0** | S |
| 14.3 | Monitoring and alerts (uptime, errors, failed messages) | 🟡 | Health endpoints and Serilog exist; no alerting. | P1 | S |
| 14.4 | Analytics funnel (visit → book → completed → paid → reviewed) | ❌ | Needed to measure conversion; respect consent. | P1 | S |
| 14.5 | Customer support console for staff | ❌ | See 10.6. | **P0** | L |

---

## Suggested order of work

**Phase A: can take real bookings and money (P0)**
1. ~~Message delivery (11.1, 11.2). This also unlocks sign-in codes (2.2) and step notifications (4.3).~~ Built; waiting on provider accounts.
2. ~~Legal pages and consent (13.1, 2.3), and account deletion (2.4).~~ Built; pages need the business's legal details and a lawyer's review.
3. ~~Online payment, plus pay link on tracking and WhatsApp, plus refunds (8.2–8.4).~~ Built; needs Razorpay keys and webhook.
4. ~~Customer cancel and reschedule with policy (5.2, 5.3).~~ Built.
5. ~~Digital estimate approval (7.1).~~ Built.
6. Ratings and reviews (9.1).
7. Auto-confirmation and auto-assignment (4.2).
8. Support: chat and tickets, with the staff console (10.2, 10.6, 14.5).
9. Real slot availability (3.2).
10. Production hosting and backups (14.1, 14.2).

**Phase B: feels like an on-demand app (P1)**
- Live technician location and ETA (6.2, 4.5), real-time updates and push (6.3, 6.4, 1.8)
- Prices per problem (1.2), photos and appliance details at booking (3.4, 3.5), book for someone else and access notes (3.6, 3.7)
- Masked calling and technician chat (5.6, 10.3), help centre (10.5), damage reports (10.7)
- Booking detail in account and invoices list (5.4, 9.4), address edit and delete (12.2)
- Telugu and Hindi (1.7), warranty cards and re-visit requests (9.2, 9.3), reviews on pages (1.3)

**Phase C: growth (P2)**
- Coupons, referrals and wallet (1.5, 9.6, 8.6)
- AMC and reminders (9.5)
- Multi-service cart (3.8), map pin picker (3.9)
- Search (1.4), native apps

## Decisions needed from the business

These can't be invented in code:
- **Cancellation and refund rules:** free until when, fees, who refunds what.
- **Warranty period per repair type.**
- **Pricing:** fixed price per problem vs estimate on site; GST registration details.
- **Slot capacity:** working hours, jobs per technician per day, travel buffers.
- **Support hours** and response-time targets.
- **Referral or coupon rules**, if any.
- **Technician verification process.**
- **Providers to sign up with:**
  - WhatsApp Business (Meta);
  - SMS with DLT registration;
  - a payment gateway;
  - a maps API (Google);
  - call masking.
