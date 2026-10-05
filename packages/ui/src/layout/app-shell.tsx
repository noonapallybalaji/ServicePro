import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { SkipLink } from './layout';

/*
 * One shell for every signed-in app (RESPONSIVE-STRATEGY.md §3, UX-ARCHITECTURE.md §3):
 *   ≥ lg  sidebar + header + content
 *   < lg  header + content + bottom navigation (thumb zone)
 * The same nav items are rendered twice by the app (sidebar and bottom bar); CSS decides
 * which one is visible, so there is no device-specific component.
 * The shell is router-agnostic: nav items take a link element via `asChild`.
 */

interface AppShellProps {
  header: ReactNode;
  sidebar?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ header, sidebar, bottomNav, children, className }: AppShellProps) {
  return (
    <div className={cn('flex min-h-dvh bg-background', className)}>
      <SkipLink />
      {sidebar ? (
        <aside className="sticky top-0 hidden h-dvh w-sidebar shrink-0 flex-col border-r border-border bg-surface lg:flex">
          {sidebar}
        </aside>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-(--z-header) border-b border-border bg-surface pt-safe">{header}</header>
        <main id="main" className={cn('flex min-w-0 flex-1 flex-col', bottomNav && 'pb-24 lg:pb-0')}>
          {children}
        </main>
        {bottomNav ? (
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-border bg-surface pb-safe lg:hidden"
          >
            <ul className="mx-auto flex max-w-content justify-around px-2 pt-1">{bottomNav}</ul>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

interface NavItemProps extends ComponentProps<'a'> {
  icon: ReactNode;
  label: string;
  /** Count shown as a small pill (e.g. open verifications, pending offers). */
  badge?: number | undefined;
  /** Pass the router link element as the only child (NavLink sets aria-current="page"). */
  asChild?: boolean;
}

/** Sidebar entry (desktop). Active state comes from aria-current="page". */
export function SidebarNavItem({ icon, label, badge, asChild = false, className, children, ...props }: NavItemProps) {
  const Comp = asChild ? Slot.Slot : 'a';
  return (
    <li>
      <Comp
        className={cn(
          'transition-interactive flex h-10 items-center gap-3 rounded-control px-3 text-sm font-semibold text-foreground-secondary',
          'hover:bg-surface-sunken hover:text-foreground aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-foreground',
          '[&_svg]:size-5 [&_svg]:shrink-0',
          className,
        )}
        {...props}
      >
        {asChild ? (
          <Slot.Slottable>{children}</Slot.Slottable>
        ) : null}
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {badge ? <NavBadge count={badge} /> : null}
      </Comp>
    </li>
  );
}

/** Bottom-bar entry (mobile/tablet): icon over a short label, 56px tall target. */
export function BottomNavItem({ icon, label, badge, asChild = false, className, children, ...props }: NavItemProps) {
  const Comp = asChild ? Slot.Slot : 'a';
  return (
    <li className="flex-1">
      <Comp
        className={cn(
          'transition-interactive relative flex h-14 flex-col items-center justify-center gap-1 rounded-control text-caption text-foreground-muted',
          'aria-[current=page]:text-primary [&_svg]:size-6',
          className,
        )}
        {...props}
      >
        {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
        <span className="relative">
          {icon}
          {badge ? <NavBadge count={badge} className="absolute -top-2 -right-3" /> : null}
        </span>
        <span className="font-semibold">{label}</span>
      </Comp>
    </li>
  );
}

function NavBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-pill bg-error px-1 text-caption font-semibold text-error-foreground tabular-nums',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Primary/secondary actions; placed right on desktop, under the title on phones. */
  actions?: ReactNode;
  /** Small line above the title, e.g. a back link or breadcrumb. */
  eyebrow?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow}
        <h1 className="text-h1 text-balance text-foreground">{title}</h1>
        {description ? <p className="text-body text-foreground-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3 *:max-md:flex-1">{actions}</div> : null}
    </div>
  );
}
