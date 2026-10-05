import {
  AiBadge,
  AiSummary,
  Button,
  CATEGORY_ICONS,
  Card,
  ConfidenceMeter,
  IntakeCallStatus,
  ServiceCard,
  TechnicianCard,
  Text,
} from '@servicepro/ui';
import { MessageCircle, Phone } from 'lucide-react';

import { DEMO_CONFIDENCE_CHECKS, DEMO_SERVICES } from '../demo-data';
import { DemoSection, Specimen } from '../demo-section';

export function ServiceSection() {
  return (
    <DemoSection
      id="service"
      title="Service & technician"
      description="Prices appear before booking and the technician is introduced by name. Both answer the customer's first two questions: what will it cost, and who is coming?"
    >
      <Specimen
        label="Service tiles"
        note="Phones: a horizontal row that snaps as you swipe, with the next card partly visible to show there's more. Desktop: a grid."
      >
        <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-5">
          {DEMO_SERVICES.map((service) => (
            <li key={service.code} className="w-2/5 shrink-0 snap-start sm:w-1/4 md:w-auto">
              <ServiceCard
                icon={CATEGORY_ICONS[service.code]}
                title={service.title}
                startingPrice={service.price}
              />
            </li>
          ))}
        </ul>
      </Specimen>
      <Specimen label="Service rows" note="Lists such as the services page and booking history.">
        <ul className="grid gap-3 lg:grid-cols-2">
          {DEMO_SERVICES.slice(0, 4).map((service) => (
            <li key={service.code}>
              <ServiceCard
                layout="row"
                icon={CATEGORY_ICONS[service.code]}
                title={service.title}
                description={service.description}
                startingPrice={service.price}
              />
            </li>
          ))}
        </ul>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen label="Technician · customer view" note="Credentials show only when a real verification process backs them (UX-ARCHITECTURE.md §0).">
          <TechnicianCard
            name="Ravi Kumar"
            specialty="AC & refrigerator specialist"
            rating={4.8}
            completedJobs={1240}
            credential="ID verified"
            footer={
              <div className="flex items-baseline justify-between gap-3">
                <Text variant="sm" tone="secondary">
                  Arriving in
                </Text>
                <Text variant="stat-sm">25 min</Text>
              </div>
            }
            actions={
              <>
                <Button variant="outline">
                  <MessageCircle aria-hidden /> Message
                </Button>
                <Button>
                  <Phone aria-hidden /> Call
                </Button>
              </>
            }
          />
        </Specimen>
        <Specimen label="Technician · dispatch view" note="Staff see duty status and why the system recommends this person.">
          <TechnicianCard
            name="Suresh Reddy"
            specialty="AC · Washing machine"
            rating={4.6}
            completedJobs={530}
            dutyStatus="AVAILABLE"
            footer={
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-foreground-muted">Distance</dt>
                  <dd className="font-semibold text-foreground tabular-nums">3.1 km</dd>
                </div>
                <div>
                  <dt className="text-foreground-muted">Today</dt>
                  <dd className="font-semibold text-foreground tabular-nums">2 / 6 jobs</dd>
                </div>
                <div>
                  <dt className="text-foreground-muted">Match</dt>
                  <dd className="font-semibold text-foreground tabular-nums">86</dd>
                </div>
              </dl>
            }
            actions={<Button>Assign Suresh</Button>}
          />
        </Specimen>
      </div>
    </DemoSection>
  );
}

export function AiSection() {
  return (
    <DemoSection
      id="ai"
      title="AI patterns"
      description="To customers, the assistant speaks as the business: brand colour, plain verbs, no robots. Staff see the violet AI mark so they know what to double-check. Confidence scores are shown to staff only."
    >
      <Specimen label="Customer · intake call">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <IntakeCallStatus
              state="calling"
              title="Calling you now"
              description="Pick up the call from +91 40 •••• 2210. It takes about 2 minutes."
            />
          </Card>
          <Card>
            <IntakeCallStatus
              state="understanding"
              title="Understanding your service request…"
              description="We're matching your problem to the right technician."
            />
          </Card>
          <Card>
            <IntakeCallStatus
              state="confirmed"
              title="Request confirmed"
              description="SR-10234 · AC not cooling · Today, 11 AM – 1 PM"
            />
          </Card>
          <Card>
            <IntakeCallStatus
              state="missed"
              title="We couldn't reach you"
              description="We'll try again in 15 minutes, or you can call us now."
              action={
                <>
                  <Button>Call us now</Button>
                  <Button variant="outline">Call me again</Button>
                </>
              }
            />
          </Card>
        </div>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen label="Staff · AI summary" note="AI-written text is always labelled and kept visually separate from human notes.">
          <AiSummary meta="From a 2 min 14 s call · Telugu · prompt v3">
            LG split AC (3 yrs) running but not cooling for 2 days. Flat 302, Sai Residency, near Kondapur RTO.
            Prefers tomorrow morning. Asked about visiting charge.
          </AiSummary>
        </Specimen>
        <Specimen label="Staff · confidence" note="Shows the score and how it was worked out, check by check, so the reviewer knows what to verify.">
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <AiBadge label="AI confidence" />
            </div>
            <ConfidenceMeter score={89} checks={DEMO_CONFIDENCE_CHECKS} />
          </Card>
        </Specimen>
        <Specimen label="Staff · blocking flag" note="Some flags force a human review whatever the score (PLAN.md §9.3).">
          <Card>
            <ConfidenceMeter score={91} flags={['SAFETY_RISK · burning smell']} />
          </Card>
        </Specimen>
      </div>
    </DemoSection>
  );
}
