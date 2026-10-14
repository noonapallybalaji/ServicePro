import { Text } from '@servicepro/ui';

/**
 * Shown next to the button that books or signs in: pressing it is the customer's agreement,
 * which the API records with the policy version. Links open in a new tab so a half-filled
 * booking isn't lost.
 */
export function PolicyNotice({ action }: { action: string }) {
  return (
    <Text variant="caption" tone="muted">
      By {action}, you agree to our{' '}
      <a className="link" href="/terms" target="_blank" rel="noreferrer">
        terms
      </a>{' '}
      and{' '}
      <a className="link" href="/privacy" target="_blank" rel="noreferrer">
        privacy policy
      </a>
      .
    </Text>
  );
}
