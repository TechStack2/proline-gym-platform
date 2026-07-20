/**
 * DS2-FMT §2.7 — the JSX half of bidi isolation (see src/lib/fmt/bidi.ts for the
 * string half and for why there are two).
 *
 * These wrap a value in a real isolation boundary WITHOUT injecting Unicode
 * control characters, so `textContent` is byte-identical to what the site
 * rendered before adoption — which is what keeps the e2e suite (and its exact
 * `toHaveText` money assertions) passing through a formatting migration.
 *
 * `unicode-bidi: isolate` is written explicitly rather than relying on the UA
 * stylesheet's `[dir] { unicode-bidi: isolate }`, and as a Tailwind arbitrary
 * property rather than an inline `style` — the production CSP keeps `style-src`
 * relaxed, but arbitrary-property classes cost nothing and never depend on it.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

type IsolateProps = React.HTMLAttributes<HTMLSpanElement> & {
  children: React.ReactNode;
};

/**
 * Force-LTR isolation. The default for values with no strong character of their
 * own — dates, times, money, phones, invoice numbers, codes. In Arabic these
 * would otherwise take the paragraph direction and mangle (DA-7).
 */
export function Ltr({ className, children, ...props }: IsolateProps) {
  return (
    <span dir="ltr" className={cn('[unicode-bidi:isolate]', className)} {...props}>
      {children}
    </span>
  );
}

/**
 * First-strong isolation — direction comes from the value itself. For text whose
 * direction is genuinely data-dependent: member names, gym names, class names,
 * anything a tenant typed. Uses the native `<bdi>` element.
 */
export function Bdi({ className, children, ...props }: IsolateProps) {
  return (
    <bdi dir="auto" className={cn('[unicode-bidi:isolate]', className)} {...props}>
      {children}
    </bdi>
  );
}
