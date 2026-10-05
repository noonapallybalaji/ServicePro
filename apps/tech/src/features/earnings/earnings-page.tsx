import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useGetMyEarnings, type LedgerEntryType } from '@servicepro/api-client';
import { Card, EmptyState, Heading, Stack, Text, cn, formatDateTime, formatINR } from '@servicepro/ui';
import { Wallet } from 'lucide-react';

const ENTRY_LABEL: Record<LedgerEntryType, string> = {
  CASH_COLLECTED: 'Cash collected',
  CASH_DEPOSITED: 'Cash deposited',
  COMMISSION_EARNED: 'Commission earned',
  PAYOUT: 'Paid to you',
  ADJUSTMENT: 'Adjustment',
};

/** Two numbers that matter (PLAN.md §7.9): cash to hand in, and what the business owes you. */
export function EarningsPage() {
  const earnings = useGetMyEarnings();

  return (
    <Stack gap={6}>
      <Heading level={1} size="h2">
        Earnings
      </Heading>
      <QueryState query={earnings} loading={<DefaultSkeleton rows={2} />} errorTitle="Couldn't load your earnings">
        {(data) => (
          <Stack gap={6}>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <Text variant="sm" tone="secondary">
                  Cash to deposit
                </Text>
                <Text variant="stat">{formatINR(data.cashInHand)}</Text>
              </Card>
              <Card>
                <Text variant="sm" tone="secondary">
                  Earnings due
                </Text>
                <Text variant="stat" tone="brand">
                  {formatINR(data.earningsDue)}
                </Text>
              </Card>
            </div>

            <section aria-labelledby="ledger" className="flex flex-col gap-3">
              <Heading level={2} size="h3" id="ledger">
                Recent activity
              </Heading>
              {data.entries.length === 0 ? (
                <Card>
                  <EmptyState size="compact" icon={Wallet} title="Nothing yet" description="Payments you collect and commission you earn appear here." />
                </Card>
              ) : (
                <Card padding="none">
                  <ul className="divide-y divide-border">
                    {data.entries.map((entry) => {
                      const outgoing = entry.type === 'CASH_DEPOSITED' || entry.type === 'PAYOUT';
                      return (
                        <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 flex-col">
                            <Text weight="semibold">{ENTRY_LABEL[entry.type]}</Text>
                            <Text variant="caption" tone="muted">
                              {formatDateTime(entry.occurredAt)}
                              {entry.note ? ` · ${entry.note}` : ''}
                            </Text>
                          </div>
                          <Text className={cn('tabular-nums', outgoing ? 'text-foreground-secondary' : 'text-foreground')} weight="semibold">
                            {outgoing ? '−' : '+'}
                            {formatINR(Math.abs(entry.amount))}
                          </Text>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </section>
          </Stack>
        )}
      </QueryState>
    </Stack>
  );
}
