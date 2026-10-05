import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useGetMyEarnings, type LedgerEntryType } from '@servicepro/api-client';
import { Card, EmptyState, Heading, HUE_CLASSES, PageHeader, SpotArt, Stack, Text, cn, formatDateTime, formatINR, type Hue } from '@servicepro/ui';
import { ArrowDownLeft, ArrowUpRight, Banknote, HandCoins, Wallet, type LucideIcon } from 'lucide-react';

const ENTRY: Record<LedgerEntryType, { label: string; hue: Hue; icon: LucideIcon }> = {
  CASH_COLLECTED: { label: 'Cash collected', hue: 'orange', icon: Banknote },
  CASH_DEPOSITED: { label: 'Cash deposited', hue: 'sky', icon: ArrowUpRight },
  COMMISSION_EARNED: { label: 'Commission earned', hue: 'mint', icon: HandCoins },
  PAYOUT: { label: 'Paid to you', hue: 'violet', icon: ArrowDownLeft },
  ADJUSTMENT: { label: 'Adjustment', hue: 'indigo', icon: Wallet },
};

/** Two numbers that matter (PLAN.md §7.9): cash to hand in, and what the business owes you. */
export function EarningsPage() {
  const earnings = useGetMyEarnings();

  return (
    <Stack gap={6}>
      <PageHeader title="Earnings" description="Cash you hold for the office, and what the office owes you." />
      <QueryState query={earnings} loading={<DefaultSkeleton rows={2} />} errorTitle="Couldn't load your earnings">
        {(data) => (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-4">
              <Card className="flex flex-col gap-3 border-0 bg-hue-orange-subtle">
                <span className="flex size-10 items-center justify-center rounded-control bg-surface text-hue-orange-foreground">
                  <Banknote aria-hidden className="size-5" />
                </span>
                <div className="flex flex-col">
                  <Text variant="sm" weight="semibold" className="text-hue-orange-foreground">
                    Cash to deposit
                  </Text>
                  <Text variant="stat">{formatINR(data.cashInHand)}</Text>
                </div>
                <Text variant="caption" tone="secondary">
                  Hand this in at the office.
                </Text>
              </Card>
              <Card data-surface="brand" className="surface-hero flex flex-col gap-3 border-0 bg-transparent">
                <span className="flex size-10 items-center justify-center rounded-control bg-accent text-accent-foreground">
                  <HandCoins aria-hidden className="size-5" />
                </span>
                <div className="flex flex-col">
                  <Text variant="sm" weight="semibold" tone="secondary">
                    Earnings due
                  </Text>
                  <Text variant="stat">{formatINR(data.earningsDue)}</Text>
                </div>
                <Text variant="caption" tone="muted">
                  Commission the office will pay you.
                </Text>
              </Card>
            </div>

            <section aria-labelledby="ledger" className="flex min-w-0 flex-col gap-3 lg:col-span-2">
              <Heading level={2} size="h3" id="ledger">
                Recent activity
              </Heading>
              {data.entries.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Wallet}
                    illustration={<SpotArt kind="wallet" />}
                    title="Nothing yet"
                    description="Payments you collect and commission you earn appear here."
                  />
                </Card>
              ) : (
                <Card padding="none">
                  <ul className="divide-y divide-border">
                    {data.entries.map((entry) => {
                      const outgoing = entry.type === 'CASH_DEPOSITED' || entry.type === 'PAYOUT';
                      const meta = ENTRY[entry.type];
                      const Icon = meta.icon;
                      return (
                        <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', HUE_CLASSES[meta.hue].subtle)}>
                            <Icon aria-hidden className="size-5" />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col">
                            <Text weight="semibold">{meta.label}</Text>
                            <Text variant="caption" tone="muted">
                              {formatDateTime(entry.occurredAt)}
                              {entry.note ? ` · ${entry.note}` : ''}
                            </Text>
                          </div>
                          <Text className={cn('tabular-nums', outgoing ? 'text-foreground-secondary' : 'text-success-subtle-foreground')} weight="semibold">
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
          </div>
        )}
      </QueryState>
    </Stack>
  );
}
