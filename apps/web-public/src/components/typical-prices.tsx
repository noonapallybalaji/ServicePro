import { apiUrl } from '@servicepro/api-client';
import { formatINR } from '@servicepro/ui';
import { useEffect, useState } from 'react';

import { PageSection } from './page-parts';

interface Price {
  itemName: string;
  priceMin: number;
  priceMax: number;
}

/** "From ₹1,500" or "₹1,500 – ₹2,200". */
export function priceRange(min: number, max: number): string {
  return max > min ? `${formatINR(min)} – ${formatINR(max)}` : formatINR(min);
}

/**
 * Typical repair prices on a service page, straight from the business's price list. Loaded in
 * the browser (pages are pre-rendered) and only shown when the owner has turned prices on;
 * otherwise nothing is rendered.
 */
export function TypicalPrices({ code, appliance }: { code: string; appliance: string }) {
  const [prices, setPrices] = useState<Price[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const categories: { id: string; code: string }[] = await (await fetch(apiUrl('/api/v1/catalog/categories'))).json();
        const category = categories.find((c) => c.code === code);
        if (!category) return;
        const list: Price[] = await (await fetch(apiUrl(`/api/v1/catalog/public-prices?categoryId=${category.id}`))).json();
        if (!cancelled) setPrices(list);
      } catch {
        // No prices shown if they can't be loaded; the visiting charge is still on the page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (prices.length === 0) return null;

  return (
    <PageSection id="prices" title={`Typical ${appliance} repair prices`} intro="What these jobs usually cost, on top of the visiting charge. The technician confirms the exact price before starting.">
      <ul className="flex max-w-sheet flex-col divide-y divide-border rounded-card border border-border bg-surface">
        {prices.map((p) => (
          <li key={p.itemName} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <span className="text-body text-foreground">{p.itemName}</span>
            <span className="shrink-0 text-body font-semibold tabular-nums">{priceRange(p.priceMin, p.priceMax)}</span>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
