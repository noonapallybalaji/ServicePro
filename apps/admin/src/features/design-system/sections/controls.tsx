import {
  Button,
  CATEGORY_ICONS,
  Card,
  Checkbox,
  Field,
  IconButton,
  Inline,
  Input,
  Radio,
  RadioCard,
  RadioGroup,
  Select,
  Stack,
  StickyActionBar,
  Switch,
  Textarea,
} from '@servicepro/ui';
import { ArrowRight, Mic, MoreHorizontal, Navigation, Phone, Search, X } from 'lucide-react';
import { useState } from 'react';

import { DEMO_ISSUES } from '../demo-data';
import { DemoSection, Specimen } from '../demo-section';

export function ButtonSection() {
  const [loading, setLoading] = useState(false);

  function simulateSubmit() {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1500);
  }

  return (
    <DemoSection
      id="buttons"
      title="Buttons"
      description="Use one primary button per screen region. Height depends on the input device, not the screen width: 48–56px on touch and 32–48px with a mouse. Try this page on a phone."
    >
      <Specimen label="Variants">
        <Inline gap={3}>
          <Button>Confirm booking</Button>
          <Button variant="secondary">Reschedule</Button>
          <Button variant="outline">View estimate</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="destructive">Cancel job</Button>
        </Inline>
      </Specimen>
      <Specimen label="Sizes" note="sm is for dense desktop tables only. lg is for the main booking and job actions.">
        <Inline gap={3} align="center">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">
            Large <ArrowRight aria-hidden />
          </Button>
        </Inline>
      </Specimen>
      <Specimen label="States">
        <Inline gap={3}>
          <Button loading={loading} onClick={simulateSubmit}>
            Send estimate
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline">
            <Phone aria-hidden /> Call technician
          </Button>
        </Inline>
      </Specimen>
      <Specimen label="Icon buttons" note="An accessible label is required by the type system.">
        <Inline gap={2}>
          <IconButton icon={MoreHorizontal} label="More actions" showTooltip />
          <IconButton icon={Navigation} label="Navigate" variant="outline" showTooltip />
          <IconButton icon={Mic} label="Describe by voice" variant="secondary" showTooltip />
          <IconButton icon={Phone} label="Call customer" variant="primary" showTooltip />
        </Inline>
      </Specimen>
      <Specimen label="Full width" note="Mobile flows: the primary action fills the thumb zone.">
        <div className="max-w-sm">
          <Button size="lg" fullWidth>
            Request a call back
          </Button>
        </div>
      </Specimen>
    </DemoSection>
  );
}

export function FormSection() {
  const [issue, setIssue] = useState<string>(DEMO_ISSUES[0].value);
  const [phone, setPhone] = useState('98765');
  const phoneError = phone.replace(/\D/g, '').length < 10 ? 'Enter a 10-digit mobile number' : undefined;
  const AcIcon = CATEGORY_ICONS.AC;

  return (
    <DemoSection
      id="forms"
      title="Forms"
      description="Forms ask for as little as possible. Labels sit above the field, and errors appear below it, are read out by screen readers, and say how to fix the problem. Fields are required unless marked optional."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <Stack gap={5}>
            <Field label="Your name">
              <Input autoComplete="name" placeholder="e.g. Rahul Kumar" />
            </Field>
            <Field label="Mobile number" hint="We'll call you on this number in about a minute." error={phoneError}>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                leadingIcon={Phone}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field label="Search area">
              <Input
                type="search"
                leadingIcon={Search}
                placeholder="Kondapur, Madhapur…"
                trailing={<IconButton icon={X} label="Clear search" size="sm" />}
              />
            </Field>
            <Field label="Appliance brand" optional>
              <Select defaultValue="">
                <option value="" disabled>
                  Choose a brand
                </option>
                <option>LG</option>
                <option>Samsung</option>
                <option>Voltas</option>
                <option>Daikin</option>
              </Select>
            </Field>
            <Field label="Anything else we should know?" optional>
              <Textarea placeholder="e.g. gate code, best time to call" />
            </Field>
          </Stack>
        </Card>

        <Stack gap={6}>
          <Specimen label="Radio cards" note="The main mobile pattern for choosing an appliance or problem: one tap, no typing.">
            <RadioGroup value={issue} onValueChange={setIssue} aria-label="What's the problem?">
              {DEMO_ISSUES.map((option) => (
                <RadioCard
                  key={option.value}
                  value={option.value}
                  title={option.title}
                  description={option.description}
                  media={<AcIcon aria-hidden className="size-5" />}
                />
              ))}
            </RadioGroup>
          </Specimen>
          <Specimen label="Checkbox, radio, switch">
            <Card>
              <Stack gap={2}>
                <Checkbox
                  defaultChecked
                  label="Call me about this request"
                  description="Calls may be recorded for service quality."
                />
                <RadioGroup defaultValue="morning" aria-label="Preferred time">
                  <Radio value="morning" label="Morning" description="9 AM – 12 PM" />
                  <Radio value="afternoon" label="Afternoon" description="12 PM – 4 PM" />
                </RadioGroup>
                <Switch defaultChecked label="I'm on duty" description="You'll receive new job offers." />
              </Stack>
            </Card>
          </Specimen>
        </Stack>
      </div>

      <Specimen
        label="Sticky action bar"
        note="On phones the bar is pinned to the bottom of the screen and clears the gesture bar. From tablet width up it sits inline. Resize the window to see it change."
      >
        {/* transform-gpu makes this card the containing block, so the "fixed" bar stays inside the demo. */}
        <Card variant="sunken" className="relative transform-gpu overflow-hidden">
          <StickyActionBar>
            <Button variant="outline">Back</Button>
            <Button size="lg">Continue</Button>
          </StickyActionBar>
        </Card>
      </Specimen>
    </DemoSection>
  );
}
