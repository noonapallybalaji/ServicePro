import { Button, Container } from '@servicepro/ui';
import { Phone } from 'lucide-react';

import { BUSINESS_NAME, SUPPORT_PHONE } from '../config';

/** Help is always one tap away (UX-ARCHITECTURE.md §3.1). */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-surface pt-safe">
      <Container size="prose" className="flex h-header items-center justify-between gap-3">
        <span className="text-h3 text-foreground">{BUSINESS_NAME}</span>
        {SUPPORT_PHONE ? (
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${SUPPORT_PHONE}`}>
              <Phone aria-hidden /> Call us
            </a>
          </Button>
        ) : null}
      </Container>
    </header>
  );
}
