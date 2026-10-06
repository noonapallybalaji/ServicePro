import { BrandLockup, Button, Container, Text } from '@servicepro/ui';
import { MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router';

import { BUSINESS_NAME, SUPPORT_PHONE, whatsappLink } from '../config';

/** Help is always one tap away (UX-ARCHITECTURE.md §3.1). */
export function SiteHeader({ size = 'content' }: { size?: 'content' | 'prose' }) {
  return (
    <header className="sticky top-0 z-(--z-header) border-b border-border bg-surface pt-safe">
      <Container size={size} className="flex h-header items-center justify-between gap-3">
        <Link to="/" className="rounded-control">
          <BrandLockup name={BUSINESS_NAME} />
        </Link>
        <div className="flex items-center gap-2">
          {SUPPORT_PHONE ? (
            <Button asChild variant="ghost" size="sm" className="max-sm:hidden">
              <a href={`tel:${SUPPORT_PHONE}`}>
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

export function SiteFooter() {
  return (
    <footer data-surface="brand" className="surface-brand">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <BrandLockup name={BUSINESS_NAME} />
          <Text variant="sm" tone="muted">
            Home appliance repair at your doorstep.
          </Text>
        </div>
        {SUPPORT_PHONE ? (
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="inverse">
              <a href={`tel:${SUPPORT_PHONE}`}>
                <Phone aria-hidden /> {SUPPORT_PHONE}
              </a>
            </Button>
            <Button asChild variant="accent">
              <a href={whatsappLink('Hi!')} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden /> WhatsApp
              </a>
            </Button>
          </div>
        ) : null}
      </Container>
    </footer>
  );
}
