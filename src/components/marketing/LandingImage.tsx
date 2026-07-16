'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type LandingImageProps = {
  /** Path under /public, e.g. "/landing/hero.jpg". Operator drops the real file here. */
  src: string;
  alt: string;
  className?: string;
  /** Extra classes applied only to the fallback placeholder (e.g. aspect ratio). */
  fallbackClassName?: string;
  /** Short label shown inside the placeholder when the file is missing. Defaults to alt. */
  fallbackLabel?: string;
  /** Load eagerly (above-the-fold). Defaults to lazy — existing callers unchanged. */
  eager?: boolean;
};

/**
 * Renders a /public/landing/* image, degrading gracefully to a labelled placeholder
 * if the operator hasn't dropped the file yet (404 → onError). Uses a plain <img>
 * (not next/image) so a missing local asset never throws the optimizer at runtime.
 */
export function LandingImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackLabel,
  eager = false,
}: LandingImageProps) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-secondary-900/95 px-3 text-center',
          className,
          fallbackClassName
        )}
        role="img"
        aria-label={alt}
      >
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/40">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
