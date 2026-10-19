import { cn } from '@servicepro/ui';
import { ListChecks, Menu, MessageCircle, Phone, Smartphone, Wrench } from 'lucide-react';
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

import { openLocationPicker, useServiceLocation } from '../location/service-location';
import { SITE, whatsappLink } from '../site';

// The sheets (and the dialog code) load only when one is opened.
const ActionSheet = lazy(() => import('./action-sheets'));

/** Screens with their own fixed action (the booking steps) don't get the bar (or the assistant button) on top of it. */
const HIDDEN_ON = ['/book'];

export const isBarHidden = (pathname: string) => HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * App-style actions fixed to the bottom of phones and tablets: Call, WhatsApp, Request (centre),
 * App (coming soon) and More (help, bookings, chat, the other pages). Desktop keeps these in the header. The bar steps aside while the
 * keyboard is open, and a spacer under the page keeps it from ever covering content.
 */
export function MobileActionBar() {
  const { pathname } = useLocation();
  const typing = useTyping();
  const [sheet, setSheet] = useState<'app' | 'more' | null>(null);
  const startRequest = useStartRequest();

  if (isBarHidden(pathname)) return null;

  const whatsapp = whatsappLink('Hi, I need an appliance repaired.');

  return (
    <>
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden" />
      <nav
        aria-label="Quick actions"
        className={cn(
          'fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur lg:hidden',
          typing && 'hidden',
        )}
      >
        <ul className="mx-auto grid h-16 max-w-content grid-cols-5 items-stretch px-1">
          <li>{SITE.phone ? <BarLink href={`tel:${SITE.phone}`} icon={<Phone aria-hidden />} label="Call" /> : <BarRouterLink to="/help" icon={<MessageCircle aria-hidden />} label="Help" />}</li>
          <li>{whatsapp ? <BarLink href={whatsapp} external icon={<MessageCircle aria-hidden />} label="WhatsApp" /> : <BarRouterLink to="/account" icon={<ListChecks aria-hidden />} label="Track" />}</li>
          <li className="relative flex justify-center">
            <button
              type="button"
              onClick={startRequest}
              className="pressable transition-interactive absolute -top-5 flex size-16 flex-col items-center justify-center gap-1 rounded-full border-4 border-surface bg-accent text-accent-foreground shadow-lg [&_svg]:size-6"
            >
              <Wrench aria-hidden />
              <span className="sr-only">Request a repair</span>
            </button>
            <span aria-hidden className="mt-auto pb-2 text-caption font-semibold text-foreground">
              Request
            </span>
          </li>
          <li>
            <BarButton icon={<Smartphone aria-hidden />} label="App" onClick={() => setSheet('app')} />
          </li>
          <li>
            <BarButton icon={<Menu aria-hidden />} label="More" onClick={() => setSheet('more')} />
          </li>
        </ul>
      </nav>

      {sheet ? (
        <Suspense fallback={null}>
          <ActionSheet kind={sheet} onClose={() => setSheet(null)} onRequest={startRequest} />
        </Suspense>
      ) : null}
    </>
  );
}

/** "Request" starts the booking, asking for the location first if we don't have one yet. */
export function useStartRequest(): () => void {
  const navigate = useNavigate();
  const location = useServiceLocation();
  return () => (location ? void navigate('/book') : openLocationPicker({ then: '/book' }));
}

const ITEM =
  'transition-interactive flex h-full w-full flex-col items-center justify-center gap-1 rounded-control text-caption font-semibold text-foreground-secondary hover:text-foreground [&_svg]:size-5';

function BarLink({ href, icon, label, external = false }: { href: string; icon: ReactNode; label: string; external?: boolean }) {
  return (
    <a href={href} className={ITEM} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {icon}
      {label}
    </a>
  );
}

function BarRouterLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className={ITEM}>
      {icon}
      {label}
    </Link>
  );
}

function BarButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={ITEM}>
      {icon}
      {label}
    </button>
  );
}

/** True while a text field has focus: on phones that's when the keyboard is up. */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) &&
      !(target instanceof HTMLInputElement && ['checkbox', 'radio', 'button', 'submit', 'file', 'range'].includes(target.type));
    const onFocusIn = (event: FocusEvent) => isField(event.target) && setTyping(true);
    const onFocusOut = () => setTyping(false);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);
  return typing;
}
