import { defineConfig } from 'orval';

/**
 * Generates typed fetchers + TanStack Query hooks from the API's OpenAPI contract (ADR 0007).
 * Regenerate after any API change:  pnpm --filter @servicepro/api-client generate
 */
export default defineConfig({
  servicepro: {
    input: {
      target: '../../apps/api/openapi/servicepro.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/generated/endpoints',
      schemas: 'src/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        mutator: {
          path: 'src/http.ts',
          name: 'apiFetch',
        },
        fetch: {
          includeHttpResponseReturnType: false,
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
        },
      },
    },
  },
});
