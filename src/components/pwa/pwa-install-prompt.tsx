// ============================================================
// D6: PWA Install Prompt Component
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================
// Shows a native-like install prompt when PWA criteria are met.
// Also monitors online/offline status with visual indicator.
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallPromptProps {
  locale: string;
  dictionaries: {
    installTitle: string;
    installDescription: string;
    installButton: string;
    dismissButton: string;
    offlineTitle: string;
    offlineDescription: string;
    backOnline: string;
  };
  /**
   * OFF-1: when this prompt is mounted alongside the shell-level `OfflineBanner`
   * (which owns the offline indicator), suppress this component's own offline bar
   * so the two don't double up. Defaults true to preserve standalone usage.
   */
  showOfflineBar?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────

export function PwaInstallPrompt({
  locale,
  dictionaries: d,
  showOfflineBar = true,
}: PwaInstallPromptProps) {
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isAr = locale === 'ar';

  // ─── Install Prompt Detection ─────────────────────────────────────

  useEffect(() => {
    const handler = (event: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if already installed as PWA
    const isStandalone = window.matchMedia(
      '(display-mode: standalone)',
    ).matches;
    if (isStandalone) {
      setShowInstall(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // Check if user previously dismissed
  useEffect(() => {
    const saved = localStorage.getItem('pwa_install_dismissed');
    if (saved) {
      setDismissed(true);
      setShowInstall(false);
    }
  }, []);

  // ─── Network Status ───────────────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Install Handler ──────────────────────────────────────────────

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        setShowInstall(false);
      }
    } catch {
      // User dismissed
    }

    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowInstall(false);
    setDismissed(true);
    localStorage.setItem('pwa_install_dismissed', 'true');
  }, []);

  // ─── Don't show if already PWA or dismissed ─────────────────────────

  // OFF-1: when the shell owns the offline indicator, this component is install-only.
  const offlineVisible = showOfflineBar && isOffline;
  if (!showInstall && !offlineVisible) return null;
  if (dismissed && !offlineVisible) return null;

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className={cn('fixed bottom-0 left-0 right-0 z-50', isAr && 'rtl')}>
      {/* Offline Bar */}
      {offlineVisible && (
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 animate-in slide-in-from-bottom',
            'bg-amber-50 border-t border-amber-200',
          )}
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              {d.offlineTitle}
            </p>
            <p className="text-xs text-amber-700">{d.offlineDescription}</p>
          </div>
        </div>
      )}

      {/* Install Prompt */}
      {showInstall && !isOffline && (
        <div
          className={cn(
            'flex items-center gap-4 px-4 py-4 animate-in slide-in-from-bottom',
            'bg-white border-t shadow-lg',
          )}
        >
          <div className="flex-shrink-0">
            <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[#cd1419] text-primary-foreground font-extrabold text-lg shadow-md">
              PL
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{d.installTitle}</p>
            <p className="text-xs text-gray-500 mt-0.5">{d.installDescription}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {d.dismissButton}
            </button>
            <button
              onClick={handleInstall}
              className="rounded-lg bg-[#cd1419] px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-[#b01216] transition-colors shadow-sm"
            >
              {d.installButton}
            </button>
          </div>
        </div>
      )}

      {/* Back Online Toast */}
      {!isOffline && (
        <div
          id="back-online-toast"
          className="hidden"
        />
      )}
    </div>
  );
}
