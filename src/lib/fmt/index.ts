/**
 * DS2-FMT §2.7 — the ONLY sanctioned path for user-facing values.
 *
 * Import from `@/lib/fmt`, never from the sub-modules, so the surface stays one
 * grep away. The JSX isolation helpers live in `@/components/ui/bdi` (`<Ltr>`,
 * `<Bdi>`) because they are components, not formatters.
 */
export { FSI, LRI, RLI, PDI, isolate, ltrIsolate, stripIsolates } from './bidi';
export {
  GYM_TIME_ZONE,
  fmtDate,
  fmtDateRange,
  fmtTime,
  fmtTimeRange,
  fmtWeekday,
  type DateInput,
  type DateStyle,
} from './date';
export {
  fmtMoney,
  fmtMoneyPair,
  type CurrencyPref,
  type MoneyMode,
  type MoneyParts,
} from './money';
export { fmtPhone } from './phone';
export { enumLabel, humanizeEnum, type EnumDomain, type RootT } from './enum-label';
