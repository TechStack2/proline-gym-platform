/**
 * OWNER-RESET — mask an email for a confirmation prompt.
 *
 * The vendor console shows WHICH account is about to have its password reset, so the
 * platform admin can catch "wrong gym" or "wrong person" BEFORE issuing a credential.
 * That means the string has to do two contradictory jobs: identify the account well
 * enough to confirm it, without printing a full address into a shared support screen.
 *
 * The compromise: keep the first character (and the last, when the local part is long
 * enough that one character is not most of it), and keep the DOMAIN intact. The domain
 * is what actually distinguishes `o***r@proline.lb` from `o***r@gmail.com`, which is
 * exactly the mistake a confirmation step exists to catch.
 *
 * Not a security boundary — a platform admin can read the address by other means. It
 * is there so a credential-reset screen does not casually display someone's full email
 * to whoever is looking at it.
 */

/** `owner@proline.lb` → `o***r@proline.lb`. Never throws; unparseable input is fully masked. */
export function maskEmail(email: string | null | undefined): string {
  const raw = (email ?? '').trim();
  if (!raw) return '—';

  const at = raw.lastIndexOf('@');
  // No '@' (or nothing before/after it): we do not understand it, so reveal nothing.
  if (at <= 0 || at === raw.length - 1) return '***';

  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);

  // A 1–3 char local part is short enough that first+last would be nearly all of it.
  const masked = local.length >= 4 ? `${local[0]}***${local[local.length - 1]}` : `${local[0]}***`;
  return `${masked}@${domain}`;
}
