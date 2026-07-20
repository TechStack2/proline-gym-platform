'use client';

/**
 * DS 2.0 §2.5 — the one modal primitive: radix `Dialog` rendered through the
 * existing `ModalPortal`.
 *
 * DA-30: three competing modal patterns and no primitive — 17 hand-rolled
 * `fixed inset-0` overlays, a non-portaled `SwipeableSheet`, and the toast layer.
 * `@radix-ui/react-dialog` has been a dependency the whole time with zero
 * imports; this is its first consumer.
 *
 * Why radix INSIDE `ModalPortal` rather than radix's own `Dialog.Portal`:
 * `ModalPortal` carries a behaviour radix has no equivalent for — it detects the
 * *inactive* copy of a double-mounted shell (`offsetParent === null` under a
 * `display:none` ancestor) and renders nothing, which is what keeps this codebase
 * from opening two modals at once. It also only relocates the subtree when an
 * ancestor `transform` actually exists (the documented `PageTransition`
 * position:fixed trap), leaving the DOM alone otherwise. Radix contributes what
 * the hand-rolled overlays never had: focus trap, `Esc`, scroll lock, and
 * `aria-labelledby`/`describedby` wiring.
 *
 * Not adopted in W1-FOUNDATION — the 17 overlay migrations are their own
 * grep-driven slice. This lands the primitive so no NEW overlay is hand-rolled.
 */

import * as React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalPortal } from '@/components/shared/modal-portal';

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required — radix wires it to `aria-labelledby`. */
  title: React.ReactNode;
  /** Optional supporting line, wired to `aria-describedby`. */
  description?: React.ReactNode;
  /** `center` = desktop default; `sheet` = mobile bottom-sheet. */
  variant?: 'center' | 'sheet';
  /** Hide the title visually while keeping it for assistive tech. */
  hideTitle?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeLabel?: string;
  className?: string;
  'data-testid'?: string;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  variant = 'center',
  hideTitle = false,
  children,
  footer,
  closeLabel = 'Close',
  className,
  'data-testid': testId,
}: DialogProps) {
  if (!open) return null;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <ModalPortal>
        <RadixDialog.Overlay
          data-testid="dialog-overlay"
          className={cn(
            'fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm',
            variant === 'sheet' ? 'flex items-end' : 'flex items-center justify-center p-4',
          )}
        >
          <RadixDialog.Content
            data-testid={testId ?? 'dialog'}
            className={cn(
              'relative w-full bg-white shadow-xl focus:outline-none',
              variant === 'sheet'
                ? 'max-h-[90vh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]'
                : 'max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl',
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-4">
              <div className="min-w-0">
                <RadixDialog.Title
                  className={cn(
                    'text-h3 font-bold text-gray-900',
                    hideTitle && 'sr-only',
                  )}
                >
                  {title}
                </RadixDialog.Title>
                {description && (
                  <RadixDialog.Description className="mt-1 text-sm text-gray-500">
                    {description}
                  </RadixDialog.Description>
                )}
              </div>
              <RadixDialog.Close
                aria-label={closeLabel}
                data-testid="dialog-close"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--shell-accent)]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </RadixDialog.Close>
            </div>

            <div className="p-4">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-gray-100 p-4">
                {footer}
              </div>
            )}
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </ModalPortal>
    </RadixDialog.Root>
  );
}
