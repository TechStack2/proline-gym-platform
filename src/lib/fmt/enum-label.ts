/**
 * DS2-FMT §2.7 — `enumLabel`: the ONLY path by which a database enum reaches the
 * DOM. DA-9 measured what happens without one: team cards rendered "black_1", and
 * English belt names sat inside Arabic UI.
 *
 * Domains map to i18n namespaces, so a new enum value is a missing KEY (which the
 * §2.7 gate catches) rather than a raw token shipped to a member. The belt domain
 * delegates to `beltRankLabel` (W0) — one belt vocabulary, not two.
 */
import { beltRankLabel } from '@/lib/belts/label';

/** A root-scoped next-intl translator: `useTranslations()` / `getTranslations()`. */
export type RootT = (key: string) => string;

export type EnumDomain = 'belts' | 'status';

/** domain → the i18n namespace that holds its value labels. */
const DOMAIN_NAMESPACE: Record<EnumDomain, string> = {
  belts: 'beltRanks',
  status: 'statuses',
};

/**
 * Title-case a raw enum so a schema value the i18n maps have not caught up with
 * still reads like a label ("black_1" → "Black 1") instead of leaking the token.
 * Space-separated, matching `beltRankLabel` (compounds stay greppable).
 */
export function humanizeEnum(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Localized label for an enum value.
 *
 * `t` must be root-scoped so this can resolve `beltRanks.*` and `statuses.*`
 * without the caller knowing which namespace a domain lives in.
 */
export function enumLabel(
  domain: EnumDomain,
  value: string | null | undefined,
  t: RootT,
  empty = '—',
): string {
  if (!value) return empty;
  if (domain === 'belts') {
    return beltRankLabel(value, (key) => t(`${DOMAIN_NAMESPACE.belts}.${key}`), empty);
  }
  const key = `${DOMAIN_NAMESPACE[domain]}.${value}`;
  const label = t(key);
  // next-intl returns the KEY PATH when a message is missing (and the gate turns
  // that into a failure in CI) — never render the path itself to a user.
  return label === key || label.endsWith(`.${value}`) ? humanizeEnum(value) : label;
}
