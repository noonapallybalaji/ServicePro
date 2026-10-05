# 0009 — External providers behind interfaces with development fallbacks

**Context.** PLAN.md §2.4: WhatsApp, SMS, maps, storage and payments must sit behind interfaces. Accounts with these vendors (WhatsApp Business verification, DLT registration) take weeks. Development and tests can't wait for them.

**Decision.**

| Port | Phase 1 implementations | Selected by |
|---|---|---|
| `INotificationChannel` (WhatsApp) | `MetaWhatsAppChannel` (Cloud API, template messages) · `LoggingChannel` | `Notifications:WhatsApp:AccessToken` present |
| `INotificationChannel` (SMS) | `LoggingChannel` *(vendor to be chosen after DLT registration)* | — |
| `IFileStorage` | `LocalFileStorage` (disk, `.storage/`) | `Storage:Provider` |
| `IGeocoder` | `NullGeocoder` *(Google Geocoding adapter when a key exists)* | — |

- The logging channel writes the full rendered message to the log **and** records it in `comms.notifications` with status `SENT`. Every flow can be tested end to end without a vendor.
- `MetaWhatsAppChannel` is covered by unit tests of the request it builds. It hasn't been tested against a live Meta account.

**Consequences.** Going live with a provider is a configuration change plus approval of the message templates. No code changes outside the adapter.
