import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';

/*
 * Data fetching is only needed by the booking and tracking pages, so React Query lives in their
 * lazy chunks instead of the bundle every landing visitor downloads.
 */
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

export function withQueryClient<P extends object>(Page: ComponentType<P>): ComponentType<P> {
  return function WithQueryClient(props: P) {
    return (
      <QueryClientProvider client={queryClient}>
        <Page {...props} />
      </QueryClientProvider>
    );
  };
}
