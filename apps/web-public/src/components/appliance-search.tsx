import { apiUrl, type CategoryResponse } from '@servicepro/api-client';
import { CategoryTile, Container, cn } from '@servicepro/ui';
import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';

import { SERVICES } from '../content/services';
import { openLocationPicker, useServiceLocation } from '../location/service-location';

/*
 * "What appliance needs repair?": finds an appliance by name or by a common problem ("not cooling"
 * finds AC and Refrigerator) and starts booking it. Used in the home hero on desktop, and pinned under
 * the header on phones and tablets on the pages where people choose an appliance (home, services).
 */

export interface Appliance {
  code: string;
  name: string;
  categoryId?: string;
  /** From the live catalog; the pre-rendered page has none, so no price shows until it loads. */
  visitCharge?: number;
}

/** The service pages' list: what the pre-rendered page (and the moment before the catalog arrives) uses. */
export const FALLBACK_APPLIANCES: Appliance[] = SERVICES.map((s) => ({ code: s.code, name: s.appliance }));

type CatalogState = { data: CategoryResponse[] | null; isPending: boolean; isError: boolean };

// One request per visit, shared by every component that needs the catalog.
let catalogRequest: Promise<CategoryResponse[]> | null = null;
let catalogResult: CatalogState | null = null;

/**
 * The live catalog, fetched in the browser after the pre-rendered page loads (landing pages don't
 * ship React Query; see query.tsx).
 */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>(() => catalogResult ?? { data: null, isPending: true, isError: false });
  useEffect(() => {
    if (catalogResult && !catalogResult.isError) return;
    let cancelled = false;
    catalogRequest ??= fetch(apiUrl('/api/v1/catalog/categories')).then((response) =>
      response.ok ? (response.json() as Promise<CategoryResponse[]>) : Promise.reject(new Error(String(response.status))),
    );
    catalogRequest
      .then((data) => {
        catalogResult = { data, isPending: false, isError: false };
        if (!cancelled) setState(catalogResult);
      })
      .catch(() => {
        catalogRequest = null; // try again next time
        catalogResult = { data: null, isPending: false, isError: true };
        if (!cancelled) setState(catalogResult);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

/** Active categories in display order. */
export function useActiveCategories(): { categories: CategoryResponse[]; catalog: CatalogState } {
  const catalog = useCatalog();
  const categories = useMemo(() => (catalog.data ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [catalog.data]);
  return { categories, catalog };
}

/** Start booking this appliance; without a location yet, ask for it first. */
export function useBookAppliance() {
  const navigate = useNavigate();
  const location = useServiceLocation();
  return (code: string) => {
    const to = `/book?service=${encodeURIComponent(code)}`;
    if (location) void navigate(to);
    else openLocationPicker({ then: to });
  };
}

interface Match {
  key: string;
  label: string;
  detail?: string;
  code: string;
}

/** Appliances, also found by their common problems ("not cooling" finds AC and Refrigerator). */
function matchesFor(query: string, categories: CategoryResponse[]): Match[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  if (categories.length === 0) {
    return FALLBACK_APPLIANCES.filter((a) => hit(`${a.name} ${a.code}`)).map((a) => ({ key: a.code, label: a.name, code: a.code }));
  }

  const results: Match[] = [];
  for (const category of categories) {
    const names = `${category.name} ${category.code} ${category.code === 'FRIDGE' ? 'fridge' : ''}`;
    if (hit(names)) results.push({ key: category.id, label: category.name, code: category.code });
    for (const issue of category.issueTypes.filter((i) => i.isActive)) {
      if (hit(`${names} ${issue.name}`) && !hit(names)) {
        results.push({ key: issue.id, label: issue.name, detail: category.name, code: category.code });
      }
    }
  }

  return results.slice(0, 8);
}

/** compact: the slimmer version pinned under the header. */
export function ApplianceSearch({ compact = false }: { compact?: boolean }) {
  const { categories } = useActiveCategories();
  const book = useBookAppliance();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = matchesFor(query, categories);
  const open = query.trim().length > 0;

  function pick(match: Match | undefined) {
    if (!match) return;
    setQuery('');
    book(match.code);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') setActive((i) => Math.min(i + 1, matches.length - 1));
    else if (event.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (event.key === 'Escape') setQuery('');
    else if (event.key === 'Enter') pick(matches[active]);
    else return;
    event.preventDefault();
  }

  return (
    // A light panel even on the dark hero band (tokens flip back to dark text).
    <div data-surface="light" className="relative">
      <label
        className={cn(
          'flex items-center gap-3 rounded-pill border focus-within:border-primary',
          compact ? 'h-10 border-border bg-surface-sunken px-4' : 'h-12 border-border bg-surface px-4 shadow-md md:h-14 md:px-5',
        )}
      >
        <Search aria-hidden className="size-5 shrink-0 text-foreground-muted" />
        <span className="sr-only">Search for a repair</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          enterKeyHint="search"
          autoComplete="off"
          placeholder="What appliance needs repair?"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-foreground-muted"
        />
      </label>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching repairs"
          className="absolute inset-x-0 top-full z-(--z-sticky) mt-2 max-h-[min(18rem,50dvh)] overflow-y-auto overscroll-contain rounded-card border border-border bg-surface p-1 shadow-lg"
        >
          {matches.length > 0 ? (
            matches.map((match, index) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- combobox: the input handles arrows and Enter (aria-activedescendant)
              <li
                key={match.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(match)}
                className={cn('flex cursor-pointer items-center gap-3 rounded-control px-3 py-2', index === active && 'bg-surface-sunken')}
              >
                <CategoryTile code={match.code} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-foreground">{match.label}</span>
                  {match.detail ? <span className="text-sm text-foreground-secondary">{match.detail}</span> : null}
                </span>
              </li>
            ))
          ) : (
            <li role="option" aria-selected={false} aria-disabled className="px-3 py-3 text-sm text-foreground-secondary">
              No match. Try "AC", "fridge" or "not cooling".
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Phones and tablets: the search pinned just under the header while the page scrolls. */
export function PinnedSearchBar() {
  return (
    <div className="sticky top-[calc(var(--header-height)+env(safe-area-inset-top))] z-(--z-sticky) border-b border-border bg-surface py-2 shadow-sm lg:hidden">
      <Container>
        <ApplianceSearch compact />
      </Container>
    </div>
  );
}
