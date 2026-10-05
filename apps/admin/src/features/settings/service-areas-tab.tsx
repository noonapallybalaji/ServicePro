import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { getListServiceAreasQueryKey, useCreateServiceArea, useListServiceAreas, useUpdateServiceArea, type ServiceAreaResponse } from '@servicepro/api-client';
import { Button, Card, Checkbox, Field, Heading, Input, Stack, Text, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { fieldError } from '../../components/common';

const parsePincodes = (text: string) => text.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);

/** Where the business works: named groups of pincodes (PLAN.md §7.5). Technicians cover areas. */
export function ServiceAreasTab() {
  const areas = useListServiceAreas();
  return (
    <Stack gap={6}>
      <QueryState query={areas} loading={<DefaultSkeleton rows={2} />}>
        {(list) => (
          <ul className="grid gap-4 lg:grid-cols-2">
            {list.map((area) => (
              <li key={area.id}>
                <AreaCard area={area} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <AreaCard />
    </Stack>
  );
}

function AreaCard({ area }: { area?: ServiceAreaResponse }) {
  const [name, setName] = useState(area?.name ?? '');
  const [pincodes, setPincodes] = useState(area?.pincodes.join(', ') ?? '');
  const [active, setActive] = useState(area?.isActive ?? true);
  const queryClient = useQueryClient();
  const onSaved = async () => {
    await queryClient.invalidateQueries({ queryKey: getListServiceAreasQueryKey() });
    toast.success('Service area saved');
    if (!area) {
      setName('');
      setPincodes('');
    }
  };
  const create = useCreateServiceArea({ mutation: { onSuccess: onSaved } });
  const update = useUpdateServiceArea({ mutation: { onSuccess: onSaved } });
  const error = area ? update.error : create.error;
  const data = { name, pincodes: parsePincodes(pincodes), isActive: active };

  return (
    <Card className="flex h-full flex-col gap-3">
      <Heading level={3}>{area ? area.name : 'Add a service area'}</Heading>
      <Field label="Name" error={fieldError(error, 'name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kondapur & Gachibowli" />
      </Field>
      <Field label="Pincodes" hint="Separate with commas or spaces." error={fieldError(error, 'pincodes') ?? fieldError(error, 'pincodes[0]')}>
        <Input value={pincodes} onChange={(e) => setPincodes(e.target.value)} placeholder="500084, 500032" />
      </Field>
      {area ? <Checkbox label="Active" checked={active} onCheckedChange={(v) => setActive(v === true)} /> : null}
      <Text variant="caption" tone="muted">
        {data.pincodes.length} pincode{data.pincodes.length === 1 ? '' : 's'}
      </Text>
      <Button
        size="sm"
        variant={area ? 'outline' : 'primary'}
        className="mt-auto self-start"
        loading={create.isPending || update.isPending}
        disabled={!name || data.pincodes.length === 0}
        onClick={() => (area ? update.mutate({ id: area.id, data }) : create.mutate({ data }))}
      >
        {area ? 'Save' : 'Add area'}
      </Button>
    </Card>
  );
}
