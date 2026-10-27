# Customer notifications

How a customer hears about every step of their repair, and how to switch on real WhatsApp and SMS.

## Channels and the fan-out

Every customer journey event goes through one place (`CustomerMessageContext`) and fans out:

| Order | Channel | When | Notes |
|---|---|---|---|
| 1 | **In-app** (the site's notification bell) | Always | Stored first, independent of WhatsApp/SMS. Read state is server-side (per item, synced across devices). Device notifications show it when the customer allowed them and the site is open. |
| 2 | **WhatsApp** | Always | Primary phone channel. Needs an approved Meta template per message (`ProviderTemplateName`). |
| 3 | **SMS** | Only if WhatsApp **failed** and the message has an active SMS template | Fallback for the critical steps. Each SMS needs a DLT-registered template (MSG91 flow id). |

Sign-in, booking, estimate and change-number **codes** never go in-app. They go to WhatsApp or SMS, preferred channel
first (`Notifications:OtpChannel`) and then the other live one.

Events are delivered from the outbox **strictly in order** (`outbox_messages.sequence`), so messages arrive in journey order.

## The customer journey

| Step | Template | Bell title | SMS fallback |
|---|---|---|---|
| Booking received (awaiting review) | `SR_CREATED` | Booking received | — |
| Booking confirmed | `SR_CONFIRMED` | Booking confirmed | ✓ |
| Office sets or changes the visit time | `VISIT_SCHEDULED` | Visit scheduled | ✓ |
| Technician accepted | `TECH_ASSIGNED` | Technician assigned | — |
| Technician on the way | `TECH_EN_ROUTE` | Technician on the way | ✓ |
| Technician arrived (completion code) | `COMPLETION_CODE` | Your completion code | ✓ |
| Estimate to approve | `ESTIMATE_SENT` | Estimate to approve | — |
| Waiting for parts / rescheduled / missed visit | `WAITING_FOR_PARTS` / `RESCHEDULED` / `CUSTOMER_MISSED` | … | — |
| Couldn't be repaired | `UNABLE_TO_REPAIR` | Couldn't be repaired | — |
| Repair completed | `JOB_COMPLETED` | Repair completed | — |
| Bill / payment link | `PAYMENT_LINK` | Your bill is ready | — |
| Payment received (any method, including cash) | `PAYMENT_RECEIVED` | Payment received | — |
| Refund | `REFUND_PROCESSED` | Refund processed | — |
| Feedback request (after closing) | `FEEDBACK_REQUEST` | How was your visit? | — |
| Cancelled | `SR_CANCELLED` | Booking cancelled | — |
| Reply from support | `SUPPORT_REPLY` | Reply from our team | — |

Wording is editable in Admin → Notifications → Templates. Turning an SMS template off removes that step's SMS fallback.

## Switching on real delivery

Without provider settings both phone channels only **log** messages (the API log shows `[WhatsApp → …]`), and the
site shows sign-in codes on screen. The bell works either way.

**WhatsApp (Meta Cloud API)**: on the API set `Notifications__WhatsApp__PhoneNumberId` and `Notifications__WhatsApp__AccessToken`.
Create each template in Meta Business Manager, get it approved, and enter its name as the template's `ProviderTemplateName`.

**SMS (MSG91)**: on the API set `Notifications__Sms__Provider` = `Msg91` and `Notifications__Sms__AuthKey`. Register each
SMS template on DLT and enter its MSG91 flow id as `ProviderTemplateName`. SMS templates in use: the codes (`OTP_*`) and
the four fallbacks above. `Notifications__OtpChannel` (`Sms` or `WhatsApp`) picks where codes go first.

Then remove `Auth__TestMode` and `Auth__ExposeOtpInResponse` from the API (see `render.yaml`), so codes stop showing on screen.

## Tests

`CustomerJourneyNotificationsTests` walks the journey and checks the bell, WhatsApp, the SMS fallback when WhatsApp
fails, the "couldn't be repaired" message, and that codes never reach the bell. `JobLifecycleTests` checks the full
sequence through payment.
