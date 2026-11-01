/*
 * The pass an applicant's status page uses: issued when they sign in with a code while their
 * application is open (or verify their number on the sign-up form). It proves the number for an
 * hour, so it also lets them apply again after a refusal without another code.
 */

const KEY = 'pakkafix.partner.status';
/** The API's pass lasts an hour; stop trusting it a little before. */
const TRUST_FOR_MS = 55 * 60_000;

export interface StatusPass {
  /** 10 digits */
  phone: string;
  token: string;
  until: string;
}

export function rememberStatusPass(phone: string, token: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ phone, token, until: new Date(Date.now() + TRUST_FOR_MS).toISOString() } satisfies StatusPass));
  } catch {
    // Private mode: the status page asks them to sign in again.
  }
}

export function readStatusPass(): StatusPass | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as StatusPass | null;
    return saved && Date.parse(saved.until) > Date.now() ? saved : null;
  } catch {
    return null;
  }
}
