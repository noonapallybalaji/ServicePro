import { useSession } from '@servicepro/api-client';
import { BrandLockup, Button, Container, Text, getInitials } from '@servicepro/ui';
import { ChevronDown, Mail, MapPin, MessageCircle, Phone, UserRound } from 'lucide-react';
import { Suspense, lazy, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

import { customerFrom } from '../customer-session';
import { openLocationPicker, useLocationPicker, useServiceLocation } from '../location/service-location';
import { PinnedSearchBar } from './appliance-search';
import { AssistantLauncher } from './assistant-launcher';
import { NotificationBell } from './notification-bell';
import { MobileActionBar } from './mobile-action-bar';

import { SERVICES, servicePath } from '../content/services';
import { SITE, whatsappLink } from '../site';

const MAIN_NAV = [
  { to: '/services', label: 'Services' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

/** Header, main landmark and footer shared by every public page. */
/**
 * pinnedSearch: on phones and tablets, the appliance search stays under the header while the page
 * scrolls. Only for pages where people choose an appliance (home, services); not on booking, account,
 * tracking, help or policy pages, where it would only take space.
 */
export function SiteLayout({ children, pinnedSearch = false }: { children: ReactNode; pinnedSearch?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {pinnedSearch ? <PinnedSearchBar /> : null}
      <main id="main" className="flex-1 bg-background">
        {children}
      </main>
      <SiteFooter />
      <MobileActionBar />
      <AssistantLauncher />
      <LocationPicker />
    </div>
  );
}

/** Help is always one tap away (UX-ARCHITECTURE.md §3.1). */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-(--z-header) border-b border-border bg-surface pt-safe">
      <Container className="flex h-header items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/" className="flex shrink-0 rounded-control" aria-label={`${SITE.name} home`}>
            <BrandLockup name={SITE.name} className="flex" nameClassName="truncate max-sm:sr-only" />
          </Link>
          <LocationChip />
        </div>
        <nav aria-label="Main" className="max-[80rem]:hidden">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className="transition-interactive inline-flex h-10 items-center rounded-control px-3 text-sm font-semibold text-foreground-secondary hover:bg-surface-sunken hover:text-foreground aria-[current=page]:text-primary"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell />
          <AccountMenu />
        </div>
      </Container>
    </header>
  );
}

// The picker (and the dialog code) loads only when it is first opened.
const LocationDialogHost = lazy(() => import('../location/location-dialog').then((m) => ({ default: m.LocationDialogHost })));

function LocationPicker() {
  return useLocationPicker() ? (
    <Suspense fallback={null}>
      <LocationDialogHost />
    </Suspense>
  ) : null;
}

/** Where we'd send the technician: tap to set or change it (checked against our service areas). */
function LocationChip() {
  const location = useServiceLocation();
  const place = location ? (location.locality ?? location.areas[0]) : undefined;
  return (
    <button
      type="button"
      onClick={() => openLocationPicker()}
      className="transition-interactive flex min-w-0 max-w-[11rem] items-center gap-1 lg:shrink-0 rounded-control px-2 py-1 text-left hover:bg-surface-sunken sm:max-w-[16rem]"
      aria-label={location ? `Service location ${place ? `${place}, ` : ''}${location.pincode}. Change location` : 'Choose your location'}
    >
      <MapPin aria-hidden className="size-4 shrink-0 text-primary" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-caption text-foreground-muted">{location ? 'Service at' : 'Your location'}</span>
        <span className="truncate text-sm font-semibold text-foreground">{location ? (place ? `${location.pincode} · ${place}` : location.pincode) : 'Choose location'}</span>
      </span>
      <ChevronDown aria-hidden className="size-4 shrink-0 text-foreground-muted" />
    </button>
  );
}

/** Signed in: avatar with the account menu (loaded on demand). Otherwise a sign-in link to "My bookings". */
function AccountMenu() {
  const customer = customerFrom(useSession());

  if (!customer) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/account">
          <UserRound aria-hidden />
          <span className="max-sm:sr-only">Sign in</span>
        </Link>
      </Button>
    );
  }

  return (
    <Suspense fallback={<span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{getInitials(customer.fullName)}</span>}>
      <SignedInMenu fullName={customer.fullName} phone={customer.phone} />
    </Suspense>
  );
}

// The dropdown (and its positioning code) only loads for signed-in customers.
const SignedInMenu = lazy(() => import('./account-menu').then((m) => ({ default: m.SignedInMenu })));

const footerLink = 'transition-interactive inline-flex min-h-10 items-center text-sm text-foreground-secondary hover:text-foreground hover:underline';

const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/cancellation-and-refunds', label: 'Cancellation & refunds' },
];

/**
 * Phones and tablets get the bottom action bar instead of the full footer (it stays in the HTML for
 * crawlers); only one line of policy and help links remains, as policies must be reachable everywhere.
 */
function SiteFooter() {
  return (
    <>
      <nav aria-label="Policies and help" className="border-t border-border bg-surface lg:hidden">
        <ul className="mx-auto flex max-w-content flex-wrap justify-center gap-x-4 px-4 py-2">
          {[...LEGAL_LINKS, { to: '/help', label: 'Help' }].map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="inline-flex min-h-10 items-center text-caption text-foreground-secondary hover:text-foreground hover:underline">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <SiteFooterFull />
    </>
  );
}

function SiteFooterFull() {
  return (
    <footer data-surface="brand" className="surface-brand max-lg:hidden">
      <Container className="grid grid-cols-1 gap-10 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <BrandLockup name={SITE.name} />
          <Text variant="sm" tone="secondary" className="max-w-prose">
            Home appliance repair at your doorstep in {SITE.city}, {SITE.region}.
          </Text>
          {SITE.phone ? (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild variant="inverse">
                <a href={`tel:${SITE.phone}`}>
                  <Phone aria-hidden /> {SITE.phone}
                </a>
              </Button>
              <Button asChild variant="accent">
                <a href={whatsappLink('Hi!')} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden /> WhatsApp
                </a>
              </Button>
            </div>
          ) : null}
          {SITE.email ? (
            <a href={`mailto:${SITE.email}`} className={`${footerLink} gap-2`}>
              <Mail aria-hidden className="size-4" /> {SITE.email}
            </a>
          ) : null}
          <ul className="flex flex-wrap gap-x-4 pt-2">
            {LEGAL_LINKS.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={footerLink}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-labelledby="footer-services">
          <h2 id="footer-services" className="text-overline uppercase text-foreground-muted">
            Services
          </h2>
          <ul className="mt-3 flex flex-col">
            {SERVICES.map((service) => (
              <li key={service.slug}>
                <Link to={servicePath(service)} className={footerLink}>
                  {service.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-company">
          <h2 id="footer-company" className="text-overline uppercase text-foreground-muted">
            Company
          </h2>
          <ul className="mt-3 flex flex-col">
            {[{ to: '/book', label: 'Book a repair' }, { to: '/account', label: 'My bookings' }, { to: '/help', label: 'Help centre' }, ...MAIN_NAV].map((item) => (
              <li key={item.to}>
                <Link to={item.to} className={footerLink}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  );
}
