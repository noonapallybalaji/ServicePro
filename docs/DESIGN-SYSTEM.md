# Design System Specification

> Status: **Draft for approval.** Implemented in [`packages/ui`](../packages/ui), and shown visually at **`/design-system`** in the admin app (`pnpm dev`).
> "ServicePro" is the working product name, taken from PLAN.md's code namespace. Swap it when the brand name is decided. Only the wordmark changes.

Contents: 1 Brand · 2 Colour · 3 Typography · 4 Spacing · 5 Shape & elevation · 6 Iconography · 7 Motion · 8 Accessibility · 9 Voice & tone · 10 Token reference

---

## 1. Brand direction

### 1.1 Positioning
A trusted local expert, with the clarity of a modern consumer app. The brand should feel like **the best senior technician you've ever had**: arrives when they said, explains the problem plainly, shows the price before touching anything, and leaves the place clean.

### 1.2 Personality

| We are | We are not |
|---|---|
| **Calm.** Unhurried, even when your AC died in May | Alarmist, urgent-red, countdown-timer pushy |
| **Precise.** Exact times, exact prices, exact names | Vague ("soon", "starting at…*") |
| **Honest.** Price before work, photos after | Hidden fees, fine print |
| **Warm.** Human words, local languages | Corporate, jargon ("ticket", "SLA breach") |
| **Competent.** Engineering-grade clarity | Flashy, techno-futurist, "AI-powered!" |

### 1.3 Visual personality: "precision instrument"
Visual cues come from well-made electronics: calibrated readouts, status LEDs, clean panels, clear labels.

- **Readouts.** Prices, ETAs, OTPs and KPIs use tabular figures in a heavier weight (`stat` styles), like a display panel.
- **Status LED.** A small solid dot, pulsing only when something is live. This is the brand's single signature motion.
- **Clean panels.** Flat white surfaces on a warm-grey canvas, hairline borders, generous padding. Depth comes from layout, not shadows.
- **Petrol.** A deep blue-teal: cool air, clean water, a calm signal. Not generic SaaS blue, and clearly distinct from success green.

### 1.4 What we avoid (and why)
- **Gradients and glassmorphism.** They age quickly, hurt legibility in sunlight, and cost GPU on budget phones.
- **Large radii and big shadows.** They make the product look like a toy and make dense admin screens mushy.
- **AI visual clichés** (sparkles, purple glows, robot avatars) in customer UI. The AI's job is to disappear (UX-ARCHITECTURE §6).
- **Generic admin-template look** (blue sidebar, rainbow KPI tiles, stock charts). The dashboard uses the same calm system as the customer app.

### 1.5 Design principles
1. **Clarity over cleverness.** If a label needs explaining, change the label.
2. **One thing at a time on mobile.** Full-screen steps, one primary action.
3. **Show the money and the person.** Price and technician identity are first-class UI, never footnotes.
4. **Status is sacred.** Status always shows as colour + icon + words, and is always current.
5. **Restraint is premium.** Few colours, few sizes, lots of space. Each extra variant has to justify itself.
6. **Built for the real conditions:** sunlight, one hand, 4G, Telugu, a ₹10k Android phone.

---

## 2. Colour

### 2.1 Architecture
Two layers, defined in [tokens.css](../packages/ui/src/styles/tokens.css):

1. **Primitive palette:** `--graphite-*` (neutrals) and `--petrol-*` (brand). Components **never** use these directly.
2. **Semantic tokens:** `--primary`, `--surface`, `--success-subtle`, … These are the only colours components use. They map to Tailwind via `@theme inline` in [theme.css](../packages/ui/src/styles/theme.css) (`bg-primary`, `text-foreground-secondary`).

Tailwind's default palette is **reset**: `bg-red-500` and `text-gray-600` don't compile. Only semantic colours exist.

### 2.2 Semantic tokens

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--background` | graphite-25 `#f6f7f5` | App canvas | — |
| `--surface` | `#ffffff` | Cards, sheets, inputs | — |
| `--surface-elevated` | `#ffffff` | Floating surfaces (with shadow) | — |
| `--surface-sunken` | graphite-50 `#eff1ee` | Wells, skeletons, icon tiles | — |
| `--surface-inverse` | graphite-900 | Tooltips | — |
| `--foreground` | graphite-900 `#141b19` | Primary text | 17.4:1 |
| `--foreground-secondary` | graphite-600 `#4a5450` | Supporting text | 7.6:1 |
| `--foreground-muted` | graphite-500 `#6a736f` | Meta, placeholders | 4.9:1 (AA body) |
| `--border` | graphite-200 | Decorative separation | (decorative) |
| `--input` | graphite-400 `#8a938e` | Control boundaries | 3.0:1 (WCAG 1.4.11) |
| `--ring` | petrol-500 `#13778d` | Focus indicator | 5.2:1 |
| `--primary` | petrol-600 `#0b6276` | Main action, links, progress | white text 6.9:1 |
| `--primary-hover` / `-active` | petrol-700 / 800 | Interaction states | — |
| `--primary-foreground` | `#ffffff` | Text on primary | — |
| `--primary-subtle` | petrol-50 | Selected cards, icon tiles | — |
| `--secondary` | graphite-100 | Secondary button | — |
| `--success` · `-subtle` · `-subtle-foreground` | `#1d7a43` · `#eaf6ee` · `#17633a` | Completed, paid, available | 5.4:1 |
| `--warning` · `-subtle` · `-subtle-foreground` | `#e8a317` · `#fff6e5` · `#8a4b00` | Needs attention, waiting | dark text on solid |
| `--error` · `-subtle` · `-subtle-foreground` | `#c4271b` · `#fdeeec` · `#a01d13` | Failure, destructive | 5.8:1 |
| `--info` · `-subtle` · `-subtle-foreground` | `#2563c9` · `#edf3fc` · `#174a96` | Notices, scheduled | 5.7:1 |
| `--ai` · `-subtle` · `-subtle-foreground` | `#5a4bc2` · `#f1effb` · `#4a3ca8` | **Staff-only** AI provenance | 6.3:1 |
| `--rating` | `#e09c0b` | Star fill (always next to a number) | decorative |
| `--tech-available` / `-on-job` / `-break` / `-offline` | success / primary / warning / graphite-400 | Technician duty dots | always with a label |

Every tone has five slots: `solid`, `foreground` (on solid), `subtle` (background), `subtle-foreground` (text on subtle), and `border`. [`TONE_CLASSES`](../packages/ui/src/tokens/tones.ts) maps these to literal classes so every badge, alert and status uses the same pairs.

### 2.3 Usage rules
- **Petrol is for action and progress.** Buttons, links, selected states, completed timeline steps and focus. Not decoration.
- **Feedback colours mean something.** Green = done/good, amber = needs attention, red = failed/destructive, blue = informational. Never use them for decoration.
- **Warning solid takes dark text**, never white (white on amber fails contrast).
- **Violet is AI, and only for staff.** It never appears in the customer or technician apps.
- **Never colour alone.** Every status pairs colour with an icon or dot **and** a text label (WCAG 1.4.1).

### 2.4 Dark mode: not in v1
Dark mode is **not genuinely useful** for these users yet:
- Technicians work outdoors in daylight, where a light, high-contrast UI reads better.
- Customers use the product briefly (a booking, a tracking check).
- The owner's dashboard is used in a shop/office during working hours.

The two-layer token architecture means dark mode later is a single `[data-theme="dark"]` block that remaps semantic tokens. Components don't change. Revisit if technicians report night-time glare.

---

## 3. Typography

### 3.1 Families
| Role | Family | Why |
|---|---|---|
| UI + display (Latin) | **Manrope Variable** | Geometric-grotesque with a technical, engineered feel and open apertures for small sizes. Variable weights give 650/750 steps without extra files. Not as overused as Inter. |
| Telugu | **Noto Sans Telugu Variable** | Best open Telugu UI font. Harmonises with Manrope's x-height |
| Hindi | **Noto Sans Devanagari Variable** | Same family logic |

Fonts are **self-hosted** via Fontsource (PWA offline, no third-party requests). Indic fonts are split by `unicode-range`, so they download **only** when Telugu/Hindi text is on screen.

### 3.2 Scale
Mobile-first. Display, H1, H2 and Stat scale fluidly with `clamp()` between 360px and 1440px.

| Token | Size (mobile → desktop) | Line height | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `text-display` | 36 → 48 | 1.1 | 750 | −0.025em | Landing hero only |
| `text-h1` | 28 → 32 | 1.2 | 700 | −0.02em | Page title |
| `text-h2` | 22 → 24 | 1.3 | 700 | −0.015em | Section title |
| `text-h3` | 18 | 1.4 | 650 | −0.01em | Card title, sheet title |
| `text-body-lg` | 17 | 1.55 | 400 | — | Customer reading text |
| `text-body` | 16 | 1.5 | 400 | — | Default, **all form controls** |
| `text-sm` | 14 | 1.45 | 400 | — | Secondary text, tables |
| `text-caption` | 12 | 1.35 | 500 | 0.01em | Meta, timestamps |
| `text-overline` | 12 | 1.35 | 650 | 0.06em, uppercase | Section labels (sparingly) |
| `text-button` | 15 | 1.35 | 650 | — | Buttons sm/md |
| `text-button-lg` | 17 | 1.4 | 650 | — | Buttons lg |
| `text-stat` | 28 → 32 | 1.1 | 700 | −0.02em, tabular | KPIs, totals |
| `text-stat-sm` | 22 | 1.2 | 700 | −0.01em, tabular | ETA, OTP, SR number |

Tailwind's default type scale is **reset**. `text-xl` doesn't exist.

### 3.3 Rules
- **16px minimum for any input.** Smaller makes iOS zoom in, and 16px is the readable minimum on budget screens.
- **Tabular numbers** (`tabular-nums`) for every changing number: prices, ETAs, countdowns, KPIs.
- **Semantics ≠ size.** `<Heading level={2} size="h3">`. Never skip heading levels to get a look.
- **Indic line height.** Setting `lang="te"` or `lang="hi"` on any ancestor raises line heights by ~15–20% automatically ([base.css](../packages/ui/src/styles/base.css)).
- **Line length** max ~65ch for reading text (`max-w-prose`).
- Sentence case everywhere. Uppercase only in `overline`.

---

## 4. Spacing

A **4px grid** with a fixed set of steps. Tailwind's spacing multiplier is reset, so only these exist (`p-7` or `gap-9` don't compile):

| Step | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 14 | 16 | 20 | 24 | 32 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| px | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 56 | 64 | 80 | 96 | 128 |

Plus named layout sizes: `w-sidebar` (240) and `h-header` (56).

| Context | Spacing |
|---|---|
| Inline icon ↔ text | 4–8 |
| Inside a control / badge | 8–12 horizontal |
| Between related items (label → input, rows in a card) | 8–12 |
| Card padding | 16 (mobile) → 20 (md+) |
| Between cards / form fields | 12–20 |
| Between sections | 32–64 |
| Page gutter | 16 / 24 / 32 (mobile / tablet / desktop) |

**Rule:** parents own spacing (`Stack`/`Inline` `gap`). Children don't add margins to position themselves.

---

## 5. Shape & elevation

### 5.1 Radius
| Token | px | Use |
|---|---|---|
| `rounded-sm` | 6 | Checkbox, small chips, skeleton lines |
| `rounded-control` | 10 | Buttons, inputs, selects, icon tiles |
| `rounded-card` | 14 | Cards, panels, alerts |
| `rounded-sheet` | 20 | Modals, bottom sheets (top corners) |
| `rounded-pill` | full | Badges, chips, toggles |
| `rounded-full` | full | Avatars, status dots |

Nested radii shrink. An icon tile (10) inside a card (14) keeps the curves concentric.

### 5.2 Borders
- **1px hairlines** (`--border`) separate. **1px `--input`** bounds interactive controls (3:1).
- Selected = border becomes `--primary` + background `--primary-subtle`. Width never changes, so nothing jumps.
- Focus = 2px `--ring` outline, 2px offset, on **every** focusable element.

### 5.3 Shadows (ink-tinted, restrained)
| Token | Use |
|---|---|
| `shadow-xs` | Active segment in segmented tabs |
| `shadow-sm` | `Card variant="elevated"` |
| `shadow-md` | Interactive card hover, popovers, tooltip |
| `shadow-lg` | Sheets, modals, drawers, toasts |

Flat by default: **a shadow means it floats or it's clickable.**

---

## 6. Iconography
- **Lucide** only, 2px stroke, outline style.
- Sizes on the grid: **16** (inline with text-sm), **20** (default), **24** (prominent, category tiles).
- Appliance icons are centralised in [`CATEGORY_ICONS`](../packages/ui/src/icons/index.tsx), keyed by `service_categories.code`.
- Status icons are centralised in [`SERVICE_REQUEST_STATUS`](../packages/ui/src/tokens/status.ts).
- Icons are `aria-hidden` unless they're the only content (then `IconButton` requires a `label`).

---

## 7. Motion

### 7.1 Principle
Motion **explains a change**: where something came from, that it's live, that your tap registered. It never decorates.

### 7.2 Tokens
| Duration | ms | Use |
|---|---|---|
| `--duration-instant` | 100 | Press feedback |
| `--duration-fast` | 150 | Hover, colour changes, exits |
| `--duration-base` | 200 | Fades |
| `--duration-slow` | 300 | Dialog enter, content rise-in, toast |
| `--duration-slower` | 420 | Sheet / drawer enter, success pop |

| Easing | Curve | Use |
|---|---|---|
| `--ease-standard` | (0.2, 0, 0, 1) | Most transitions |
| `--ease-enter` | (0, 0, 0.2, 1) | Things arriving (decelerate) |
| `--ease-exit` | (0.4, 0, 1, 1) | Things leaving (accelerate, shorter) |
| `--ease-emphasized` | (0.32, 0.72, 0, 1) | Sheets, drawers, success, like native iOS/Android |

### 7.3 Catalogue ([motion.css](../packages/ui/src/styles/motion.css))
| Pattern | Animation | Notes |
|---|---|---|
| Page transition | `rise-in` (8px up + fade, 300ms) on route content | No horizontal slides between top-level pages. Detail pages on mobile use `drawer-in` (from right) |
| Card hover | `shadow-md` + border-strong, 150ms | Hover-capable devices only |
| Button press | `pressable`: scale 0.98 | Instant tactile feedback |
| Bottom sheet | `sheet-in` / `sheet-out` (translateY 100%) | 420 / 200ms |
| Modal | `dialog-in` (fade + scale 0.97) | 300ms |
| Drawer | `drawer-in` (translateX 100%) | Same on mobile (page push) and desktop (panel) |
| Status change | Badge swaps + `rise-in` on the new timeline step | Pairs with an `aria-live` announcement |
| Skeleton | Soft shimmer 1.6s | Static under reduced motion |
| Success | `pop-in` check (scale 0.6 → 1.06 → 1) | Request confirmed, job completed, payment received |
| Technician assigned | Avatar `pop-in` + card `rise-in` | The customer's "someone's coming" moment |
| AI processing | `processing-dots`: sequential opacity | Deliberately calmer than a spinner |
| Voice call | `voice-wave`: 4 bars | Only while a call is really in progress |
| Live status | `live-ping` LED | En route, diagnosing, in progress. Nowhere else |

### 7.4 Reduced motion
Under `prefers-reduced-motion: reduce`, every animation and transition is cut to 1ms: **state changes stay, movement goes.** Infinite animations stop, so state must always be legible without motion (text labels, `role="status"`).

---

## 8. Accessibility (target: WCAG 2.2 AA)

| Area | Standard | Enforced by |
|---|---|---|
| **Contrast** | Text ≥ 4.5:1, large text/UI boundaries ≥ 3:1 | Token values (§2.2). The raw palette is unavailable |
| **Colour alone** | Never the only signal | `StatusBadge`, `DutyStatusBadge`, `Alert` always render icon/dot + text |
| **Focus** | Visible 2px ring, 2px offset, on everything focusable | Global `:focus-visible` in base.css |
| **Keyboard** | Every action reachable. Logical order. Esc closes overlays. Focus is trapped in and restored from dialogs | Radix primitives. `SkipLink` on every page |
| **Touch targets** | ≥ 44×44 on touch (exceeds 2.5.8's 24px) | `pointer-coarse:` sizes on Button, IconButton, Input, Tabs |
| **Forms** | Visible label above every control. Errors in text, linked via `aria-describedby`, `aria-invalid` set. Errors say how to fix | `Field` wires id/describedby/invalid automatically |
| **Screen readers** | Semantic HTML first. ARIA only where HTML can't express it (`role="status"`, `progressbar`, `meter`, `aria-current="step"`) | Code review + `eslint-plugin-jsx-a11y` |
| **Icon-only buttons** | Must have an accessible name | `IconButton.label` is a required prop |
| **Live updates** | Status changes announced politely. Errors assertively | `LoadingState`, `IntakeCallStatus` (`role="status"`), `ErrorState` (`role="alert"`) |
| **Reduced motion** | Respected globally | motion.css |
| **Language** | `lang` set on `<html>` and on any mixed-language region | Indic line-height follows `lang` |
| **Zoom/reflow** | Works at 200% zoom and 320px width without horizontal scroll | Responsive rules ([RESPONSIVE-STRATEGY.md](RESPONSIVE-STRATEGY.md)) |
| **Time limits** | Job-offer countdown: visible, announced, and recoverable (owner can re-offer) | JobOfferCard spec |
| **Dragging** (2.5.7) | Every drag (board reassign, swipe) has a tap alternative | LiveJobBoard spec: "Move to…" menu |

---

## 9. Voice & tone

| Do | Don't |
|---|---|
| "Ravi is on the way. Arriving in about 25 min." | "Technician dispatched. ETA: 25." |
| "We couldn't reach you. We'll try again at 10:30." | "Call failed (NO_ANSWER)." |
| "Nothing is charged until you approve." | "Estimate pending customer authorisation." |
| "Understanding your service request…" | "AI is thinking…" |
| "Your updates are saved and will sync when you're back online." | "Network error." |
| Staff: "Needs review: address unclear" | Staff: "Low confidence" |

- Second person, active voice, present tense.
- Name people (customer, technician) wherever we know them.
- Numbers as digits. Prices in ₹ with Indian grouping (`formatINR` → ₹1,24,500).
- Times are absolute ("10:30 AM") when they're commitments, relative ("2 min ago") when they're recency.

---

## 10. Token reference (where things live)

| Concern | CSS | TypeScript |
|---|---|---|
| Colour primitives + semantics | `styles/tokens.css` | — |
| Tailwind mapping & scale resets | `styles/theme.css` | — |
| Breakpoints | `theme.css --breakpoint-*` | `tokens/breakpoints.ts` (mirror) |
| Motion | `tokens.css --duration-*`, `theme.css --ease-*`, `motion.css` | `tokens/motion.ts` (mirror) |
| Tones | — | `tokens/tones.ts` |
| Statuses, milestones, duty, confidence bands | — | `tokens/status.ts` |
| Icons | — | `icons/index.tsx` |
| Base, focus, Indic, utilities | `styles/base.css` | — |
