'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

// DS-2: light / dark / system theme toggle. Persists the choice in localStorage
// (key 'theme') — the SAME key the root layout's no-FOUC init script reads before
// first paint. Default is SYSTEM (no stored value → follows prefers-color-scheme).
// Applies the theme by toggling `.dark` on <html> (the class the channel-var flip +
// the Tailwind `darkMode:'class'` config key off). Cycles light → dark → system.
type ThemeMode = 'light' | 'dark' | 'system';
const ORDER: ThemeMode[] = ['light', 'dark', 'system'];
const ICON: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('theme');
  const [mode, setMode] = useState<ThemeMode>('system');
  const [mounted, setMounted] = useState(false);

  // Read the persisted choice AFTER mount. SSR + the first client render both use
  // the 'system' default (mounted=false) so hydration matches; this then promotes
  // to the stored value with no mismatch warning.
  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') setMode(stored);
    setMounted(true);
  }, []);

  // While on 'system', track live OS light/dark changes.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const cycle = useCallback(() => {
    setMode((prev) => {
      const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
      localStorage.setItem('theme', next);
      applyTheme(next);
      return next;
    });
  }, []);

  const active: ThemeMode = mounted ? mode : 'system';
  const Icon = ICON[active];
  const label = t('cycle', { mode: t(active) });

  return (
    <button
      type="button"
      onClick={cycle}
      data-testid="theme-toggle"
      data-theme-mode={active}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
