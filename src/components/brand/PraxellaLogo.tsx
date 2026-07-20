import { cn } from '@/lib/utils';
import { PLATFORM_BRAND } from '@/lib/brand';
import { PraxellaMark } from './PraxellaMark';

/**
 * PRAXELLA-BRAND — the Praxella logo lockup (single source): mark + the wordmark
 * rendered in Anton (the existing display face) uppercase, tracked +9%, with the
 * X in Flare (its own span). Used on the vendor landing nav/hero/footer AND the
 * vendor console header — one component, no per-page redraws.
 *
 * The wordmark stays LATIN Anton in every locale (a brand name is not translated),
 * so it uses the global `.px-wordmark` class (NOT `.font-display`, which switches
 * to Alexandria under [dir=rtl]). `mono` passes through to the mark. Color the
 * mark corners + wordmark via `currentColor` on the container.
 */
export function PraxellaLogo({
  markSize = 30,
  className,
  wordClassName,
  mono = false,
}: {
  markSize?: number;
  className?: string;
  wordClassName?: string;
  mono?: boolean;
}) {
  // "Pra" + Flare "x" + "ella" — the X is always coral; split so it can be colored.
  const name = PLATFORM_BRAND.name; // "Praxella"
  const xi = name.toLowerCase().indexOf('x');
  const pre = name.slice(0, xi);
  const x = name.slice(xi, xi + 1);
  const post = name.slice(xi + 1);

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} aria-label={name}>
      <PraxellaMark size={markSize} variant={mono ? 'mono' : 'default'} />
      <span className={cn('px-wordmark', wordClassName)} aria-hidden="true">
        {pre}
        <span className="text-flare">{x}</span>
        {post}
      </span>
    </span>
  );
}
