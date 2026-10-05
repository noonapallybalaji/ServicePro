# Component Architecture

> Status: **Foundation implemented, product components specified.** ✅ = built in `packages/ui` and shown at `/design-system`. ◻ = specified here, built when its first screen is built.

---

## 1. Layers & ownership

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ apps/<role>/src/features/*      SCREENS + role-specific components             │
│   e.g. tech/features/job/JobActionBar, admin/features/board/LiveJobBoard      │
├──────────────────────────────────────────────────────────────────────────────┤
│ packages/ui/src/domain          SHARED DOMAIN components (used by ≥ 2 apps)    │
│   StatusBadge, StatusTimeline, ServiceCard, TechnicianCard, AI patterns       │
├──────────────────────────────────────────────────────────────────────────────┤
│ packages/ui/src/components      FOUNDATION (business-agnostic)                 │
│   Button, Input, Field, Dialog, Card, Badge, Tabs, Toast, feedback states     │
├──────────────────────────────────────────────────────────────────────────────┤
│ packages/ui/src/layout          LAYOUT primitives: Stack, Inline, Container,   │
│                                 StickyActionBar, SkipLink                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ packages/ui/src/tokens + styles TOKENS: colour, type, space, radius, shadow,   │
│                                 motion, breakpoints, tones, statuses           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Promotion rule:** a component starts in the one app that needs it. It moves to `packages/ui/domain` when a **second** app needs it. It moves to `components` only if it has no business meaning.

**Dependency rule:** arrows point down only. `packages/ui` never imports an app. `components` never imports `domain`. Nothing in `packages/ui` fetches data. Components take props, and apps own TanStack Query hooks.

---

## 2. Rules

1. **Tokens only.** No hex values, no arbitrary values (`p-[13px]`), no default Tailwind palette. The theme reset (theme.css) makes violations fail to compile into anything.
2. **No inline `style`.** ESLint rejects it. The only exception is data-driven geometry (a progress width from a score, a swatch from a token name), with a disable comment explaining why. Two usages exist: `ConfidenceMeter`, design-system swatches.
3. **One component, responsive by composition.** No `MobileX`/`DesktopX`. Form changes come from CSS (`md:`) or presentation props (`Dialog presentation`).
4. **Variants via `cva`**, merged with `cn()` (tailwind-merge configured for our custom scale names).
5. **React 19 idioms:** `ref` as a prop (no `forwardRef`), `<Context value>` providers, `useSyncExternalStore` for external stores.
6. **Radix for behaviour** (focus trap, roving tabindex, ARIA). Our classes for looks. Native elements where they beat custom ones (`<select>` on mobile).
7. **`asChild`** for polymorphism (render a router `<Link>` as a Button/ServiceCard) instead of `as` props with leaky typing.
8. **Accessible by type:** `IconButton.label` is required. `Field` wires label/hint/error. Status components always render text.
9. **Copy is a prop.** Components ship English defaults (`closeLabel`, `retryLabel`, `formatCounter`) but every user-visible string can be injected for i18n.
10. **Status presentation is data**, not code: labels/tones/icons come from `tokens/status.ts`. **Allowed transitions come from the API** (`GET /api/meta/transitions`), never hard-coded in UI.

---

## 3. Inventory

### 3.1 Foundation: `packages/ui/src/components`

| Component | Status | Notes |
|---|---|---|
| `Button` | ✅ | primary · secondary · outline · ghost · destructive; sm/md/lg; `loading` keeps width; `asChild`; touch sizes via `pointer-coarse` |
| `IconButton` | ✅ | Required `label`; optional tooltip |
| `Input` | ✅ | Leading icon, trailing slot, Field-aware, 16px text |
| `Textarea` | ✅ | |
| `Select` | ✅ | Native `<select>` (OS picker on phones) |
| `Checkbox` · `Radio`/`RadioGroup` · `Switch` | ✅ | Shared label/description layout; row is the target |
| `RadioCard` | ✅ | Large selectable card. Appliance/problem picking |
| `Field` · `Label` | ✅ | Label above, error + hint linked via `aria-describedby`; optional-marking |
| `Badge` · `StatusDot` | ✅ | 7 tones × subtle/solid/outline; live LED |
| `Avatar` | ✅ | Image/initials, presence dot |
| `Tooltip` · `TooltipProvider` | ✅ | Enhancement only |
| `Divider` | ✅ | |
| `Card` (+ Header/Title/Description/Footer) · `cardVariants` | ✅ | outline · elevated · sunken · interactive |
| `Tabs` | ✅ | underline · segmented |
| `Dialog` (+ Content/Header/Body/Footer/Trigger/Close) | ✅ | `presentation`: dialog · sheet · drawer (§ RESPONSIVE-STRATEGY 3) |
| `ConfirmationDialog` | ✅ | `alertdialog`, async confirm, destructive tone |
| `Toast` · `Toaster` · `toast()` | ✅ | success/info/error, action, swipe |
| `Alert` | ✅ | info/success/warning/error/neutral |
| `Skeleton` · `Spinner` · `LoadingState` | ✅ | |
| `EmptyState` · `ErrorState` | ✅ | page / compact |
| `StepProgress` | ✅ | Full-screen flow progress |
| `Heading` · `Text` | ✅ | Semantics separate from size |
| `Icon` · `CATEGORY_ICONS` | ✅ | Size tokens, decorative by default |
| `Popover` / `Menu` | ◻ | Radix DropdownMenu. Desktop row actions, "Move to…" |
| `OtpInput` | ◻ | 4-digit completion code / login OTP, WebOTP autofill |
| `SearchInput` / `Combobox` | ◻ | Address autocomplete, price-list picker, ⌘K |
| `DataTable` | ◻ | TanStack Table (PLAN §6.1), sticky header, card fallback < md |
| `DataList` | ◻ | Same rows rendered as cards on mobile |
| `FilterBar` | ◻ | Inline ≥ md, sheet < md |
| `Breadcrumbs` | ◻ | Admin only ≥ lg |
| `PhotoCapture` / `PhotoGrid` | ◻ | Camera input, upload progress, retry |
| `AudioPlayer` | ◻ | Call recording with transcript sync |

### 3.2 Layout: `packages/ui/src/layout`

| Component | Status | Notes |
|---|---|---|
| `Stack` · `Inline` | ✅ | Gap from the spacing scale only |
| `Container` | ✅ | Gutters 16/24/32, max widths |
| `StickyActionBar` | ✅ | Pinned + safe-area on phones, inline ≥ md |
| `SkipLink` | ✅ | |
| `AppShell` | ◻ | Slots: header, sidebar (≥ lg) / rail (md) / bottom nav (< md), main |
| `DesktopSidebar` · `MobileBottomNav` · `MobileHeader` · `DesktopHeader` | ◻ | Parts of AppShell, driven by one nav config per app (no duplicated menus) |
| `PageHeader` | ◻ | Title, meta, actions (inline ≥ md, in StickyActionBar < md) |

### 3.3 Shared domain: `packages/ui/src/domain`

| Component | Status | Used by | Notes |
|---|---|---|---|
| `StatusBadge` | ✅ | all | Audience-aware wording |
| `DutyStatusBadge` | ✅ | tech, admin | |
| `StatusTimeline` | ✅ | customer (milestones), admin (activity, compact), tech (job history) | complete/current/upcoming/attention |
| `ServiceCard` | ✅ | customer, admin (create request) | tile / row, visit price, `asChild` link |
| `TechnicianCard` | ✅ | customer (tracking), admin (dispatch candidates) | Credential only if real (UX C4) |
| `IntakeCallStatus` · `VoiceWave` | ✅ | customer | calling / understanding / confirmed / missed |
| `AiBadge` · `AiSummary` | ✅ | admin, (tech as "Call notes" without badge) | Staff-only provenance |
| `ConfidenceMeter` | ✅ | admin | Score, band, thresholds, breakdown, blocking flags |
| `PriceSummary` | ◻ | customer, tech | Line items + total, tabular; estimate & invoice |
| `EstimateCard` | ◻ | customer (approve), tech (sent), admin | Status-aware actions |
| `EtaIndicator` | ◻ | customer, admin | Big tabular ETA + "updated n min ago" |
| `PaymentCard` | ◻ | customer, tech | Phase-aware (manual vs UPI link, UX C12) |
| `ApplianceCard` | ◻ | customer (history), tech, admin | Brand, model, age, past jobs |

### 3.4 Customer-only: `apps/web-public/src/features`

| Component | Purpose |
|---|---|
| `TrackingCard` | Hero of the tracking page: milestone + who + ETA + next step |
| `BookingSummary` | Review step + desktop side column |
| `ReviewCard` | One-tap stars + optional comment |
| `TrustStrip` | Landing: rating, jobs done, local address, "price before work" |
| `ServiceCategory` | Landing section for one category (hero, issues, price, CTA) |

### 3.5 Technician-only: `apps/tech/src/features`

| Component | Purpose |
|---|---|
| `JobOfferCard` | Offer with countdown (announced), Accept / Decline |
| `JobCard` | Today list item, container-query responsive |
| `JobActionBar` | Sticky: one primary transition + "Problem". Reads allowed transitions |
| `JobTimeline` | `StatusTimeline` preset for a job |
| `EstimateBuilder` | Full-screen: price-list picker → lines → review → send |
| `PartsRequestCard` | Sheet form + request status |
| `CompletionCard` | After-photo + OTP + summary |
| `ProblemSheet` | Reason codes → transition |
| `SyncStatusChip` | Offline / syncing / synced |

### 3.6 Admin-only: `apps/admin/src/features`

| Component | Purpose |
|---|---|
| `KpiCard` | `stat` number, label, delta, skeleton while loading |
| `LiveJobBoard` | Status columns, SignalR patches, drag + "Move to…" |
| `TechnicianMap` | Google Maps, mounted ≥ md only (`useMediaQuery`) |
| `LeadCard` / `LeadRow` | Source, campaign, call attempts, status |
| `VerificationCard` / `VerificationWorkspace` | Audio + transcript ⇄ editable extracted fields |
| `AssignmentPanel` | Ranked `TechnicianCard`s with score breakdown |
| `ServiceRequestDrawer` | `Dialog presentation="drawer"` + tabs (Overview · Call · Billing · Activity) |
| `ActivityTimeline` | `StatusTimeline density="compact"` + actor/AI entries |
| `NeedsAttentionList` | Escalations ranked by SLA |
| `AnalyticsCard` | Chart container (Recharts, PLAN §6.1) |

---

## 4. Folder structure

```text
/
├── PLAN.md
├── package.json · pnpm-workspace.yaml · tsconfig.base.json · eslint.config.js
├── docs/
│   ├── UX-ARCHITECTURE.md
│   ├── DESIGN-SYSTEM.md
│   ├── USER-FLOWS.md
│   ├── COMPONENT-ARCHITECTURE.md
│   └── RESPONSIVE-STRATEGY.md
├── packages/
│   └── ui/                                   @servicepro/ui
│       └── src/
│           ├── styles/
│           │   ├── index.css                 entry: fonts + all layers
│           │   ├── tokens.css                primitive + semantic CSS variables
│           │   ├── theme.css                 Tailwind @theme: resets + scales
│           │   ├── motion.css                keyframes, voice/processing visuals, reduced motion
│           │   └── base.css                  body, focus, Indic line-height, utilities
│           ├── tokens/                       breakpoints · motion · tones · status (TS mirrors + config)
│           ├── lib/                          cn · format (INR, initials) · use-media-query
│           ├── icons/                        Icon, size tokens, CATEGORY_ICONS
│           ├── components/                   foundation
│           ├── layout/                       layout primitives
│           ├── domain/                       shared domain components
│           └── index.ts                      public API (the only import path apps use)
└── apps/
    ├── admin/                                hosts /design-system now; dashboard later
    │   └── src/
    │       ├── app/                          providers (Query, Tooltip, Toaster), router
    │       ├── features/
    │       │   └── design-system/            the demo route
    │       ├── main.tsx
    │       └── styles.css                    @import tailwindcss + @servicepro/ui/styles.css + @source
    ├── web-public/                           ◻ next phase
    └── tech/                                 ◻ next phase (PWA)
```

Feature folder convention (all apps): `features/<feature>/{components,hooks,api,routes}`. `api` holds TanStack Query hooks over the Orval-generated client (PLAN §6.1).

---

## 5. Demo route

`/design-system` (admin app). Run `pnpm install && pnpm dev`, then open http://localhost:5173/design-system.

Sections: Colour · Typography (incl. Telugu/Hindi) · Space & shape · Buttons · Forms · Cards & tabs · Badges & status (all 17 statuses × 2 audiences) · Timelines · Overlays (dialog/sheet/drawer/confirmation/tooltip) · Feedback (alerts, toasts, step progress, skeleton, loading/empty/error) · Service & technician · AI patterns.

It is built **only** from `@servicepro/ui`. If a screen can't be built from the package, the package is missing a piece. Before product launch it moves behind admin auth.

---

## 6. Implementation plan

| Phase | Scope | Exit criteria |
|---|---|---|
| **A. Foundation** ✅ *(this delivery)* | Tokens, theme resets, base CSS, motion, a11y rules, foundation + layout + shared domain components, demo route, docs | Typecheck, lint and build pass. Demo verified at 390 px and 1440 px. **Awaiting approval** |
| **B. Shells & data plumbing** | `AppShell` (+ nav parts), `PageHeader`, `Menu`, `OtpInput`, `SearchInput`, i18n package (`packages/i18n`, en/te/hi) with status labels moved into it, Orval client + Query conventions, SignalR hook | Each app boots into an empty authenticated shell on all breakpoints |
| **C. Technician app** (PLAN Phase 1 critical path) | Today, Offers, Job page, JobActionBar, ProblemSheet, Completion (photo + OTP), offline queue | A technician runs a full job on a real phone in ≤ 6 taps + photo + OTP |
| **D. Admin core** | Dashboard (KPIs, board, needs-attention), Requests table/board + drawer, Dispatch + AssignmentPanel, Technicians | Owner runs a day of jobs without phone calls (PLAN Phase 1 exit) |
| **E. Customer** | Tracking page, estimate approval, review. Then landing + request flow (PLAN Phase 2) | Lighthouse mobile ≥ 90 on landing. Tracking works on a 3G throttle |
| **F. AI surfaces** | Verification workspace, AudioPlayer, AI activity entries, call-status page wired to live events | Reviewer clears a lead in < 60 s |
| **G. Billing & reports** | Estimates/invoices/payments/ledger, parts, reports incl. AI performance | — |

Each phase: build components first in `/design-system` (all states), then compose screens.

### Dependencies added in this phase (and why)
| Package | Why |
|---|---|
| `radix-ui` | Accessible behaviour for dialog, tabs, toast, tooltip, checkbox, radio, switch, avatar, separator, slot |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Variant APIs + safe class merging (the shadcn/ui pattern) |
| `lucide-react` | Icon set (brief) |
| `@fontsource-variable/{manrope,noto-sans-telugu,noto-sans-devanagari}` | Self-hosted fonts (offline PWA, no third-party calls) |
| `react-router@7`, `@tanstack/react-query` | Routing + server state (brief). Router 7, not 8, because Router 8 requires Node 22 and this machine runs Node 20 |
| `eslint` + `typescript-eslint` + `jsx-a11y` + `react-hooks` | Enforce strict TS, a11y and the no-inline-style rule |

Deliberately **not** added: animation libraries (CSS covers the motion system), `vaul` (drag-to-dismiss sheets; revisit only if testing shows people expect it), component-library kits, date libraries (not needed yet).
