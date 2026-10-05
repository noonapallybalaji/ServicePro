import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import { getListSettingsQueryKey, useListSettings, useUpdateSetting, type SettingView } from '@servicepro/api-client';
import { Badge, Button, Card, Field, Input, Stack, Text, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Configurable rules declared by each module (PLAN.md §2.5): edited as plain values; objects
 * (like dispatch weights) are edited per key so nobody has to write JSON.
 */
export function BusinessRulesTab() {
  const settings = useListSettings();
  return (
    <QueryState query={settings} loading={<DefaultSkeleton rows={4} />}>
      {(list) => (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((setting) => (
            <li key={setting.key}>
              <SettingCard setting={setting} />
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}

type Primitive = string | number | boolean;

function SettingCard({ setting }: { setting: SettingView }) {
  const initial = setting.value as Primitive | Record<string, Primitive>;
  const isObject = typeof initial === 'object' && initial !== null;
  const [value, setValue] = useState<Primitive | Record<string, Primitive>>(initial);
  const queryClient = useQueryClient();
  const update = useUpdateSetting({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListSettingsQueryKey() });
        toast.success('Saved');
      },
    },
  });

  const coerce = (raw: string, like: Primitive): Primitive => (typeof like === 'number' ? Number(raw) : raw);

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Text weight="semibold" className="font-mono text-sm">
          {setting.key}
        </Text>
        {setting.isOverridden ? (
          <Badge size="sm" tone="primary">
            Customised
          </Badge>
        ) : (
          <Badge size="sm">Default</Badge>
        )}
      </div>
      <Text variant="sm" tone="secondary">
        {setting.description}
      </Text>
      {isObject ? (
        <Stack gap={2}>
          {Object.entries(value as Record<string, Primitive>).map(([key, v]) => (
            <Field key={key} label={key}>
              <Input
                inputMode={typeof v === 'number' ? 'decimal' : undefined}
                value={String(v)}
                onChange={(e) => setValue({ ...(value as Record<string, Primitive>), [key]: coerce(e.target.value, v) })}
              />
            </Field>
          ))}
        </Stack>
      ) : (
        <Input
          aria-label={setting.key}
          inputMode={typeof initial === 'number' ? 'decimal' : undefined}
          value={String(value)}
          onChange={(e) => setValue(coerce(e.target.value, initial as Primitive))}
        />
      )}
      <Button size="sm" variant="outline" className="mt-auto self-start" loading={update.isPending} onClick={() => update.mutate({ key: setting.key, data: { value } })}>
        Save
      </Button>
    </Card>
  );
}
