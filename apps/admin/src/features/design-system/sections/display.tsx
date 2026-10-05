import {
  Avatar,
  Badge,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
  DutyStatusBadge,
  Inline,
  SERVICE_REQUEST_STATUSES,
  StatusBadge,
  StatusTimeline,
  TECHNICIAN_DUTY_STATUS,
  TECHNICIAN_DUTY_STATUSES,
  TONES,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Button,
  cn,
} from '@servicepro/ui';
import { ChevronRight } from 'lucide-react';

import { ADMIN_ACTIVITY_STEPS, CUSTOMER_TRACKING_STEPS, PARTS_DELAY_STEPS } from '../demo-data';
import { DemoSection, Specimen } from '../demo-section';

export function CardSection() {
  return (
    <DemoSection
      id="cards"
      title="Cards & tabs"
      description="Cards are flat: a hairline border on white. Only interactive cards lift on hover, so a shadow always means you can click it."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardTitle>Outline</CardTitle>
          <CardDescription>Default. Most content.</CardDescription>
        </Card>
        <Card variant="elevated">
          <CardTitle>Elevated</CardTitle>
          <CardDescription>Sits above a busy background.</CardDescription>
        </Card>
        <Card variant="sunken">
          <CardTitle>Sunken</CardTitle>
          <CardDescription>Grouping inside another surface.</CardDescription>
        </Card>
        {/* Interactive cards are real links/buttons styled with cardVariants — never a clickable div. */}
        <a href="#cards" className={cn(cardVariants({ variant: 'interactive' }), 'flex flex-col gap-1')}>
          <span className="flex items-start justify-between gap-3">
            <span className="text-h3 text-foreground">Interactive</span>
            <ChevronRight aria-hidden className="size-5 text-foreground-muted" />
          </span>
          <span className="text-sm text-foreground-secondary">Hover lifts, press settles.</span>
        </a>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1">
            <Text variant="overline" tone="muted">
              SR-10234
            </Text>
            <CardTitle>LG split AC · Not cooling</CardTitle>
            <CardDescription>Kondapur, Hyderabad · Today, 11 AM – 1 PM</CardDescription>
          </div>
          <StatusBadge status="EN_ROUTE" />
        </CardHeader>
        <CardFooter>
          <Button variant="outline" size="sm">
            Open
          </Button>
          <Text variant="sm" tone="muted">
            Ravi Kumar · ETA 25 min
          </Text>
        </CardFooter>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen label="Underline tabs" note="Sections of a page on desktop.">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="call">Call & transcript</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Text tone="secondary">Customer, appliance, address and the AI summary.</Text>
            </TabsContent>
            <TabsContent value="call">
              <Text tone="secondary">Recording player and the full transcript.</Text>
            </TabsContent>
            <TabsContent value="billing">
              <Text tone="secondary">Estimates, invoice and payments.</Text>
            </TabsContent>
            <TabsContent value="activity">
              <Text tone="secondary">Every status change, newest first.</Text>
            </TabsContent>
          </Tabs>
        </Specimen>
        <Specimen label="Segmented tabs" note="Two to four short options next to each other on mobile.">
          <Tabs defaultValue="today" variant="segmented">
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="done">Done</TabsTrigger>
            </TabsList>
            <TabsContent value="today">
              <Text tone="secondary">4 jobs scheduled.</Text>
            </TabsContent>
            <TabsContent value="upcoming">
              <Text tone="secondary">2 jobs tomorrow.</Text>
            </TabsContent>
            <TabsContent value="done">
              <Text tone="secondary">31 jobs this month.</Text>
            </TabsContent>
          </Tabs>
        </Specimen>
      </div>
    </DemoSection>
  );
}

export function StatusSection() {
  return (
    <DemoSection
      id="status"
      title="Badges & status"
      description="Each status has a tone, an icon and a label written for whoever is reading. Staff see 'En route' and customers see 'On the way'. The pulsing dot appears only while work is actually happening."
    >
      <Specimen label="Tones">
        <div className="flex flex-col gap-3">
          {(['subtle', 'solid', 'outline'] as const).map((appearance) => (
            <Inline key={appearance} gap={2}>
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone} appearance={appearance}>
                  {tone}
                </Badge>
              ))}
            </Inline>
          ))}
        </div>
      </Specimen>
      <Specimen label="Service request status — staff vs customer wording">
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-foreground-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Staff / technician
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Customer
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SERVICE_REQUEST_STATUSES.map((status) => (
                <tr key={status}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap text-foreground-secondary">{status}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} audience="customer" size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen label="Technician duty status">
          <Inline gap={2}>
            {TECHNICIAN_DUTY_STATUSES.map((status) => (
              <DutyStatusBadge key={status} status={status} />
            ))}
          </Inline>
        </Specimen>
        <Specimen label="Avatars" note="Initials when there's no photo. The presence dot always has a text label next to it.">
          <Inline gap={4}>
            <Avatar name="Ravi Kumar" size="sm" />
            <Avatar name="Suresh Reddy" size="md" statusClass={TECHNICIAN_DUTY_STATUS.AVAILABLE.dotClass} />
            <Avatar name="Anil Varma" size="lg" statusClass={TECHNICIAN_DUTY_STATUS.ON_JOB.dotClass} />
            <Avatar name="Priya Sharma" size="xl" statusClass={TECHNICIAN_DUTY_STATUS.OFF_DUTY.dotClass} />
          </Inline>
        </Specimen>
      </div>
    </DemoSection>
  );
}

export function TimelineSection() {
  return (
    <DemoSection
      id="timeline"
      title="Timelines"
      description="Customers see six simple milestones instead of all 17 internal statuses. Staff see every event, compact and newest first."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Specimen label="Customer tracking · live">
          <Card>
            <StatusTimeline steps={CUSTOMER_TRACKING_STEPS} />
          </Card>
        </Specimen>
        <Specimen label="Customer tracking · exception">
          <Card>
            <StatusTimeline steps={PARTS_DELAY_STEPS} />
          </Card>
        </Specimen>
        <Specimen label="Admin activity · compact">
          <Card>
            <StatusTimeline steps={ADMIN_ACTIVITY_STEPS} density="compact" />
          </Card>
        </Specimen>
      </div>
    </DemoSection>
  );
}
