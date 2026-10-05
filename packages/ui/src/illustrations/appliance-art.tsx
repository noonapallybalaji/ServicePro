import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { HUE_VARS, categoryHue } from '../tokens/hues';

/*
 * Flat, original spot illustrations for each appliance category. Colours come from the
 * category's hue (tokens/hues.ts), so a new hue palette re-colours every drawing.
 * Decorative: the category name is always rendered as text next to the artwork.
 */

interface Palette {
  base: string;
  subtle: string;
  ink: string;
}

const WHITE = 'var(--surface)';
const ACCENT = 'var(--accent)';

/** Four-point sparkle centred on (x, y). */
export function Sparkle({ x, y, size = 6, fill = ACCENT }: { x: number; y: number; size?: number; fill?: string }) {
  const s = size;
  const k = s / 4;
  return <path d={`M${x} ${y - s}L${x + k} ${y - k}L${x + s} ${y}L${x + k} ${y + k}L${x} ${y + s}L${x - k} ${y + k}L${x - s} ${y}L${x - k} ${y - k}Z`} fill={fill} />;
}

const BLOB = 'M60 6c27 0 52 17 54 46s-15 60-50 62S6 96 6 63 33 6 60 6z';

function AirConditioner({ base, subtle, ink }: Palette) {
  return (
    <>
      <rect x="14" y="30" width="92" height="36" rx="10" fill={WHITE} stroke={ink} strokeWidth="3" />
      <rect x="24" y="52" width="72" height="7" rx="3.5" fill={subtle} stroke={ink} strokeWidth="2.5" />
      <circle cx="92" cy="41" r="3.5" fill={base} />
      <rect x="24" y="38" width="22" height="4" rx="2" fill={subtle} />
      {[36, 60, 84].map((x) => (
        <path key={x} d={`M${x} 74q5 6 0 12t0 12`} fill="none" stroke={base} strokeWidth="3.5" strokeLinecap="round" />
      ))}
      <Sparkle x={104} y={20} />
    </>
  );
}

function Television({ base, ink }: Palette) {
  return (
    <>
      <rect x="14" y="24" width="92" height="60" rx="9" fill={ink} />
      <rect x="21" y="31" width="78" height="46" rx="5" fill={base} />
      <path d="M30 72L54 36h10L40 72z" fill={WHITE} opacity="0.28" />
      <path d="M46 72l14-21h6L52 72z" fill={WHITE} opacity="0.18" />
      <path d="M50 84h20l6 12H44z" fill={ink} />
      <rect x="34" y="95" width="52" height="6" rx="3" fill={ink} />
      <Sparkle x={108} y={16} />
    </>
  );
}

function Refrigerator({ base, subtle, ink }: Palette) {
  return (
    <>
      <rect x="32" y="10" width="56" height="96" rx="11" fill={WHITE} stroke={ink} strokeWidth="3" />
      <path d="M32 44h56" stroke={ink} strokeWidth="3" />
      <rect x="39" y="20" width="5" height="16" rx="2.5" fill={base} />
      <rect x="39" y="52" width="5" height="26" rx="2.5" fill={base} />
      <circle cx="74" cy="27" r="5" fill={ACCENT} />
      <rect x="62" y="62" width="16" height="12" rx="2.5" fill={subtle} stroke={ink} strokeWidth="2" />
      <rect x="38" y="104" width="8" height="6" rx="2" fill={ink} />
      <rect x="74" y="104" width="8" height="6" rx="2" fill={ink} />
      <Sparkle x={100} y={22} size={5} />
    </>
  );
}

function WashingMachine({ base, subtle, ink }: Palette) {
  return (
    <>
      <rect x="20" y="12" width="80" height="94" rx="11" fill={WHITE} stroke={ink} strokeWidth="3" />
      <path d="M20 34h80" stroke={ink} strokeWidth="3" />
      <circle cx="32" cy="23" r="4" fill={base} />
      <circle cx="44" cy="23" r="4" fill={ACCENT} />
      <rect x="62" y="20" width="28" height="6" rx="3" fill={subtle} />
      <circle cx="60" cy="70" r="26" fill={subtle} stroke={ink} strokeWidth="3" />
      <circle cx="60" cy="70" r="18" fill={base} />
      <path d="M42 72q9-7 18 0t18 0v4a18 18 0 0 1-36 0z" fill={ink} opacity="0.22" />
      <circle cx="53" cy="63" r="3.5" fill={WHITE} opacity="0.9" />
      <circle cx="64" cy="58" r="2" fill={WHITE} opacity="0.9" />
      <Sparkle x={108} y={14} size={5} />
    </>
  );
}

function Microwave({ base, subtle, ink }: Palette) {
  return (
    <>
      {[44, 58, 72].map((x) => (
        <path key={x} d={`M${x} 26q-4-5 0-10t0-10`} fill="none" stroke={base} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      ))}
      <rect x="10" y="32" width="100" height="62" rx="10" fill={WHITE} stroke={ink} strokeWidth="3" />
      <rect x="18" y="40" width="62" height="46" rx="6" fill={ink} />
      <rect x="23" y="45" width="52" height="36" rx="4" fill={base} />
      <ellipse cx="49" cy="74" rx="16" ry="4" fill={WHITE} opacity="0.35" />
      <rect x="87" y="42" width="15" height="9" rx="2.5" fill={subtle} stroke={ink} strokeWidth="2" />
      <circle cx="94.5" cy="62" r="4.5" fill={base} />
      <circle cx="94.5" cy="77" r="4.5" fill={ACCENT} />
      <rect x="20" y="94" width="10" height="5" rx="2" fill={ink} />
      <rect x="90" y="94" width="10" height="5" rx="2" fill={ink} />
    </>
  );
}

function Toolbox({ base, ink }: Palette) {
  return (
    <>
      <path d="M46 48V38a7 7 0 0 1 7-7h14a7 7 0 0 1 7 7v10" fill="none" stroke={ink} strokeWidth="4" />
      <rect x="18" y="46" width="84" height="52" rx="9" fill={base} stroke={ink} strokeWidth="3" />
      <rect x="18" y="62" width="84" height="7" fill={ink} opacity="0.18" />
      <rect x="53" y="57" width="14" height="14" rx="3.5" fill={WHITE} stroke={ink} strokeWidth="2.5" />
      <Sparkle x={104} y={24} />
    </>
  );
}

const DRAWINGS: Record<string, (p: Palette) => ReactNode> = {
  AC: AirConditioner,
  TV: Television,
  FRIDGE: Refrigerator,
  WASHER: WashingMachine,
  MICROWAVE: Microwave,
};

interface ApplianceArtProps {
  /** `service_categories.code`; unknown codes draw a toolbox. */
  code: string | null | undefined;
  /** Soft blob behind the appliance. Off when the art sits on its own tinted tile. */
  backdrop?: boolean;
  className?: string;
}

export function ApplianceArt({ code, backdrop = true, className }: ApplianceArtProps) {
  const hue = HUE_VARS[categoryHue(code)];
  const palette: Palette = { base: hue.base, subtle: hue.subtle, ink: hue.foreground };
  const Drawing = (code && DRAWINGS[code]) || Toolbox;
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable="false" className={cn('shrink-0', className)}>
      {backdrop ? <path d={BLOB} fill={hue.subtle} /> : null}
      {Drawing(palette)}
    </svg>
  );
}
