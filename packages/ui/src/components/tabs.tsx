import { Tabs as TabsPrimitive } from 'radix-ui';
import { createContext, useContext, type ComponentProps } from 'react';

import { cn } from '../lib/cn';

/**
 * `underline` — page-level sections on desktop (SR detail: Overview / Call / Billing).
 * `segmented` — 2–4 short peer options on mobile (Today / Upcoming / Done).
 */
export type TabsVariant = 'underline' | 'segmented';

const TabsVariantContext = createContext<TabsVariant>('underline');

interface TabsProps extends ComponentProps<typeof TabsPrimitive.Root> {
  variant?: TabsVariant;
}

export function Tabs({ variant = 'underline', className, ...props }: TabsProps) {
  return (
    <TabsVariantContext value={variant}>
      <TabsPrimitive.Root className={cn('flex flex-col gap-4', className)} {...props} />
    </TabsVariantContext>
  );
}

const LIST_CLASSES: Record<TabsVariant, string> = {
  underline: 'scrollbar-none flex gap-6 overflow-x-auto border-b border-border',
  segmented: 'grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-surface-sunken p-1',
};

const TRIGGER_CLASSES: Record<TabsVariant, string> = {
  underline:
    'relative -mb-px h-10 border-b-2 border-transparent text-sm font-semibold whitespace-nowrap text-foreground-secondary hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-foreground pointer-coarse:h-12',
  segmented:
    'h-8 rounded-md px-3 text-sm font-semibold text-foreground-secondary hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-xs pointer-coarse:h-10',
};

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  const variant = useContext(TabsVariantContext);
  return <TabsPrimitive.List className={cn(LIST_CLASSES[variant], className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      className={cn('transition-interactive', TRIGGER_CLASSES[variant], className)}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('data-[state=active]:animate-fade-in', className)} {...props} />;
}
