import { Heading, Text, cn } from '@servicepro/ui';
import type { ReactNode } from 'react';

interface DemoSectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function DemoSection({ id, title, description, children }: DemoSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-6 lg:scroll-mt-8">
      <header className="flex flex-col gap-2 border-b border-border pb-4">
        <Heading level={2} id={`${id}-title`}>
          {title}
        </Heading>
        <Text tone="secondary" className="max-w-prose">
          {description}
        </Text>
      </header>
      {children}
    </section>
  );
}

interface SpecimenProps {
  label: string;
  note?: string;
  children: ReactNode;
  className?: string;
}

/** A labelled example inside a section. */
export function Specimen({ label, note, children, className }: SpecimenProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1">
        <Text variant="overline" tone="muted">
          {label}
        </Text>
        {note ? (
          <Text variant="sm" tone="secondary">
            {note}
          </Text>
        ) : null}
      </div>
      {children}
    </div>
  );
}
