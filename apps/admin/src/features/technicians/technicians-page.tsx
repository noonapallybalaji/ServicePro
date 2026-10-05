import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useGetActiveCatalog, useListTechnicians } from '@servicepro/api-client';
import { Avatar, Badge, Button, Card, DutyStatusBadge, EmptyState, PageHeader, Stack, TECHNICIAN_DUTY_STATUS, Text, cardVariants, cn, formatRelative } from '@servicepro/ui';
import { Plus, Star, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';

export function TechniciansPage() {
  const [showInactive, setShowInactive] = useState(false);
  const technicians = useListTechnicians({ includeInactive: showInactive });
  const catalog = useGetActiveCatalog();
  const categoryName = (id: string) => catalog.data?.find((c) => c.id === id)?.name ?? '…';

  return (
    <Stack gap={6}>
      <PageHeader
        title="Technicians"
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowInactive((v) => !v)} aria-pressed={showInactive}>
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </Button>
            <Button asChild>
              <Link to={paths.newTechnician}>
                <Plus aria-hidden /> Add technician
              </Link>
            </Button>
          </>
        }
      />
      <QueryState query={technicians} loading={<DefaultSkeleton rows={4} />}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState icon={Wrench} title="No technicians yet" description="Add your team so jobs can be assigned." />
            </Card>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {list.map((t) => (
                <li key={t.id}>
                  <Link to={paths.technician(t.id)} className={cn(cardVariants({ variant: 'interactive', padding: 'md' }), 'flex h-full flex-col gap-3', !t.isActive && 'opacity-60')}>
                    <div className="flex items-center gap-3">
                      <Avatar name={t.fullName} size="lg" statusClass={TECHNICIAN_DUTY_STATUS[t.dutyStatus].dotClass} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-h3 text-foreground">{t.fullName}</span>
                        <span className="text-sm text-foreground-secondary">{t.phone}</span>
                      </div>
                      {t.isActive ? <DutyStatusBadge status={t.dutyStatus} size="sm" /> : <Badge size="sm">Inactive</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.skills.map((s) => (
                        <Badge key={s.categoryId} size="sm" tone="primary">
                          {categoryName(s.categoryId)} · {s.level}
                        </Badge>
                      ))}
                    </div>
                    <Text variant="sm" tone="secondary" className="mt-auto flex flex-wrap gap-x-3">
                      <span>{t.completedJobs} jobs done</span>
                      {t.ratingAverage != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star aria-hidden className="size-3 fill-rating text-rating" />
                          {t.ratingAverage.toFixed(1)}
                        </span>
                      ) : null}
                      {t.lastLocationAt ? <span>Seen {formatRelative(t.lastLocationAt)}</span> : null}
                    </Text>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </Stack>
  );
}
