import { isApiError } from '@servicepro/api-client';
import { toast, Toaster, TooltipProvider } from '@servicepro/ui';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/** Human message for any error (API problem title, network failure, or fallback). */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isApiError(error)) {
    return error.message;
  }

  if (error instanceof TypeError) {
    return "You're offline or the server can't be reached. Your changes weren't saved.";
  }

  return fallback;
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Live data arrives as SignalR invalidations; this is the safety net.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, error) => !(isApiError(error) && error.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
    // Every failed mutation explains itself unless the caller handles the error (meta.silent).
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!mutation.meta?.['silent']) {
          toast.error(errorMessage(error));
        }
      },
    }),
  });
}

/** Query client, tooltip provider and toaster for an app. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
