import type { ConfidenceCheck, TimelineStep } from '@servicepro/ui';

/*
 * Sample content for the design-system page only. Prices, names and numbers are
 * illustrative placeholders — not business data.
 */

export const DEMO_SECTIONS = [
  { id: 'colors', label: 'Colour' },
  { id: 'typography', label: 'Typography' },
  { id: 'shape', label: 'Space & shape' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Forms' },
  { id: 'cards', label: 'Cards & tabs' },
  { id: 'status', label: 'Badges & status' },
  { id: 'timeline', label: 'Timelines' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'service', label: 'Service & technician' },
  { id: 'ai', label: 'AI patterns' },
] as const;

export interface ColorToken {
  token: string;
  label: string;
  usage: string;
  /** Token for text drawn on top of the swatch. */
  on?: string;
  bordered?: boolean;
}

export const COLOR_GROUPS: { title: string; description: string; tokens: ColorToken[] }[] = [
  {
    title: 'Surfaces & text',
    description: 'A warm-grey canvas with white surfaces. Text is near-black ink, never pure black.',
    tokens: [
      { token: '--background', label: 'Background', usage: 'App canvas', bordered: true, on: '--foreground' },
      { token: '--surface', label: 'Surface', usage: 'Cards, sheets, inputs', bordered: true, on: '--foreground' },
      { token: '--surface-sunken', label: 'Surface sunken', usage: 'Wells, skeletons, icon tiles', on: '--foreground' },
      { token: '--surface-inverse', label: 'Surface inverse', usage: 'Tooltips', on: '--foreground-inverse' },
      { token: '--foreground', label: 'Text primary', usage: 'Headings, body · 17:1', on: '--foreground-inverse' },
      { token: '--foreground-secondary', label: 'Text secondary', usage: 'Supporting text · 7.6:1', on: '--foreground-inverse' },
      { token: '--foreground-muted', label: 'Text muted', usage: 'Meta, placeholders · 4.9:1', on: '--foreground-inverse' },
      { token: '--border', label: 'Border', usage: 'Decorative separation', on: '--foreground' },
      { token: '--input', label: 'Input border', usage: 'Control boundary · 3:1', on: '--foreground-inverse' },
    ],
  },
  {
    title: 'Brand — Petrol',
    description: 'A deep blue-teal: cool air, clean signal. Distinct from SaaS blue and from success green.',
    tokens: [
      { token: '--primary', label: 'Primary', usage: 'Main action, links, progress · 6.9:1', on: '--primary-foreground' },
      { token: '--primary-hover', label: 'Primary hover', usage: 'Hover / pressed', on: '--primary-foreground' },
      { token: '--primary-subtle', label: 'Primary subtle', usage: 'Selected cards, icon tiles', on: '--primary-subtle-foreground' },
      { token: '--ring', label: 'Focus ring', usage: 'Keyboard focus', on: '--primary-foreground' },
      { token: '--secondary', label: 'Secondary', usage: 'Secondary buttons', on: '--secondary-foreground' },
    ],
  },
  {
    title: 'Feedback',
    description: 'Always paired with an icon and a label — colour is never the only signal.',
    tokens: [
      { token: '--success', label: 'Success', usage: 'Completed, paid, available', on: '--success-foreground' },
      { token: '--warning', label: 'Warning', usage: 'Needs attention, waiting', on: '--warning-foreground' },
      { token: '--error', label: 'Error', usage: 'Failures, destructive', on: '--error-foreground' },
      { token: '--info', label: 'Info', usage: 'Neutral notices, scheduled', on: '--info-foreground' },
      { token: '--success-subtle', label: 'Success subtle', usage: 'Badge / alert background', on: '--success-subtle-foreground' },
      { token: '--warning-subtle', label: 'Warning subtle', usage: 'Badge / alert background', on: '--warning-subtle-foreground' },
      { token: '--error-subtle', label: 'Error subtle', usage: 'Badge / alert background', on: '--error-subtle-foreground' },
      { token: '--info-subtle', label: 'Info subtle', usage: 'Badge / alert background', on: '--info-subtle-foreground' },
    ],
  },
  {
    title: 'AI & technician status',
    description: 'Violet marks AI provenance for staff only. Technician dots always sit next to a text label.',
    tokens: [
      { token: '--ai', label: 'AI accent', usage: 'Staff-only AI provenance', on: '--ai-foreground' },
      { token: '--ai-subtle', label: 'AI subtle', usage: 'AI summary panels', on: '--ai-subtle-foreground' },
      { token: '--tech-available', label: 'Available', usage: 'Technician duty', on: '--foreground-inverse' },
      { token: '--tech-on-job', label: 'On a job', usage: 'Technician duty', on: '--foreground-inverse' },
      { token: '--tech-break', label: 'On break', usage: 'Technician duty', on: '--warning-foreground' },
      { token: '--tech-offline', label: 'Off duty', usage: 'Technician duty', on: '--foreground' },
    ],
  },
];

export const TYPE_SPECIMENS = [
  { name: 'Display', className: 'text-display', spec: '36→48 · 1.1 · 750', sample: 'Appliance repair, sorted.' },
  { name: 'H1', className: 'text-h1', spec: '28→32 · 1.2 · 700', sample: 'Book an AC service' },
  { name: 'H2', className: 'text-h2', spec: '22→24 · 1.3 · 700', sample: "Today's jobs" },
  { name: 'H3', className: 'text-h3', spec: '18 · 1.4 · 650', sample: 'Ravi Kumar is on the way' },
  { name: 'Body large', className: 'text-body-lg', spec: '17 · 1.55 · 400', sample: 'Your technician will check the outdoor unit and gas pressure first.' },
  { name: 'Body', className: 'text-body', spec: '16 · 1.5 · 400', sample: 'We will call you in about a minute to understand the problem.' },
  { name: 'Small', className: 'text-sm', spec: '14 · 1.45 · 400', sample: 'Visiting charge is adjusted in the final bill.' },
  { name: 'Caption', className: 'text-caption', spec: '12 · 1.35 · 500', sample: 'Updated 2 min ago' },
  { name: 'Overline', className: 'text-overline uppercase', spec: '12 · 0.06em · 650', sample: 'Service request' },
  { name: 'Button', className: 'text-button', spec: '15 · 1.35 · 650', sample: 'Confirm booking' },
  { name: 'Stat', className: 'text-stat tabular-nums', spec: '28→32 · tabular', sample: '₹1,24,500' },
  { name: 'Stat small', className: 'text-stat-sm tabular-nums', spec: '22 · tabular', sample: 'SR-10234' },
] as const;

export const INDIC_SAMPLES = [
  { lang: 'te', label: 'Telugu', sample: 'మీ ఏసీలో సమస్య ఏమిటి? మా టెక్నీషియన్ త్వరలో వస్తారు.' },
  { lang: 'hi', label: 'Hindi', sample: 'आपके एसी में क्या समस्या है? हमारे तकनीशियन जल्द ही पहुँचेंगे।' },
] as const;

export const SPACING_STEPS = [
  { step: 1, px: 4, className: 'w-1' },
  { step: 2, px: 8, className: 'w-2' },
  { step: 3, px: 12, className: 'w-3' },
  { step: 4, px: 16, className: 'w-4' },
  { step: 5, px: 20, className: 'w-5' },
  { step: 6, px: 24, className: 'w-6' },
  { step: 8, px: 32, className: 'w-8' },
  { step: 10, px: 40, className: 'w-10' },
  { step: 12, px: 48, className: 'w-12' },
  { step: 16, px: 64, className: 'w-16' },
  { step: 20, px: 80, className: 'w-20' },
] as const;

export const RADIUS_SPECIMENS = [
  { name: 'sm · 6', className: 'rounded-sm', usage: 'Checkbox, small chips' },
  { name: 'control · 10', className: 'rounded-control', usage: 'Buttons, inputs' },
  { name: 'card · 14', className: 'rounded-card', usage: 'Cards, panels' },
  { name: 'sheet · 20', className: 'rounded-sheet', usage: 'Modals, bottom sheets' },
  { name: 'pill', className: 'rounded-pill', usage: 'Badges, chips' },
] as const;

export const SHADOW_SPECIMENS = [
  { name: 'xs', className: 'shadow-xs', usage: 'Segmented active tab' },
  { name: 'sm', className: 'shadow-sm', usage: 'Elevated card' },
  { name: 'md', className: 'shadow-md', usage: 'Hover lift, popovers' },
  { name: 'lg', className: 'shadow-lg', usage: 'Sheets, modals, toasts' },
] as const;

export const DEMO_SERVICES = [
  { code: 'AC', title: 'AC repair & service', description: 'Not cooling, leaks, noise, gas refill', price: 349 },
  { code: 'FRIDGE', title: 'Refrigerator', description: 'Not cooling, ice build-up, noise', price: 299 },
  { code: 'WASHER', title: 'Washing machine', description: 'Not spinning, leaking, error codes', price: 299 },
  { code: 'TV', title: 'Television', description: 'No display, no sound, lines on screen', price: 349 },
  { code: 'MICROWAVE', title: 'Microwave', description: 'Not heating, sparking, buttons', price: 249 },
] as const;

export const DEMO_ISSUES = [
  { value: 'not-cooling', title: 'Not cooling', description: 'Runs, but the air is not cold' },
  { value: 'water-leak', title: 'Water leaking', description: 'Dripping from the indoor unit' },
  { value: 'noise', title: 'Strange noise', description: 'Rattling, buzzing or clicking' },
  { value: 'not-sure', title: "I'm not sure", description: "We'll figure it out on the call" },
] as const;

export const CUSTOMER_TRACKING_STEPS: TimelineStep[] = [
  { id: 'confirmed', title: 'Request confirmed', timestamp: '9:12 AM', state: 'complete', description: 'SR-10234 · AC not cooling' },
  { id: 'assigned', title: 'Technician assigned', timestamp: '9:20 AM', state: 'complete', description: 'Ravi Kumar will handle your service' },
  { id: 'en-route', title: 'On the way', timestamp: '10:05 AM', state: 'current', description: 'Arriving in about 25 min' },
  { id: 'inspection', title: 'Inspection & estimate', state: 'upcoming', description: 'You approve the price before any repair starts' },
  { id: 'repair', title: 'Repair', state: 'upcoming' },
  { id: 'completed', title: 'Completed', state: 'upcoming' },
];

export const PARTS_DELAY_STEPS: TimelineStep[] = [
  { id: 'confirmed', title: 'Request confirmed', state: 'complete' },
  { id: 'assigned', title: 'Technician assigned', state: 'complete' },
  { id: 'en-route', title: 'On the way', state: 'complete' },
  { id: 'inspection', title: 'Inspection & estimate', state: 'complete' },
  { id: 'repair', title: 'Waiting for a spare part', state: 'attention', description: 'Compressor ordered · expected Thu, 8 Oct' },
  { id: 'completed', title: 'Completed', state: 'upcoming' },
];

export const ADMIN_ACTIVITY_STEPS: TimelineStep[] = [
  { id: 'a5', title: 'Ravi marked En route', timestamp: '10:05', state: 'current', description: 'GPS 3.1 km from customer' },
  { id: 'a4', title: 'Ravi accepted the offer', timestamp: '09:20', state: 'complete', description: 'Responded in 1 min 40 s' },
  { id: 'a3', title: 'Offered to Ravi Kumar (rank 1)', timestamp: '09:18', state: 'complete', description: 'Match score 86 · 3.1 km' },
  { id: 'a2', title: 'Auto-approved by AI', timestamp: '09:12', state: 'complete', description: 'Confidence 92' },
  { id: 'a1', title: 'Lead from Meta ad', timestamp: '09:10', state: 'complete', description: 'Campaign: Summer AC — Kondapur' },
];

export const DEMO_CONFIDENCE_CHECKS: ConfidenceCheck[] = [
  { label: 'Intent is a service request', points: 15, max: 15 },
  { label: 'Customer confirmed the read-back', points: 20, max: 20 },
  { label: 'Category & issue matched', points: 15, max: 15 },
  { label: 'Pincode is serviceable', points: 10, max: 10 },
  { label: 'Address complete', points: 0, max: 10 },
  { label: 'Preferred slot captured', points: 5, max: 5 },
  { label: 'Phone verified by call', points: 10, max: 10 },
  { label: 'No negative signals', points: 5, max: 5 },
  { label: 'Model confidence', points: 9, max: 10 },
];
