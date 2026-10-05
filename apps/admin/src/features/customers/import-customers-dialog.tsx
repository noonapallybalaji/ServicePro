import { getSearchCustomersQueryKey, useImportCustomers, type ImportCustomersResponse } from '@servicepro/api-client';
import { Alert, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Field, Input, Stack, Text } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/** One-off import of the existing customer list (PLAN.md §16 Phase 0). Existing phones are skipped. */
export function ImportCustomersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportCustomersResponse | null>(null);
  const queryClient = useQueryClient();
  const importCustomers = useImportCustomers({
    mutation: {
      onSuccess: async (response) => {
        setResult(response);
        await queryClient.invalidateQueries({ queryKey: getSearchCustomersQueryKey() });
      },
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setFile(null);
          setResult(null);
        }

        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader title="Import customers" description="CSV with a header row: name, phone, alternate_phone, email, line1, line2, landmark, locality, city, state, pincode." />
        <DialogBody>
          <Stack gap={4}>
            <Field label="CSV file" hint="Only name and phone are required. Numbers already in the system are skipped, never overwritten.">
              <Input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </Field>
            {result ? (
              <Alert
                tone={result.errors.length > 0 ? 'warning' : 'success'}
                title={`${result.created} added · ${result.skippedExisting} already existed`}
                description={
                  result.errors.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {result.errors.slice(0, 10).map((e) => (
                        <li key={e.row}>
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                      {result.errors.length > 10 ? <li>…and {result.errors.length - 10} more</li> : null}
                    </ul>
                  ) : undefined
                }
              />
            ) : (
              <Text variant="sm" tone="secondary">
                Tip: export from Excel or Google Sheets as "CSV UTF-8".
              </Text>
            )}
          </Stack>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result ? (
            <Button loading={importCustomers.isPending} disabled={!file} onClick={() => file && importCustomers.mutate({ data: { file } })}>
              Import
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
