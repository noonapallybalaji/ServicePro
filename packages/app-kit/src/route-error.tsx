import { isApiError } from '@servicepro/api-client';
import { Button, ErrorState } from '@servicepro/ui';
import { Compass, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

/** Router error element: unknown routes and unexpected render errors, in plain words. */
export function RouteError({ homePath = '/' }: { homePath?: string }) {
  const error = useRouteError();
  const notFound = (isRouteErrorResponse(error) && error.status === 404) || (isApiError(error) && error.status === 404);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4">
      <ErrorState
        icon={notFound ? Compass : TriangleAlert}
        title={notFound ? "This page doesn't exist" : 'Something went wrong on this screen'}
        description={notFound ? 'The link may be old or mistyped.' : 'Your data is safe. Reload the page, or go back to the start.'}
        onRetry={notFound ? undefined : () => window.location.reload()}
        retryLabel="Reload"
        secondaryAction={
          <Button asChild variant="ghost">
            <Link to={homePath}>Go to start</Link>
          </Button>
        }
      />
    </main>
  );
}
