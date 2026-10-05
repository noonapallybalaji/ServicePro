import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { useSearchCustomers } from '@servicepro/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Text,
  cardVariants,
  cn,
  formatDay,
} from '@servicepro/ui';
import { Plus, Search, Upload, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

import { paths } from '../../app/paths';
import { ImportCustomersDialog } from './import-customers-dialog';

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [draft, setDraft] = useState(search);
  const [importing, setImporting] = useState(false);
  const customers = useSearchCustomers({ search: search || undefined, page, pageSize: 25 });

  function submit(event: FormEvent) {
    event.preventDefault();
    setParams(draft.trim() ? { search: draft.trim() } : {}, { replace: true });
  }

  return (
    <Stack gap={6}>
      <PageHeader
        title="Customers"
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload aria-hidden /> Import CSV
            </Button>
            <Button asChild>
              <Link to={paths.newCustomer}>
                <Plus aria-hidden /> New customer
              </Link>
            </Button>
          </>
        }
      />

      <form role="search" onSubmit={submit} className="max-w-md">
        <Input type="search" aria-label="Search customers" placeholder="Name or phone (last 4 digits work)" leadingIcon={Search} value={draft} onChange={(event) => setDraft(event.target.value)} />
      </form>

      <QueryState query={customers} loading={<DefaultSkeleton rows={5} />} errorTitle="Couldn't load customers">
        {(data) =>
          data.items.length === 0 ? (
            <Card>
              <EmptyState icon={Users} title={search ? `No customer matches "${search}"` : 'No customers yet'} description="Customers are added when you log their first request." />
            </Card>
          ) : (
            <Stack gap={4}>
              <ul className="flex flex-col gap-2 md:hidden">
                {data.items.map((c) => (
                  <li key={c.id}>
                    <Link to={paths.customer(c.id)} className={cn(cardVariants({ variant: 'interactive', padding: 'sm' }), 'flex flex-col gap-1')}>
                      <span className="font-semibold">{c.fullName}</span>
                      <span className="text-sm text-foreground-secondary">
                        {c.primaryPhone}
                        {c.locality ? ` · ${c.locality}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden rounded-card border border-border bg-surface md:block">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Phone</TableHeaderCell>
                      <TableHeaderCell>Locality</TableHeaderCell>
                      <TableHeaderCell>Customer since</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {data.items.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link to={paths.customer(c.id)} className="link">
                            {c.fullName}
                          </Link>
                          {c.isBlocked ? (
                            <Badge tone="error" size="sm" className="ml-2">
                              Blocked
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums">{c.primaryPhone}</TableCell>
                        <TableCell>{c.locality ?? <span className="text-foreground-muted">—</span>}</TableCell>
                        <TableCell className="text-foreground-secondary">{formatDay(c.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <Text variant="sm" tone="muted">
                  {data.total} customers
                </Text>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setParams({ ...(search ? { search } : {}), page: String(page - 1) })}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page * 25 >= data.total} onClick={() => setParams({ ...(search ? { search } : {}), page: String(page + 1) })}>
                    Next
                  </Button>
                </div>
              </div>
            </Stack>
          )
        }
      </QueryState>

      <ImportCustomersDialog open={importing} onOpenChange={setImporting} />
    </Stack>
  );
}
