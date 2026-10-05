import { Badge, Container, Heading, SkipLink, Text, cn } from '@servicepro/ui';

import { DEMO_SECTIONS } from './demo-data';
import { ButtonSection, FormSection } from './sections/controls';
import { CardSection, StatusSection, TimelineSection } from './sections/display';
import { AiSection, ServiceSection } from './sections/domain';
import { FeedbackSection } from './sections/feedback';
import { ColorSection, ShapeSection, TypographySection } from './sections/foundations';
import { OverlaySection } from './sections/overlays';

const NAV_LINK = 'transition-interactive rounded-control text-sm font-semibold text-foreground-secondary hover:text-foreground';

/**
 * Internal visual source of truth. Everything here is built from @servicepro/ui only —
 * if something can't be built from the package, the package is missing a piece.
 */
export function DesignSystemPage() {
  return (
    <>
      <SkipLink />
      {/* Mobile/tablet: section chips scroll horizontally under a sticky header. */}
      <header className="sticky top-0 z-(--z-header) border-b border-border bg-surface lg:hidden">
        <Container className="flex h-header items-center gap-2">
          <span className="text-h3 text-foreground">ServicePro</span>
          <Badge size="sm">Design system</Badge>
        </Container>
        <nav aria-label="Sections" className="scrollbar-none overflow-x-auto">
          <ul className="flex gap-2 px-4 pb-3">
            {DEMO_SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className={cn(NAV_LINK, 'inline-flex h-8 items-center rounded-pill bg-surface-sunken px-3 pointer-coarse:h-10')}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-content">
        {/* Desktop: persistent sticky section index. */}
        <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col gap-6 overflow-y-auto border-r border-border px-6 py-8 lg:flex">
          <div className="flex flex-col gap-2">
            <span className="text-h3 text-foreground">ServicePro</span>
            <Badge size="sm" className="self-start">
              Design system v0.1
            </Badge>
          </div>
          <nav aria-label="Sections">
            <ul className="flex flex-col gap-1">
              {DEMO_SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={cn(NAV_LINK, 'flex h-8 items-center px-3 hover:bg-surface-sunken')}>
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main id="main" className="flex min-w-0 flex-1 flex-col gap-16 px-4 py-8 md:px-6 lg:px-10 lg:py-12">
          <div className="flex flex-col gap-3">
            <Text variant="overline" tone="brand">
              Internal · visual source of truth
            </Text>
            <Heading level={1} size="display">
              Calm, precise, on your side.
            </Heading>
            <Text variant="body-lg" tone="secondary" className="max-w-prose">
              The ServicePro design system: the tokens, components and patterns shared by the customer app, technician
              app and owner dashboard. Product screens are built only from what's shown here.
            </Text>
          </div>

          <ColorSection />
          <TypographySection />
          <ShapeSection />
          <ButtonSection />
          <FormSection />
          <CardSection />
          <StatusSection />
          <TimelineSection />
          <OverlaySection />
          <FeedbackSection />
          <ServiceSection />
          <AiSection />
        </main>
      </div>
    </>
  );
}
