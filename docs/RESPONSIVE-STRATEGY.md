# Responsive Strategy

> Status: **Draft for approval.** One codebase. Three role apps ([UX-ARCHITECTURE §0 C10](UX-ARCHITECTURE.md#0-conflicts-between-the-design-brief-and-planmd)). **Zero** device-specific components. Each component adapts through *composition*: the same component with responsive classes, never a `MobileX` / `DesktopX` pair.

---

## 1. Two axes, not one

| Axis | Question | Tailwind | Drives |
|---|---|---|---|
| **Viewport width** | How much room is there? | `sm: md: lg: xl:` | Layout: columns, stack vs side-by-side, sheet vs modal, nav form |
| **Input modality** | Finger or mouse? | `pointer-coarse:` / `pointer-fine:` | **Density**: control heights, target sizes, hover affordances |

Why both: a tablet in landscape is 1024px wide (desktop layout) but driven by fingers (large targets). A laptop at 700px wide uses a mouse. Width alone gets both wrong.

`hover:` styles apply only on hover-capable devices (Tailwind v4 default), so touch never gets "stuck hover".

---

## 2. Breakpoints

Defined in [theme.css](../packages/ui/src/styles/theme.css), mirrored in [breakpoints.ts](../packages/ui/src/tokens/breakpoints.ts).

| Name | Min width | Device class | Layout behaviour |
|---|---|---|---|
| *(base)* | 0 | Phone 320–639 | Single column, bottom nav, sheets, full-screen flows, sticky CTAs |
| `sm` | 640 | Large phone landscape / small tablet | 2-column card grids, inline secondary actions |
| `md` | 768 | Tablet | Modals instead of sheets, drawers as side panels, tables appear, icon-rail sidebar (admin) |
| `lg` | 1024 | Desktop | Full sidebar, multi-column dashboards, list + detail side by side |
| `xl` | 1440 | Large desktop | Extra board columns, wider KPI rows, map + list + detail |

Design and test at: **360, 390, 768, 1024, 1280, 1440, 1920**. Must work at **320** (WCAG reflow) and 200% zoom.

**CSS first.** `useMediaQuery` is only for *behaviour* (e.g. don't mount the Google Map under `md`), never for layout.

**Container queries** (`@container`, Tailwind's defaults kept) for components that live in containers of unknown width: a `JobCard` in a narrow board column vs a wide list.

---

## 3. Pattern decision table

When a component must change form, use this table instead of deciding case by case.

| Situation | < md (phone) | md (tablet) | ≥ lg (desktop) | Implementation |
|---|---|---|---|---|
| **Short task / confirmation** (estimate review, reschedule) | Bottom sheet | Centred modal | Centred modal | `DialogContent presentation="dialog"` |
| **Pick one of a few actions** (problem reasons, "More" menu) | Bottom sheet | Bottom sheet (capped width) | Popover / menu | `presentation="sheet"`; menu on desktop |
| **Detail of an item from a list** (SR detail, lead, technician) | Full-screen page with back arrow | Right drawer | Right drawer (list stays visible) | `presentation="drawer"` (+ real route for deep links) |
| **Multi-step flow** (request service, estimate builder, completion) | Full-screen steps + `StepProgress` + sticky CTA | Centred column (`max-w-prose`) | Centred column, or 2-pane (steps + live summary) | Route-level layout, same step components |
| **Primary action of a page** | `StickyActionBar` (thumb zone) | Inline at end of content | Inline, top-right of page header | `StickyActionBar` turns static at `md` |
| **Navigation** (signed-in apps) | Bottom nav (≤ 5 items) | Bottom nav (customer/tech), icon rail (admin) | Sidebar (admin), top bar (customer) | One `AppShell` with responsive slots |
| **Collection of records** | Cards (stacked) | Cards (2-col) or table | Table with sortable columns | Same row model → `DataList` renders card or row |
| **Filters** | Button → bottom sheet with filters + **Show 23 results** | Inline chips + "More filters" sheet | Inline filter bar | `FilterBar` collapses |
| **Secondary info** (customer history next to SR) | Collapsed section / tab | Tab | Side column | Tabs < lg, columns ≥ lg |
| **Horizontal set of choices** (services on home) | Horizontal snap carousel, next card peeking | Grid 3-col | Grid 5-col | Same `ServiceCard`, list classes change |
| **Tooltips** | Not available → info must be visible text | — | Hover/focus enhancement only | `Tooltip` |
| **Drag & drop** (board reassign) | "Move to…" action in card menu | Drag + menu | Drag + menu | Tap alternative always (WCAG 2.5.7) |

### 3.1 Stack / collapse rules
- **Stack** when two blocks each need > 50% of the width to stay readable (form + summary; KPI tiles under `sm`).
- **Collapse** (accordion/"show more") only for secondary content. Never collapse price, status, or the technician.
- **Truncate** only identifiers in dense tables (with full text in title/tooltip **and** the detail view). Never truncate prices, addresses on technician screens, or status labels.

---

## 4. Mobile principles (designed, not shrunk)

1. **Thumb zone first.** Primary actions sit in the bottom third: `StickyActionBar`, bottom nav, sheets. Top-right holds only low-frequency actions (help, profile).
2. **One task per screen.** Booking and estimate building are full-screen steps with a visible step counter. Back keeps data.
3. **Large targets.** 48px controls and 56px primary CTAs on touch, with 8px+ between adjacent targets.
4. **Minimal typing.** Choice cards before text fields. Numeric keyboards (`inputMode`). Autocomplete for addresses. OTP auto-fill (WebOTP). The AI call collects details instead of a long form.
5. **Voice where it fits.** The *customer* talks to us by phone (the AI call). The app doesn't add in-browser voice (UX-ARCH C3). Technicians may later get voice notes on jobs (`sr_attachments.kind = VOICE_NOTE` exists).
6. **Horizontal carousels sparingly.** Only for browsable sets (services, photos), always with the next item peeking and snap points, never for primary content.
7. **Swipe is an accelerator, never the only way.** Toasts swipe away and also have a close button. Sheets close via button/overlay/Esc.
8. **Safe areas.** `viewport-fit=cover` + `pb-safe` / `pt-safe` on sticky bars, sheets and drawers.
9. **Sunlight and budget screens.** High contrast, no light-grey-on-white, no thin weights below 400.
10. **Offline-tolerant** (technician PWA). Optimistic status updates, a visible sync state, cached job data.

### 4.1 Technician speed budget
- Status change: **1 tap** from the job screen (JobActionBar), **≤ 2 taps** from Today.
- Accept an offer: **1 tap** from anywhere (global banner).
- Report a problem: **2 taps** (Problem → reason).
- No status update needs typing, except estimate lines and OTP.

---

## 5. Desktop principles (use the space)

1. **List + detail side by side.** Opening an SR keeps the list/board visible (drawer). Arrow keys move between items.
2. **Multi-column dashboard** (≥ lg):
   ```text
   ┌─────────────────────────── KPI row (7 tiles, 1 line) ───────────────────────────┐
   ├──────────────────────────────────────────────┬──────────────────────────────────┤
   │ Live board (status columns)                  │ Needs attention (ranked)         │
   │                                              ├──────────────────────────────────┤
   │                                              │ Technician map / list            │
   └──────────────────────────────────────────────┴──────────────────────────────────┘
   ```
   `xl` adds board columns and widens the map. `md` stacks the right column under the board. `< md`: KPIs as a 2×n grid, then Needs attention, then the board as status-grouped lists.
3. **Tables for comparison**: sortable, sticky header, sticky first column on overflow, row hover, inline status badges, bulk select where PLAN has bulk actions.
4. **Persistent filters & saved views** (e.g. "Stuck > 3 h", "Kondapur today").
5. **Keyboard power:** ⌘K global search (phone, SR number, name), `J/K` to move through lists, `Esc` to close the drawer.
6. **Real-time without jank:** SignalR updates patch rows in place, with a brief `rise-in` highlight. Never reorder rows under the cursor. Show "3 new: click to show" instead.
7. **Density on pointer-fine:** 40px controls, 14px table text, 12px row padding. Same components, `pointer-fine` density.
8. **Max content width** 1280 (`max-w-content`) for forms and reading. Boards and tables may go full width.
9. **No phone column on a big screen.** The technician app widens to `max-w-wide` (1152) from `lg`: Today becomes a hero band plus jobs (2/3) beside offers and done-today (1/3); a job puts history in a sticky right column; profile and earnings use a 1/3 + 2/3 split. Single-column grids use `grid-cols-1` (`minmax(0, 1fr)`) so long text truncates instead of widening the page.
10. **Sign-in is a split screen** (`AuthLayout`): brand panel with illustration on the left, form on the right. On phones the panel becomes a short band above the form.

---

## 6. Per-app compositions

| | Customer (`web-public`) | Technician (`tech`) | Admin (`admin`) |
|---|---|---|---|
| Design-first width | 390 | 390 | 1440 |
| Must also work | 1440 (desktop visitors from Google) | 768 (tablets in vans) | 390 (owner on the go) |
| Shell < md | Top bar, no nav (signed-out) / bottom nav (signed-in) | Header + bottom nav | Header + bottom nav (4 + More) |
| Shell ≥ lg | Top bar + centred content, summary side column in flows | Centred column, max 640 (it's a phone app on a big screen) | Sidebar + header + fluid content |
| Detail views | Sections on one page | Full-screen page | Drawer over list |
| Lists | Cards | Cards | Tables (cards < md) |

---

## 7. Testing checklist (per screen)

- [ ] 320 px: no horizontal scroll, nothing clipped
- [ ] 390 px with `pointer: coarse` (Chrome device mode): targets ≥ 44 px, primary CTA in thumb zone
- [ ] 768 px: modals/drawers switch correctly, no orphaned single cards
- [ ] 1440 px: content uses the space (columns/side panels), line lengths ≤ 75ch
- [ ] 200% zoom: reflows, no overlap
- [ ] Telugu (`lang="te"`): no clipped glyphs, buttons don't overflow
- [ ] Keyboard only: logical order, visible focus, overlays trap and restore focus
- [ ] Reduced motion: no movement, states still clear
