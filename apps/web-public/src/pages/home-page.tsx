import { Button, Card, Container, Heading, Stack, Text } from '@servicepro/ui';
import { MessageCircle, Phone } from 'lucide-react';

import { SUPPORT_PHONE, whatsappLink } from '../config';
import { SiteHeader } from './site-header';

/** Placeholder home until Phase 2 landing pages: points people to their tracking link. */
export function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Container size="prose" className="py-12">
          <Stack gap={6}>
            <Heading level={1} size="display">
              Appliance repair, sorted.
            </Heading>
            <Text variant="body-lg" tone="secondary">
              Already booked? Open the tracking link from your WhatsApp message to see who's coming and when.
            </Text>
            {SUPPORT_PHONE ? (
              <Card className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="sm:flex-1">
                  <a href={`tel:${SUPPORT_PHONE}`}>
                    <Phone aria-hidden /> Call to book
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="sm:flex-1">
                  <a href={whatsappLink('Hi, I need an appliance repaired.')} target="_blank" rel="noreferrer">
                    <MessageCircle aria-hidden /> WhatsApp us
                  </a>
                </Button>
              </Card>
            ) : null}
          </Stack>
        </Container>
      </main>
    </>
  );
}
