import { Card, Text, cn } from '@servicepro/ui';

import {
  COLOR_GROUPS,
  INDIC_SAMPLES,
  RADIUS_SPECIMENS,
  SHADOW_SPECIMENS,
  SPACING_STEPS,
  TYPE_SPECIMENS,
  type ColorToken,
} from '../demo-data';
import { DemoSection, Specimen } from '../demo-section';

function Swatch({ token, label, usage, on, bordered }: ColorToken) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn('flex h-20 items-end rounded-card p-3', bordered && 'border border-border')}
        // Swatches render arbitrary tokens from data, so the colour must be applied at runtime.
        // eslint-disable-next-line no-restricted-syntax -- data-driven token preview
        style={{ backgroundColor: `var(${token})`, color: on ? `var(${on})` : undefined }}
      >
        <span className="text-caption font-semibold">Aa</span>
      </div>
      <div className="flex flex-col">
        <Text variant="sm" weight="semibold">
          {label}
        </Text>
        <Text variant="caption" tone="muted" className="font-normal">
          {token}
        </Text>
        <Text variant="caption" tone="secondary" className="font-normal">
          {usage}
        </Text>
      </div>
    </div>
  );
}

export function ColorSection() {
  return (
    <DemoSection
      id="colors"
      title="Colour"
      description="Components only use semantic tokens. Raw palette classes such as bg-red-500 don't exist in this build. Light mode only for v1 (see DESIGN-SYSTEM.md §2.4)."
    >
      {COLOR_GROUPS.map((group) => (
        <Specimen key={group.title} label={group.title} note={group.description}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {group.tokens.map((token) => (
              <Swatch key={token.token} {...token} />
            ))}
          </div>
        </Specimen>
      ))}
    </DemoSection>
  );
}

export function TypographySection() {
  return (
    <DemoSection
      id="typography"
      title="Typography"
      description="Manrope Variable for Latin, with Noto Sans Telugu and Devanagari as fallbacks. Display, H1 and H2 scale fluidly between mobile and desktop."
    >
      <Card padding="none" className="divide-y divide-border">
        {TYPE_SPECIMENS.map((specimen) => (
          <div key={specimen.name} className="flex flex-col gap-2 p-4 md:flex-row md:items-baseline md:gap-6 md:p-5">
            <div className="flex shrink-0 flex-col md:w-40">
              <Text variant="sm" weight="semibold">
                {specimen.name}
              </Text>
              <Text variant="caption" tone="muted" className="font-normal">
                {specimen.spec}
              </Text>
            </div>
            <p className={cn(specimen.className, 'min-w-0 text-foreground')}>{specimen.sample}</p>
          </div>
        ))}
      </Card>
      <Specimen label="Indian languages" note="Set lang on any ancestor; line-height opens up automatically for taller scripts.">
        <div className="grid gap-4 md:grid-cols-2">
          {INDIC_SAMPLES.map((sample) => (
            <Card key={sample.lang} lang={sample.lang}>
              <Text variant="caption" tone="muted" lang="en">
                {sample.label}
              </Text>
              <p className="text-h3 text-foreground">{sample.sample}</p>
              <p className="text-body text-foreground-secondary">{sample.sample}</p>
            </Card>
          ))}
        </div>
      </Specimen>
    </DemoSection>
  );
}

export function ShapeSection() {
  return (
    <DemoSection
      id="shape"
      title="Space, radius & elevation"
      description="A 4px spacing grid with a fixed set of steps (arbitrary values don't compile). Cards are flat. Shadows are only for things that float."
    >
      <Specimen label="Spacing scale">
        <Card padding="md">
          <ul className="flex flex-col gap-2">
            {SPACING_STEPS.map((space) => (
              <li key={space.step} className="flex items-center gap-4">
                <Text variant="caption" tone="muted" className="w-12 font-normal tabular-nums">
                  {space.step} · {space.px}
                </Text>
                <span className={cn('h-3 rounded-sm bg-primary', space.className)} />
              </li>
            ))}
          </ul>
        </Card>
      </Specimen>
      <div className="grid gap-6 lg:grid-cols-2">
        <Specimen label="Radius">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {RADIUS_SPECIMENS.map((radius) => (
              <div key={radius.name} className="flex flex-col gap-2">
                <div className={cn('h-16 border border-primary-border bg-primary-subtle', radius.className)} />
                <Text variant="sm" weight="semibold">
                  {radius.name}
                </Text>
                <Text variant="caption" tone="secondary" className="font-normal">
                  {radius.usage}
                </Text>
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen label="Elevation">
          <div className="grid grid-cols-2 gap-4">
            {SHADOW_SPECIMENS.map((shadow) => (
              <div key={shadow.name} className={cn('flex h-24 flex-col justify-end rounded-card bg-surface p-3', shadow.className)}>
                <Text variant="sm" weight="semibold">
                  shadow-{shadow.name}
                </Text>
                <Text variant="caption" tone="secondary" className="font-normal">
                  {shadow.usage}
                </Text>
              </div>
            ))}
          </div>
        </Specimen>
      </div>
    </DemoSection>
  );
}
