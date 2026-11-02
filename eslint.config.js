import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-server/**', '**/dev-dist/**', '**/node_modules/**', '**/generated/**', 'apps/api/**', '.cache/**', 'apps/customer/android/**', 'apps/customer/ios/**', 'apps/customer/.expo/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  jsxA11y.flatConfigs.recommended,
  {
    // Build and tooling scripts run in Node (and pass callbacks to a headless browser).
    files: ['**/scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      // Design-system rule: styling goes through tokens/utilities, not inline styles.
      // Genuine exceptions (data-driven values) must be disabled inline with a reason.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='style']",
          message: 'Use design tokens and utility classes instead of inline styles.',
        },
      ],
    },
  },
  {
    // The customer phone app (React Native): styles are style props built from src/lib/theme.ts,
    // images are bundled with require(), and focusing the first field of a sign-in form is expected.
    files: ['apps/customer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'jsx-a11y/no-autofocus': 'off',
    },
  },
);
