import { useSession } from '@servicepro/api-client';
import { BrandLockup, Button, Container, Text, getInitials } from '@servicepro/ui';
import { Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
import { Suspense, lazy, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';

import { customerFrom } from '../customer-session';

import { SERVICES, servicePath } from '../content/services';
import { SITE, whatsappLink } from '../site';

const MAIN_NAV = [
  { to: '/services', label: 'Services' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

/** Header, main landmark and footer shared by every public page. */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1 bg-background">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

/** Help is always one tap away (UX-ARCHITECTURE.md §3.1). */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-(--z-header) border-b border-border bg-surface pt-safe">
      <Container className="flex h-header items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 rounded-control" aria-label={`${SITE.name} home`}>
          <BrandLockup name={SITE.name} className="flex" nameClassName="truncate max-sm:text-body" />
        </Link>
        <nav aria-label="Main" className="max-lg:hidden">
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
        <div className="flex shrink-0 items-center gap-2">
          <AccountMenu />
          {SITE.phone ? (
            <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
              <a href={`tel:${SITE.phone}`}>
                <Phone aria-hidden /> Call us
              </a>
            </Button>
          ) : null}
          <Button asChild variant="accent" size="sm">
            <Link to="/book">Book now</Link>
          </Button>
        </div>
      </Container>
    </header>
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

function SiteFooter() {
  return (
    <footer data-surface="brand" className="surface-brand">
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
            {[{ to: '/book', label: 'Book a repair' }, { to: '/account', label: 'My bookings' }, ...MAIN_NAV].map((item) => (
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
