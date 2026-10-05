import { ErrorState, Skeleton, cn } from '@servicepro/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { errorMessage } from './query';

interface QueryStateProps<T> {
  query: UseQueryResult<T, unknown>;
  /** Shape-matching placeholder (DESIGN-SYSTEM.md §5: skeleton over spinner). */
  loading?: ReactNode;
  children: (data: T) => ReactNode;
  errorTitle?: string;
  className?: string;
}

/** Renders loading / error / data for a query, consistently across apps (UX-ARCHITECTURE.md §5). */
export function QueryState<T>({ query, loading, children, errorTitle = "Couldn't load this", className }: QueryStateProps<T>) {
  if (query.isPending) {
    return <div className={className}>{loading ?? <DefaultSkeleton />}</div>;
  }

  if (query.isError) {
    return (
      <ErrorState
        size="compact"
        title={errorTitle}
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
        className={className}
      />
    );
  }

  return <>{children(query.data)}</>;
}

export function DefaultSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-card" />
      ))}
    </div>
  );
}
