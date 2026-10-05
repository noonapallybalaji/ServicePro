import { Toaster, TooltipProvider } from '@servicepro/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

const QUERY_DEFAULTS = {
  /** Live data arrives via SignalR invalidation; polling stays off by default. */
  staleTimeMs: 30_000,
  retries: 2,
} as const;

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QUERY_DEFAULTS.staleTimeMs,
            retry: QUERY_DEFAULTS.retries,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
