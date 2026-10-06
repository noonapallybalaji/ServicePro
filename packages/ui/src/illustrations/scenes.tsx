import type { ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Sparkle } from './appliance-art';

/*
 * Larger original illustrations: hero scenes and empty-state spots. Decorative only
 * (aria-hidden) — the heading next to them carries the meaning. No text inside the
 * artwork, so nothing needs translating.
 */

const C = {
  white: 'var(--surface)',
  ink: 'var(--art-ink)',
  skin: 'var(--art-skin)',
  skinShade: 'var(--art-skin-shade)',
  hair: 'var(--art-hair)',
  metal: 'var(--art-metal)',
  uniform: 'var(--primary)',
  uniformDark: 'var(--petrol-800)',
  accent: 'var(--accent)',
  rating: 'var(--rating)',
  sky: 'var(--hue-sky)',
  skySubtle: 'var(--hue-sky-subtle)',
  mint: 'var(--hue-mint)',
  mintSubtle: 'var(--hue-mint-subtle)',
  violet: 'var(--hue-violet)',
  violetSubtle: 'var(--hue-violet-subtle)',
  indigo: 'var(--hue-indigo)',
  indigoSubtle: 'var(--hue-indigo-subtle)',
  orange: 'var(--hue-orange)',
  orangeSubtle: 'var(--hue-orange-subtle)',
} as const;

interface ArtProps {
  className?: string;
}

function Star({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
  return <polygon points={points} fill={C.rating} />;
}

/** A friendly technician with a toolbox, between a fridge and a washing machine. */
export function TechnicianScene({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 400 320" aria-hidden focusable="false" className={cn('shrink-0', className)}>
      <circle cx="200" cy="168" r="142" fill={C.skySubtle} />
      <circle cx="200" cy="168" r="112" fill={C.white} opacity="0.55" />
      <ellipse cx="200" cy="296" rx="168" ry="12" fill={C.ink} opacity="0.1" />

      {/* Fridge */}
      <rect x="44" y="132" width="70" height="160" rx="12" fill={C.white} stroke={C.ink} strokeWidth="3.5" />
      <path d="M44 186h70" stroke={C.ink} strokeWidth="3.5" />
      <rect x="53" y="146" width="6" height="26" rx="3" fill={C.mint} />
      <rect x="53" y="198" width="6" height="40" rx="3" fill={C.mint} />
      <circle cx="96" cy="152" r="6" fill={C.accent} />
      <rect x="82" y="214" width="20" height="16" rx="3" fill={C.mintSubtle} stroke={C.ink} strokeWidth="2.5" />

      {/* Washing machine */}
      <rect x="284" y="186" width="84" height="106" rx="12" fill={C.white} stroke={C.ink} strokeWidth="3.5" />
      <path d="M284 210h84" stroke={C.ink} strokeWidth="3.5" />
      <circle cx="298" cy="198" r="4.5" fill={C.indigo} />
      <circle cx="312" cy="198" r="4.5" fill={C.accent} />
      <circle cx="326" cy="252" r="28" fill={C.indigoSubtle} stroke={C.ink} strokeWidth="3.5" />
      <circle cx="326" cy="252" r="19" fill={C.indigo} />
      <circle cx="318" cy="244" r="4" fill={C.white} opacity="0.9" />

      {/* Technician — legs and shoes */}
      <rect x="181" y="214" width="17" height="72" rx="7" fill={C.uniformDark} />
      <rect x="203" y="214" width="17" height="72" rx="7" fill={C.uniformDark} />
      <rect x="173" y="279" width="27" height="12" rx="6" fill={C.ink} />
      <rect x="202" y="279" width="27" height="12" rx="6" fill={C.ink} />

      {/* Left arm carrying the toolbox */}
      <rect x="153" y="140" width="17" height="72" rx="8.5" fill={C.uniform} transform="rotate(10 161 140)" />
      <circle cx="152" cy="214" r="9" fill={C.skin} />
      <path d="M136 216v-8a6 6 0 0 1 6-6h20a6 6 0 0 1 6 6v8" fill="none" stroke={C.ink} strokeWidth="3.5" />
      <rect x="114" y="214" width="76" height="44" rx="7" fill={C.accent} stroke={C.ink} strokeWidth="3.5" />
      <rect x="114" y="228" width="76" height="6" fill={C.ink} opacity="0.18" />
      <rect x="145" y="224" width="14" height="14" rx="3.5" fill={C.white} stroke={C.ink} strokeWidth="2.5" />

      {/* Body */}
      <path d="M168 154c0-19 12-28 26-28h12c14 0 26 9 26 28v66h-64z" fill={C.uniform} />
      <path d="M190 126l10 16 10-16" fill={C.white} />
      <rect x="211" y="154" width="14" height="9" rx="2" fill={C.accent} />
      <path d="M168 196h64" stroke={C.uniformDark} strokeWidth="3" />

      {/* Right arm raised, holding a wrench */}
      <rect x="227" y="94" width="17" height="62" rx="8.5" fill={C.uniform} transform="rotate(22 236 150)" />
      <circle cx="257" cy="98" r="9.5" fill={C.skin} />
      <g transform="rotate(-28 262 74)">
        <rect x="258" y="58" width="9" height="38" rx="4.5" fill={C.metal} stroke={C.ink} strokeWidth="2.5" />
        <path d="M253 50a12 12 0 1 0 19 0l-4 8h-11z" fill={C.metal} stroke={C.ink} strokeWidth="2.5" strokeLinejoin="round" />
      </g>

      {/* Head */}
      <rect x="192" y="114" width="16" height="16" rx="4" fill={C.skinShade} />
      <circle cx="176" cy="100" r="6" fill={C.skin} />
      <circle cx="224" cy="100" r="6" fill={C.skin} />
      <circle cx="200" cy="98" r="25" fill={C.skin} />
      <path d="M175 92c0-16 11-26 25-26s25 10 25 26z" fill={C.accent} />
      <path d="M198 88h34a5 5 0 0 1 0 10h-34z" fill={C.accent} stroke={C.ink} strokeWidth="2" opacity="0.95" />
      <path d="M175 92h50" stroke={C.ink} strokeWidth="2.5" opacity="0.35" />
      <circle cx="191" cy="104" r="2.8" fill={C.ink} />
      <circle cx="209" cy="104" r="2.8" fill={C.ink} />
      <path d="M192 113q8 7 16 0" fill="none" stroke={C.ink} strokeWidth="2.8" strokeLinecap="round" />

      {/* Floating trust chips */}
      <g>
        <rect x="40" y="64" width="98" height="34" rx="17" fill={C.white} />
        <rect x="40" y="64" width="98" height="34" rx="17" fill="none" stroke={C.ink} strokeWidth="2" opacity="0.12" />
        <Star x={60} y={81} />
        <Star x={79} y={81} />
        <Star x={98} y={81} />
        <Star x={117} y={81} />
      </g>
      <g>
        <circle cx="318" cy="98" r="26" fill={C.mint} />
        <path d="M306 98l8 8 16-17" fill="none" stroke={C.white} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g>
        <path d="M352 150c0 15-17 30-17 30s-17-15-17-30a17 17 0 0 1 34 0z" fill={C.violet} />
        <circle cx="335" cy="150" r="6.5" fill={C.white} />
      </g>
      <Sparkle x={150} y={44} size={9} />
      <Sparkle x={270} y={36} size={6} fill={C.sky} />
      <Sparkle x={366} y={60} size={7} fill={C.orange} />
      <Sparkle x={30} y={200} size={7} fill={C.violet} />
    </svg>
  );
}

export type SpotKind = 'inbox' | 'calendar' | 'wallet' | 'done' | 'search';

/** Small empty-state illustrations (120×120). */
export function SpotArt({ kind, className }: ArtProps & { kind: SpotKind }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable="false" className={cn('shrink-0', className)}>
      <path d="M60 8c27 0 50 16 52 44s-14 58-49 60S8 94 8 62 33 8 60 8z" fill={SPOT_BACKDROP[kind]} />
      {SPOTS[kind]}
    </svg>
  );
}

const SPOT_BACKDROP: Record<SpotKind, string> = {
  inbox: C.violetSubtle,
  calendar: C.skySubtle,
  wallet: C.orangeSubtle,
  done: C.mintSubtle,
  search: C.indigoSubtle,
};

const SPOTS: Record<SpotKind, ReactNode> = {
  inbox: (
    <>
      <rect x="34" y="22" width="52" height="40" rx="6" fill={C.white} stroke={C.ink} strokeWidth="3" transform="rotate(-8 60 42)" />
      <path d="M38 30l22 16 22-16" fill="none" stroke={C.violet} strokeWidth="3" strokeLinejoin="round" transform="rotate(-8 60 42)" />
      <path d="M18 66l12-18h60l12 18v26a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8z" fill={C.violet} stroke={C.ink} strokeWidth="3" strokeLinejoin="round" />
      <path d="M18 66h24a18 18 0 0 0 36 0h24" fill="none" stroke={C.ink} strokeWidth="3" strokeLinejoin="round" />
      <Sparkle x={98} y={22} />
      <Sparkle x={22} y={34} size={4} fill={C.sky} />
    </>
  ),
  calendar: (
    <>
      <rect x="22" y="26" width="76" height="72" rx="10" fill={C.white} stroke={C.ink} strokeWidth="3" />
      <path d="M22 36a10 10 0 0 1 10-10h56a10 10 0 0 1 10 10v12H22z" fill={C.sky} stroke={C.ink} strokeWidth="3" />
      <rect x="38" y="18" width="6" height="16" rx="3" fill={C.ink} />
      <rect x="76" y="18" width="6" height="16" rx="3" fill={C.ink} />
      {[34, 52, 70].map((x) => (
        <rect key={x} x={x} y="58" width="12" height="9" rx="2.5" fill={C.skySubtle} />
      ))}
      <rect x="34" y="74" width="12" height="9" rx="2.5" fill={C.skySubtle} />
      <circle cx="80" cy="84" r="16" fill={C.mint} stroke={C.ink} strokeWidth="3" />
      <path d="M73 84l5 5 9-10" fill="none" stroke={C.white} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Sparkle x={104} y={24} />
    </>
  ),
  wallet: (
    <>
      <circle cx="78" cy="30" r="13" fill={C.rating} stroke={C.ink} strokeWidth="3" />
      <path d="M74 25h9M74 30h9M78 30l-4 6" fill="none" stroke={C.ink} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 46a10 10 0 0 1 10-10h50l6 10z" fill={C.orange} stroke={C.ink} strokeWidth="3" strokeLinejoin="round" />
      <rect x="20" y="44" width="80" height="54" rx="10" fill={C.orange} stroke={C.ink} strokeWidth="3" />
      <path d="M100 62H80a9 9 0 0 0 0 18h20z" fill={C.white} stroke={C.ink} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="82" cy="71" r="3.5" fill={C.ink} />
      <Sparkle x={104} y={40} size={5} fill={C.violet} />
      <Sparkle x={24} y={26} />
    </>
  ),
  done: (
    <>
      <rect x="28" y="20" width="64" height="82" rx="9" fill={C.white} stroke={C.ink} strokeWidth="3" />
      <rect x="46" y="14" width="28" height="12" rx="4" fill={C.mint} stroke={C.ink} strokeWidth="3" />
      {[44, 58, 72].map((y) => (
        <g key={y}>
          <circle cx="42" cy={y} r="4" fill={C.mint} />
          <rect x="52" y={y - 3} width="28" height="6" rx="3" fill={C.mintSubtle} />
        </g>
      ))}
      <circle cx="86" cy="86" r="16" fill={C.mint} stroke={C.ink} strokeWidth="3" />
      <path d="M79 86l5 5 9-10" fill="none" stroke={C.white} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Sparkle x={20} y={30} />
    </>
  ),
  search: (
    <>
      <circle cx="52" cy="52" r="26" fill={C.white} stroke={C.ink} strokeWidth="3" />
      <circle cx="52" cy="52" r="17" fill={C.indigoSubtle} />
      <path d="M71 71l22 22" stroke={C.ink} strokeWidth="9" strokeLinecap="round" />
      <path d="M71 71l22 22" stroke={C.indigo} strokeWidth="4" strokeLinecap="round" />
      <path d="M42 46a12 12 0 0 1 10-8" fill="none" stroke={C.indigo} strokeWidth="3" strokeLinecap="round" />
      <Sparkle x={98} y={26} />
    </>
  ),
};

/** Brand mark: wrench in a rounded tile with a coral spark. */
export function BrandMark({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden focusable="false" className={cn('size-10 shrink-0', className)}>
      <rect width="48" height="48" rx="13" fill="var(--primary)" />
      <rect width="48" height="48" rx="13" fill="url(#brandmark-shine)" />
      <defs>
        <linearGradient id="brandmark-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M30 13a8 8 0 0 0-9.8 9.8L13 30a2.8 2.8 0 0 0 4 4l7.2-7.2A8 8 0 0 0 34 17l-4.7 4.7-3.2-.8-.8-3.2z" fill="#ffffff" />
      <circle cx="35" cy="35" r="4" fill="var(--accent)" />
    </svg>
  );
}

/** Brand mark + product name, for sidebars, sign-in panels and the public header. */
export function BrandLockup({
  name = 'ServicePro',
  tagline,
  className,
  nameClassName,
}: ArtProps & { name?: string; tagline?: string; nameClassName?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-3', className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col">
        <span className={cn('text-h3 font-bold text-foreground', nameClassName)}>{name}</span>
        {tagline ? <span className="text-caption text-foreground-muted">{tagline}</span> : null}
      </span>
    </span>
  );
}
