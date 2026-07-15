/**
 * PRAXELLA-BRAND — the Praxella mark (single source).
 *
 * A 3×3 "session grid": four corner slots (currentColor) + a center slot that is
 * the coral "booked slot" (Flare #FF5A36) forming the X of pra·X·ella. Reads at
 * favicon size; builds from plain rounded rects. See docs/demo/praxella-landing-design.html.
 *
 *  · default  — corners inherit `currentColor`, center is Flare (two-color).
 *  · mono     — all five cells inherit `currentColor` (single-color fallback for
 *               constrained/monochrome contexts, e.g. on a Flare button).
 *
 * Pure SVG, no client hooks — usable in any server/client tree. Color the corners
 * by setting text color on an ancestor; the center stays Flare unless `mono`.
 */
export const FLARE = '#FF5A36';

export function PraxellaMark({
  size = 24,
  variant = 'default',
  className,
  title,
}: {
  size?: number;
  variant?: 'default' | 'mono';
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <g fill="currentColor">
        <rect x="0" y="0" width="6" height="6" rx="1.8" />
        <rect x="18" y="0" width="6" height="6" rx="1.8" />
        <rect x="0" y="18" width="6" height="6" rx="1.8" />
        <rect x="18" y="18" width="6" height="6" rx="1.8" />
      </g>
      <rect x="9" y="9" width="6" height="6" rx="1.8" fill={variant === 'mono' ? 'currentColor' : FLARE} />
    </svg>
  );
}
