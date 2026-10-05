import { DefaultSkeleton, QueryState } from '@servicepro/app-kit';
import {
  getGetFullCatalogQueryKey,
  getGetPriceListQueryKey,
  useCreateCategory,
  useCreateIssueType,
  useCreatePriceListItem,
  useGetFullCatalog,
  useGetPriceList,
  useUpdateCategory,
  type CategoryResponse,
} from '@servicepro/api-client';
import { Badge, Button, Card, Checkbox, Field, Heading, Input, Select, Stack, Text, formatINR, toast } from '@servicepro/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

/** Appliance categories, their common problems, visit charges and standard prices (PLAN.md §7.5). */
export function CatalogTab() {
  const catalog = useGetFullCatalog();
  return (
    <Stack gap={6}>
      <QueryState query={catalog} loading={<DefaultSkeleton rows={3} />}>
        {(categories) => (
          <ul className="grid gap-4 lg:grid-cols-2">
            {categories.map((category) => (
              <li key={category.id}>
                <CategoryCard category={category} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <NewCategoryCard />
      <PriceListCard categories={catalog.data ?? []} />
    </Stack>
  );
}

function useRefreshCatalog() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetFullCatalogQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ['/api/v1/catalog'] }),
    ]);
}

function CategoryCard({ category }: { category: CategoryResponse }) {
  const [name, setName] = useState(category.name);
  const [visit, setVisit] = useState(String(category.baseVisitCharge));
  const [photos, setPhotos] = useState(category.requiresPhotos);
  const [active, setActive] = useState(category.isActive);
  const [issueName, setIssueName] = useState('');
  const refresh = useRefreshCatalog();
  const update = useUpdateCategory({ mutation: { onSuccess: async () => { await refresh(); toast.success(`${name} saved`); } } });
  const addIssue = useCreateIssueType({ mutation: { onSuccess: async () => { await refresh(); setIssueName(''); } } });

  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2">
        <Heading level={3}>{category.name}</Heading>
        <Badge size="sm">{category.code}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Visiting charge (₹)">
          <Input inputMode="decimal" value={visit} onChange={(e) => setVisit(e.target.value)} />
        </Field>
      </div>
      <Checkbox label="After-photo required to complete" checked={photos} onCheckedChange={(v) => setPhotos(v === true)} />
      <Checkbox label="Active (offered to customers)" checked={active} onCheckedChange={(v) => setActive(v === true)} />
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        loading={update.isPending}
        onClick={() =>
          update.mutate({ id: category.id, data: { code: category.code, name, baseVisitCharge: Number(visit), requiresPhotos: photos, sortOrder: category.sortOrder, isActive: active } })
        }
      >
        Save category
      </Button>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <Text variant="overline" tone="muted">
          Common problems
        </Text>
        <div className="flex flex-wrap gap-2">
          {category.issueTypes.map((issue) => (
            <Badge key={issue.id} size="sm" appearance="outline" className={issue.isActive ? undefined : 'opacity-50'}>
              {issue.name} · L{issue.minSkillLevel}
            </Badge>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addIssue.mutate({
              data: { categoryId: category.id, code: issueName.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), name: issueName, typicalDurationMinutes: 60, minSkillLevel: 2, defaultPriority: 'NORMAL', isActive: true },
            });
          }}
        >
          <Input aria-label={`New problem for ${category.name}`} placeholder="Add a problem, e.g. Remote not working" value={issueName} onChange={(e) => setIssueName(e.target.value)} />
          <Button type="submit" size="sm" variant="secondary" loading={addIssue.isPending} disabled={issueName.trim().length < 3}>
            Add
          </Button>
        </form>
      </div>
    </Card>
  );
}

function NewCategoryCard() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [visit, setVisit] = useState('299');
  const refresh = useRefreshCatalog();
  const create = useCreateCategory({ mutation: { onSuccess: async () => { await refresh(); setCode(''); setName(''); toast.success('Category added'); } } });

  return (
    <Card className="flex flex-col gap-3">
      <Heading level={3}>Add a category</Heading>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Code" hint="Short, e.g. CHIMNEY">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Visiting charge (₹)">
          <Input inputMode="decimal" value={visit} onChange={(e) => setVisit(e.target.value)} />
        </Field>
      </div>
      <Button
        size="sm"
        className="self-start"
        loading={create.isPending}
        disabled={!code || !name}
        onClick={() => create.mutate({ data: { code, name, baseVisitCharge: Number(visit), requiresPhotos: false, sortOrder: 99, isActive: true } })}
      >
        Add category
      </Button>
    </Card>
  );
}

function PriceListCard({ categories }: { categories: readonly CategoryResponse[] }) {
  const prices = useGetPriceList();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const add = useCreatePriceListItem({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetPriceListQueryKey() });
        setItemName('');
        setMin('');
        setMax('');
      },
    },
  });
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? '';

  return (
    <Card className="flex flex-col gap-4">
      <Heading level={3}>Standard prices</Heading>
      <Text variant="sm" tone="secondary">
        Technicians pick these when preparing a bill; the range keeps quotes consistent.
      </Text>
      <QueryState query={prices} loading={<DefaultSkeleton rows={1} />}>
        {(list) => (
          <ul className="flex flex-col divide-y divide-border">
            {list.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
                <span>
                  {item.itemName} <span className="text-foreground-muted">· {nameOf(item.categoryId)}</span>
                </span>
                <span className="tabular-nums">
                  {formatINR(item.priceMin)} – {formatINR(item.priceMax)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <div className="grid gap-3 sm:grid-cols-4">
        <Select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="" disabled>
            Category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input aria-label="Item" placeholder="Item, e.g. Gas top-up" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        <Input aria-label="Minimum price" inputMode="decimal" placeholder="Min ₹" value={min} onChange={(e) => setMin(e.target.value)} />
        <Input aria-label="Maximum price" inputMode="decimal" placeholder="Max ₹" value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        loading={add.isPending}
        disabled={!categoryId || !itemName || !min || !max}
        onClick={() => add.mutate({ data: { categoryId, issueTypeId: null, itemName, priceMin: Number(min), priceMax: Number(max), isActive: true } })}
      >
        Add price
      </Button>
    </Card>
  );
}
