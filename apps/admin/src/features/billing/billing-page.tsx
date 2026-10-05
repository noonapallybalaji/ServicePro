import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetTechnicianLedgerQueryKey,
  useAddLedgerEntry,
  useGetTechnicianLedger,
  useListPayments,
  useListTechnicians,
  type LedgerEntryType,
} from '@servicepro/api-client';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  formatDateTime,
  formatINR,
  toLocalDateInput,
  toast,
} from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { ReceiptIndianRupee, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { paths } from '../../app/paths';
import { humanize } from '../../components/common';

export function BillingPage() {
  return (
    <Stack gap={6}>
      <PageHeader title="Billing" description="Money received, and cash your technicians are holding." />
      <Tabs defaultValue="payments">
        <TabsList>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="cash">Technician cash & earnings</TabsTrigger>
        </TabsList>
        <TabsContent value="payments">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="cash">
          <LedgerTab />
        </TabsContent>
      </Tabs>
    </Stack>
  );
}

function PaymentsTab() {
  const today = toLocalDateInput();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const payments = useListPayments({ from: from || undefined, to: to || undefined, pageSize: 100 });

  return (
    <Stack gap={4}>
      <div className="flex flex-wrap gap-3">
        <Field label="From">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <QueryState query={payments} loading={<DefaultSkeleton rows={3} />}>
        {(data) => {
          const total = data.items.reduce((sum, p) => sum + p.payment.amount, 0);
          return data.items.length === 0 ? (
            <Card>
              <EmptyState icon={ReceiptIndianRupee} title="No payments in this period" />
            </Card>
          ) : (
            <Stack gap={3}>
              <Text>
                <span className="font-semibold tabular-nums">{formatINR(total)}</span> from {data.total} payment{data.total === 1 ? '' : 's'}
              </Text>
              <div className="rounded-card border border-border bg-surface">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Received</TableHeaderCell>
                      <TableHeaderCell>Job</TableHeaderCell>
                      <TableHeaderCell>Bill</TableHeaderCell>
                      <TableHeaderCell>Method</TableHeaderCell>
                      <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {data.items.map(({ payment, invoiceNumber, srNumber }) => (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(payment.receivedAt)}</TableCell>
                        <TableCell>
                          <Link to={paths.request(payment.serviceRequestId)} className="link">
                            {srNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{invoiceNumber}</TableCell>
                        <TableCell>
                          {humanize(payment.method)}
                          {payment.reference ? <span className="text-foreground-muted"> · {payment.reference}</span> : null}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatINR(payment.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Stack>
          );
        }}
      </QueryState>
    </Stack>
  );
}

const ENTRY_LABEL: Record<LedgerEntryType, string> = {
  CASH_COLLECTED: 'Cash collected',
  CASH_DEPOSITED: 'Cash deposited',
  COMMISSION_EARNED: 'Commission earned',
  PAYOUT: 'Paid out',
  ADJUSTMENT: 'Adjustment',
};

function LedgerTab() {
  const technicians = useListTechnicians({ includeInactive: true });
  const [technicianId, setTechnicianId] = useState('');
  const selected = technicianId || technicians.data?.[0]?.id || '';
  const ledger = useGetTechnicianLedger(selected, { query: { enabled: Boolean(selected) } });
  const [type, setType] = useState<LedgerEntryType>('CASH_DEPOSITED');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const addEntry = useAddLedgerEntry({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetTechnicianLedgerQueryKey(selected), updated);
        setAmount('');
        setNote('');
        toast.success('Entry recorded');
      },
    },
  });

  return (
    <Stack gap={4}>
      <Field label="Technician" className="max-w-sm">
        <Select value={selected} onChange={(e) => setTechnicianId(e.target.value)}>
          {technicians.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <QueryState query={ledger} loading={<DefaultSkeleton rows={2} />}>
        {(data) => (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-4">
              <Card>
                <Text variant="sm" tone="secondary">
                  Cash to collect from technician
                </Text>
                <Text variant="stat">{formatINR(data.cashInHand)}</Text>
              </Card>
              <Card>
                <Text variant="sm" tone="secondary">
                  Earnings owed to technician
                </Text>
                <Text variant="stat" tone="brand">
                  {formatINR(data.earningsDue)}
                </Text>
              </Card>
              <Card className="flex flex-col gap-3">
                <Text weight="semibold">Record</Text>
                <Select aria-label="Entry type" value={type} onChange={(e) => setType(e.target.value as LedgerEntryType)}>
                  <option value="CASH_DEPOSITED">Cash handed in</option>
                  <option value="PAYOUT">Paid earnings</option>
                  <option value="ADJUSTMENT">Adjustment (+/−)</option>
                </Select>
                <Input aria-label="Amount" inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <Input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button loading={addEntry.isPending} disabled={!Number(amount)} onClick={() => addEntry.mutate({ technicianId: selected, data: { type, amount: Number(amount), note: note || null } })}>
                  Save
                </Button>
              </Card>
            </div>
            <Card padding="none" className="lg:col-span-2">
              {data.entries.length === 0 ? (
                <EmptyState size="compact" icon={Wallet} title="No entries yet" />
              ) : (
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>When</TableHeaderCell>
                      <TableHeaderCell>Entry</TableHeaderCell>
                      <TableHeaderCell>Note</TableHeaderCell>
                      <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {data.entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(e.occurredAt)}</TableCell>
                        <TableCell>{ENTRY_LABEL[e.type]}</TableCell>
                        <TableCell className="text-foreground-secondary">
                          {e.serviceRequestId ? (
                            <Link to={paths.request(e.serviceRequestId)} className="link">
                              {e.note ?? 'Job'}
                            </Link>
                          ) : (
                            e.note
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </Stack>
  );
}
