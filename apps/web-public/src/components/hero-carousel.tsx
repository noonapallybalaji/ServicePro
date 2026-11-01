import { cn, formatINR, usePrefersReducedMotion } from '@servicepro/ui';
import { ArrowRight, ChevronLeft, ChevronRight, MapPinned, Pause, Play, ShieldCheck, Wallet } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';

import { SITE, whatsappLink } from '../site';
import { useBookAppliance, type Appliance } from './appliance-search';
import { useStartRequest } from './mobile-action-bar';

/*
 * The home page's banner carousel (WCAG 2.2.2 pattern): advances every few seconds, pauses while
 * pointed at, focused, hidden or paused with its button, and not at all for reduced motion. Swipe
 * (scroll snap) on phones, arrows on larger screens, dots and a "2 / 5" counter. Slides have the hero
 * artwork's 1752 × 897 shape, and a wider 12 × 5 on desktop so the banner isn't taller than the
 * screen (the artwork then sits centred on a blurred copy of itself). The designed slides scale with
 * the banner (cqw units), so they look the same on every screen.
 */

const INTERVAL_MS = 5500;

interface Slide {
  key: string;
  /** For screen readers: what the slide is about. */
  label: string;
  content: ReactNode;
}

export function HeroCarousel({ appliances }: { appliances: Appliance[] }) {
  const slides = useSlides(appliances);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // the pause button
  const [held, setHeld] = useState(false); // pointer over it or focus inside
  const reducedMotion = usePrefersReducedMotion();

  const goTo = useCallback((next: number) => {
    const el = track.current;
    if (!el) return;
    const count = el.children.length;
    const target = ((next % count) + count) % count;
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
  }, []);

  // The slide in view follows the scroll position, whether moved by swipe, arrows, dots or the timer.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const playing = !paused && !held && !reducedMotion;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') goTo(index + 1);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, index, goTo]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offers and highlights"
      className="group/carousel relative"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
    >
      <div
        ref={track}
        aria-live={playing ? 'off' : 'polite'}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-card shadow-lg motion-safe:scroll-smooth"
      >
        {slides.map((slide, i) => (
          <div
            key={slide.key}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}: ${slide.label}`}
            aria-hidden={i !== index || undefined}
            inert={i !== index || undefined}
            className="@container relative aspect-[1752/897] w-full shrink-0 snap-center snap-always overflow-hidden lg:aspect-[12/5]"
          >
            {slide.content}
          </div>
        ))}
      </div>

      {/* Counter and pause, top right. */}
      <div className="absolute top-2 right-2 flex items-center gap-1 sm:top-3 sm:right-3">
        <span className="rounded-pill bg-[#000]/45 px-2 py-[2px] text-caption font-semibold text-[#fff] tabular-nums backdrop-blur-sm">
          {index + 1} / {slides.length}
        </span>
        {reducedMotion ? null : (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Play the slides' : 'Pause the slides'}
            className="transition-interactive flex size-6 items-center justify-center rounded-full bg-[#000]/45 text-[#fff] backdrop-blur-sm hover:bg-[#000]/60 [&_svg]:size-3"
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          </button>
        )}
      </div>

      {/* Arrows: larger screens (phones swipe). */}
      <ArrowButton side="left" onClick={() => goTo(index - 1)} />
      <ArrowButton side="right" onClick={() => goTo(index + 1)} />

      <div className="mt-2 flex justify-center gap-1 sm:mt-3" role="group" aria-label="Choose a slide">
        {slides.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}: ${slide.label}`}
            aria-current={i === index || undefined}
            className="flex h-6 items-center"
          >
            <span className={cn('transition-interactive block h-2 rounded-pill', i === index ? 'w-6 bg-primary' : 'w-2 bg-border-strong')} />
          </button>
        ))}
      </div>
    </section>
  );
}

function ArrowButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous slide' : 'Next slide'}
      className={cn(
        'transition-interactive absolute top-[calc(50%-0.75rem)] flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-[#fff]/90 text-foreground shadow-md hover:bg-[#fff] max-md:hidden [&_svg]:size-5',
        'opacity-0 group-focus-within/carousel:opacity-100 group-hover/carousel:opacity-100',
        side === 'left' ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2',
      )}
    >
      {side === 'left' ? <ChevronLeft aria-hidden /> : <ChevronRight aria-hidden />}
    </button>
  );
}

/* ── Slides ──────────────────────────────────────────────────────────── */

const NAVY = 'bg-[linear-gradient(110deg,#0a1f3c_0%,#0d3558_55%,#0f4f6e_100%)]';

function useSlides(appliances: Appliance[]): Slide[] {
  const startRequest = useStartRequest();
  const book = useBookAppliance();
  const visit = (code: string) => appliances.find((a) => a.code === code)?.visitCharge;
  const whatsapp = whatsappLink('Hi! I need an appliance repaired.');

  const onBook = (event: MouseEvent) => {
    event.preventDefault();
    startRequest();
  };
  const onBookAc = (event: MouseEvent) => {
    event.preventDefault();
    book('AC');
  };
  const acVisit = visit('AC');

  const slides: Slide[] = [
    {
      key: 'hero',
      label: `${SITE.name}: your appliances, fixed at home`,
      content: (
        <Link to="/book" onClick={onBook} className="relative flex size-full justify-center overflow-hidden bg-[#0b2a45]" aria-label="Book a repair">
          {/* Desktop's wider banner: the sides continue the artwork, blurred. */}
          <img src="/brand/hero-960.webp" alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover opacity-80 blur-2xl max-lg:hidden" />
          <picture className="relative h-full lg:[mask-image:linear-gradient(90deg,transparent,#000_5%,#000_95%,transparent)]">
            <source type="image/webp" srcSet="/brand/hero-960.webp 960w, /brand/hero-1752.webp 1752w" sizes="(min-width: 80rem) 76rem, 100vw" />
            <img
              src="/brand/hero-1752.jpg"
              srcSet="/brand/hero-960.jpg 960w, /brand/hero-1752.jpg 1752w"
              sizes="(min-width: 80rem) 76rem, 100vw"
              width={1752}
              height={897}
              alt={`${SITE.name}. Your appliances, fixed at home. Expert repair and service for AC, refrigerator, washing machine, TV and more. Verified technicians, reliable service, quick response, service warranty. Book a repair.`}
              fetchPriority="high"
              className="h-full w-auto max-w-none object-cover max-lg:w-full"
            />
          </picture>
        </Link>
      ),
    },
    {
      key: 'ac',
      label: 'AC service and repair',
      content: (
        <div className={cn('flex size-full items-center text-[#fff]', NAVY)}>
          <div className="flex w-[56%] flex-col gap-[2.2cqw] pl-[5cqw]">
            <Pill>AC service &amp; repair</Pill>
            <SlideTitle>
              Cool again, <span className="text-[#ff8a1f]">fixed at home.</span>
            </SlideTitle>
            <SlideText>Not cooling, water leaks, gas refill, noise or installation: a verified technician at your door.</SlideText>
            <SlideCta to="/book?service=AC" onClick={onBookAc}>
              Book AC repair
            </SlideCta>
          </div>
          <div className="relative flex w-[44%] flex-col items-center gap-[2cqw] pr-[4cqw]">
            <img src="/appliances/ac-cut.webp" alt="" width={560} height={216} className="w-full drop-shadow-2xl" />
            <div className="flex flex-wrap justify-center gap-[1.2cqw]">
              <Chip icon={<ShieldCheck aria-hidden />}>Price before work</Chip>
              {acVisit !== undefined ? <Chip icon={<Wallet aria-hidden />}>Visit {formatINR(acVisit)}</Chip> : null}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'all',
      label: 'All appliances, one service',
      content: (
        <div className="flex size-full flex-col justify-center gap-[2.5cqw] bg-[linear-gradient(120deg,#f4f8fb_0%,#e6eff6_100%)] px-[5cqw] text-[#0a1f3c]">
          <div className="flex items-end justify-between gap-[3cqw]">
            <div className="flex flex-col gap-[1.6cqw]">
              <SlideTitle>
                All appliances. <span className="text-[#f07800]">One service.</span>
              </SlideTitle>
              <SlideText className="text-[#3c5068]">From cooling problems to kitchen appliances, trusted doorstep repair from one place. The visiting charge is part of your final bill.</SlideText>
            </div>
            <SlideCta to="/services">Explore services</SlideCta>
          </div>
          <ul className="grid grid-cols-5 items-start gap-[2cqw]">
            {(
              [
                ['ac', 'AC', 'AC', 'AC'],
                ['fridge', 'FRIDGE', 'Refrigerator', 'Fridge'],
                ['washer', 'WASHER', 'Washing machine', 'Washer'],
                ['tv', 'TV', 'TV', 'TV'],
                ['microwave', 'MICROWAVE', 'Microwave', 'Microwave'],
              ] as const
            ).map(([file, code, name, short]) => (
              <li key={file} className="flex flex-col items-center gap-[1cqw]">
                <span className="flex h-[14cqw] w-full items-end justify-center">
                  <img src={`/appliances/${file}-cut.webp`} alt="" className="max-h-full w-auto max-w-full object-contain drop-shadow-lg" />
                </span>
                <span className="text-center text-[max(0.6rem,1.6cqw)] leading-tight font-semibold">
                  {/* Short names on small banners, so every label stays on one line. */}
                  <span className="@2xl:hidden">{short}</span>
                  <span className="@max-2xl:hidden">{name}</span>
                </span>
                {visit(code) !== undefined ? (
                  <span className="rounded-pill bg-[#fff] px-[1cqw] py-[0.3cqw] text-[max(0.55rem,1.4cqw)] font-bold text-[#c25e00] tabular-nums shadow-sm">
                    Visit {formatINR(visit(code) ?? 0)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    {
      key: 'track',
      label: 'Track your technician live, pay after the repair',
      content: (
        <div className="flex size-full items-center bg-[linear-gradient(110deg,#0b3a4a_0%,#0b6276_100%)] text-[#fff]">
          <div className="flex w-[58%] flex-col gap-[2.2cqw] pl-[5cqw]">
            <Pill>Live tracking</Pill>
            <SlideTitle>
              Know exactly <span className="text-[#ff8a1f]">when we arrive.</span>
            </SlideTitle>
            <SlideText>Follow your technician on the map. See the price before work, and pay only after the repair.</SlideText>
            <SlideCta to="/account">Track my request</SlideCta>
          </div>
          <div className="flex w-[42%] flex-col gap-[1.6cqw] pr-[5cqw]">
            {[
              [<MapPinned key="m" aria-hidden />, 'Live location on the way'],
              [<ShieldCheck key="s" aria-hidden />, 'Price explained before work'],
              [<Wallet key="w" aria-hidden />, 'Pay after the repair'],
            ].map(([icon, text]) => (
              <div
                key={String(text)}
                className="flex items-center gap-[1.4cqw] rounded-[1.4cqw] border border-[#fff]/20 bg-[#fff]/10 px-[2cqw] py-[1.4cqw] text-[max(0.6rem,1.7cqw)] font-semibold backdrop-blur-sm [&_svg]:size-[max(0.85rem,2.4cqw)] [&_svg]:text-[#ff8a1f]"
              >
                {icon}
                {text}
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  if (whatsapp) {
    slides.push({
      key: 'whatsapp',
      label: 'Book a repair on WhatsApp',
      content: (
        <div className="flex size-full items-center bg-[linear-gradient(120deg,#effaf3_0%,#d9f3e3_100%)] text-[#0a1f3c]">
          <div className="flex w-[60%] flex-col gap-[2.2cqw] pl-[5cqw]">
            <Pill className="bg-[#128c4a] text-[#fff]">WhatsApp</Pill>
            <SlideTitle>
              Need a repair? <span className="text-[#128c4a]">Just WhatsApp us.</span>
            </SlideTitle>
            <SlideText className="text-[#3c5068]">Tell us what's wrong or send a photo. We'll help you book a technician.</SlideText>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-[1cqw] rounded-pill bg-[#128c4a] px-[2.6cqw] py-[1.2cqw] text-[max(0.65rem,1.8cqw)] font-bold text-[#fff] shadow-lg hover:bg-[#0f7a40]"
            >
              Chat on WhatsApp <ArrowRight aria-hidden className="size-[max(0.8rem,2cqw)]" />
            </a>
          </div>
          <div className="flex w-[40%] items-end justify-center gap-[1cqw] pr-[4cqw]">
            <img src="/appliances/washer-cut.webp" alt="" className="h-[26cqw] w-auto drop-shadow-xl" />
            <img src="/appliances/fridge-cut.webp" alt="" className="h-[34cqw] w-auto drop-shadow-xl" />
          </div>
        </div>
      ),
    });
  }

  return slides;
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('w-fit rounded-[0.8cqw] bg-[#ff8a1f] px-[1.4cqw] py-[0.5cqw] text-[max(0.55rem,1.35cqw)] font-bold tracking-wide text-[#0a1f3c] uppercase', className)}>
      {children}
    </span>
  );
}

function SlideTitle({ children }: { children: ReactNode }) {
  return <p className="text-[max(1rem,4.6cqw)] leading-[1.05] font-extrabold tracking-tight">{children}</p>;
}

function SlideText({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[max(0.7rem,1.85cqw)] leading-snug text-[#fff]/85 max-sm:hidden', className)}>{children}</p>;
}

function SlideCta({ to, onClick, children }: { to: string; onClick?: (event: MouseEvent) => void; children: ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="inline-flex w-fit shrink-0 items-center gap-[1cqw] rounded-pill bg-[#ff7a00] px-[2.6cqw] py-[1.2cqw] text-[max(0.65rem,1.8cqw)] font-bold text-[#0a1f3c] shadow-lg hover:bg-[#ff8a1f]"
    >
      {children} <ArrowRight aria-hidden className="size-[max(0.8rem,2cqw)]" />
    </Link>
  );
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[0.8cqw] rounded-pill bg-[#fff]/95 px-[1.6cqw] py-[0.7cqw] text-[max(0.55rem,1.4cqw)] font-semibold text-[#0a1f3c] shadow-md [&_svg]:size-[max(0.7rem,1.7cqw)] [&_svg]:text-[#f07800]">
      {icon}
      {children}
    </span>
  );
}
