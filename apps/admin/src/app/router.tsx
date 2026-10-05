import { Button, EmptyState } from '@servicepro/ui';
import { Compass } from 'lucide-react';
import { createBrowserRouter, Link, Navigate } from 'react-router';

export const ROUTES = {
  designSystem: '/design-system',
} as const;

function NotFound() {
  return (
    <main id="main">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist yet"
        description="Product screens are built after the design system is approved."
        action={
          <Button asChild variant="outline">
            <Link to={ROUTES.designSystem}>Open the design system</Link>
          </Button>
        }
      />
    </main>
  );
}

/*
 * Only the internal design-system route exists in this phase. Product routes
 * (dashboard, leads, verification, ...) are added once the system is signed off.
 */
export const router = createBrowserRouter([
  { path: '/', element: <Navigate to={ROUTES.designSystem} replace /> },
  {
    path: ROUTES.designSystem,
    lazy: async () => {
      const { DesignSystemPage } = await import('../features/design-system/design-system-page');
      return { Component: DesignSystemPage };
    },
  },
  { path: '*', element: <NotFound /> },
]);
