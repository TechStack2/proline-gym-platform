import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Mail, Globe, Camera, Loader2, Palette,
  ImageIcon, type LucideIcon,
} from 'lucide-react';
import { downscaleImage } from '@/components/shared/avatar-upload';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { saveGymSettings } from './gym-actions';
import { TimezonePicker } from './timezone-picker';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

type GymData = {
  id?: string;
  name_ar?: string;
  name_en?: string;
  name_fr?: string;
  address_ar?: string;
  address_en?: string;
  address_fr?: string;
  phone?: string;
  email?: string;
  website?: string;
  timezone?: string;
  currency_preference?: string;
  logo_url?: string;
  city?: string;
  country?: string;
  // 000072 branding
  brand_color?: string;
  hero_image_url?: string;
  tagline_ar?: string;
  tagline_en?: string;
  tagline_fr?: string;
} | null;

type Props = {
  gym: GymData;
  locale: string;
};

// SETTINGS-LIVE: module-scope labelled-field wrapper (FORM-FOCUS-SWEEP rule — an
// in-render component would remount its <Input> on every keystroke). J5: an optional
// `hint` caption backs the en→ar/fr fallback hint under trilingual fields.
const F = ({ label, children, rtlLabel, hint }: { label: string; children: React.ReactNode; rtlLabel?: boolean; hint?: string }) => (
  <div className="space-y-1">
    <label className={cn('text-xs font-medium text-gray-600', rtlLabel && 'font-arabic')}>{label}</label>
    {children}
    {hint && <p className={cn('text-2xs text-gray-400', rtlLabel && 'font-arabic')}>{hint}</p>}
  </div>
);

// J5 SETTINGS-REFIT: a titled section card — the "never a 16-field flat wall" grouping.
const Section = ({ icon: Icon, title, rtl, id, children }: { icon: LucideIcon; title: string; rtl: boolean; id?: string; children: React.ReactNode }) => (
  <Card id={id} className={cn('rounded-2xl shadow-sm', id && 'scroll-mt-24')}>
    <CardHeader className="pb-3">
      <CardTitle className={cn('flex items-center gap-2 text-base font-semibold text-gray-900', rtl && 'font-arabic')}>
        <Icon className="h-4 w-4 text-primary-600" /> {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">{children}</CardContent>
  </Card>
);

const CURRENCIES = ['USD', 'LBP', 'BOTH'] as const;

/** Upload the gym logo (avatar-upload pattern: downscale → avatars bucket upsert
 * at `<gymId>/gym-logo.jpg` (staff path-scope, 000039) → gyms.logo_url, caller RLS). */
async function uploadGymLogo(gymId: string, file: File): Promise<string> {
  const supabase = createClient();
  const blob = await downscaleImage(file);
  const path = `${gymId}/gym-logo.jpg`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (upErr) throw upErr;
  // AVATAR-PATHS: persist the RELATIVE object path (project-portable); the read side
  // resolves it. Return a freshly-versioned absolute url for the optimistic UI only.
  const { error: gymErr } = await supabase.from('gyms').update({ logo_url: path }).eq('id', gymId);
  if (gymErr) throw gymErr;
  return storagePublicUrl('avatars', path, Date.now());
}

/** J5: upload the gym hero — mirrors the logo, into the PUBLIC 'gym-landing' bucket
 * (000079; admin-write RLS, path must be `<gymId>/…`). Stores the RELATIVE path
 * (AVATAR-PATHS), never an absolute URL; the read sites resolve it via storagePublicUrl. */
async function uploadGymHero(gymId: string, file: File): Promise<string> {
  const supabase = createClient();
  const blob = await downscaleImage(file, 1280, 0.82); // hero is full-bleed → allow more pixels
  const path = `${gymId}/hero.jpg`;
  const { error: upErr } = await supabase.storage.from('gym-landing').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  });
  if (upErr) throw upErr;
  const { error: gymErr } = await supabase.from('gyms').update({ hero_image_url: path }).eq('id', gymId);
  if (gymErr) throw gymErr;
  return path; // RELATIVE path — the form state + persistence use it; preview resolves it
}

export function GymSettings({ gym, locale }: Props) {
  const t = useTranslations('settings');
  const router = useRouter();
  const isRTL = locale === 'ar';

  const [form, setForm] = useState(() => ({
    name_ar: gym?.name_ar ?? '',
    name_en: gym?.name_en ?? '',
    name_fr: gym?.name_fr ?? '',
    address_ar: gym?.address_ar ?? '',
    address_en: gym?.address_en ?? '',
    address_fr: gym?.address_fr ?? '',
    phone: gym?.phone ?? '',
    email: gym?.email ?? '',
    website: gym?.website ?? '',
    timezone: gym?.timezone ?? '',
    currency_preference: gym?.currency_preference ?? '',
    brand_color: gym?.brand_color ?? '',
    hero_image_url: gym?.hero_image_url ?? '',
    tagline_ar: gym?.tagline_ar ?? '',
    tagline_en: gym?.tagline_en ?? '',
    tagline_fr: gym?.tagline_fr ?? '',
  }));
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // J5: which single field a validation failure maps to (per-field inline error);
  // form-level failures leave this null and only surface in the banner (the fallback).
  const [fieldError, setFieldError] = useState<'brand_color' | 'currency_preference' | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState(gym?.logo_url ?? '');
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroVersion, setHeroVersion] = useState<number | undefined>(undefined);

  // J4 CLASS-SURFACE: land the checklist's Branding deep-link (?tab=gym#branding) ON
  // the Branding section. Native hash-scroll can miss because this tab's content
  // mounts client-side after the browser's initial scroll, so scroll it in on mount.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#branding') {
      document.getElementById('branding')?.scrollIntoView({ block: 'start' });
    }
  }, []);

  if (!gym) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Building2 className="h-10 w-10 mb-2" />
        <p className={cn('text-sm', isRTL && 'font-arabic')}>
          {t('gym.noData')}
        </p>
      </div>
    );
  }

  const gymName = locale === 'ar' ? gym.name_ar : locale === 'fr' ? gym.name_fr : gym.name_en;
  const address = locale === 'ar' ? gym.address_ar : locale === 'fr' ? gym.address_fr : gym.address_en;
  const heroSrc = storagePublicUrl('gym-landing', form.hero_image_url, heroVersion);
  const reuseHint = t('gym.reuseEnglishHint');

  const save = async () => {
    setSaving(true); setSaved(false); setError(''); setFieldError(null);
    // J5: en→ar/fr fallback at write time (the managers' pattern) — a blank ar/fr
    // reuses the trimmed English value. Applied to the payload only; the form keeps
    // showing blanks so the "leave blank to reuse English" hint stays truthful.
    const fb = (val: string, en: string) => val.trim() || en.trim();
    const payload = {
      ...form,
      name_ar: fb(form.name_ar, form.name_en),
      name_fr: fb(form.name_fr, form.name_en),
      address_ar: fb(form.address_ar, form.address_en),
      address_fr: fb(form.address_fr, form.address_en),
      tagline_ar: fb(form.tagline_ar, form.tagline_en),
      tagline_fr: fb(form.tagline_fr, form.tagline_en),
    };
    const res = await saveGymSettings(payload);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } else {
      setError(t(`gym.err.${res.error}` as Parameters<typeof t>[0]) || res.error);
      if (res.error === 'invalid_color') setFieldError('brand_color');
      else if (res.error === 'invalid_currency') setFieldError('currency_preference');
    }
  };

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gym.id) return;
    setLogoBusy(true); setError('');
    try {
      const url = await uploadGymLogo(gym.id, file);
      setLogoUrl(url);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || t('gym.saveFailed'));
    } finally {
      setLogoBusy(false);
      e.target.value = '';
    }
  };

  const onPickHero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gym.id) return;
    setHeroBusy(true); setError('');
    try {
      const path = await uploadGymHero(gym.id, file);
      setForm((prev) => ({ ...prev, hero_image_url: path })); // relative path, mirrors the DB
      setHeroVersion(Date.now()); // bust the preview cache
      router.refresh();
    } catch (err: any) {
      // gym-landing write RLS is is_gym_admin() — a non-admin surfaces here, not silently.
      setError(err?.message || t('gym.saveFailed'));
    } finally {
      setHeroBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* J5b: compact identity header — logo (editable in place) + gym name. The legacy
          read-only "Gym Information" card is removed; the sectioned form below is the
          single source of truth for every field (zero duplicated data). */}
      <div className="flex items-center gap-3">
        <label className="group relative cursor-pointer" data-testid="gym-logo-upload">
          {logoUrl ? (
            <img
              src={storagePublicUrl('avatars', logoUrl)}
              alt={gymName || 'Gym logo'}
              className="h-14 w-14 rounded-xl object-cover border"
            />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-primary-50 flex items-center justify-center">
              <Building2 className="h-7 w-7 text-primary-500" />
            </div>
          )}
          <span className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#cd1419] text-primary-foreground ring-2 ring-white">
            {logoBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          </span>
          <input type="file" accept="image/*" className="hidden" data-testid="gym-logo-input" onChange={onPickLogo} />
        </label>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="gym-header-name">
          {gymName || t('gym.unnamed')}
        </h2>
      </div>

      {/* ── Identity ── */}
      <Section icon={Building2} title={t('gym.sectionIdentity')} rtl={isRTL}>
        <F label={t('gym.nameEn')}>
          <Input data-testid="gym-name-en" value={form.name_en} onChange={set('name_en')} className="rounded-lg border p-2" placeholder={t('gym.enterEnglishName')} />
        </F>
        <F label={t('gym.nameAr')} rtlLabel={isRTL} hint={reuseHint}>
          <Input data-testid="gym-name-ar" dir="rtl" value={form.name_ar} onChange={set('name_ar')} className="rounded-lg border p-2" placeholder={t('gym.enterArabicName')} />
        </F>
        <F label={t('gym.nameFr')} hint={reuseHint}>
          <Input data-testid="gym-name-fr" value={form.name_fr} onChange={set('name_fr')} className="rounded-lg border p-2" placeholder={t('gym.enterFrenchName')} />
        </F>
      </Section>

      {/* ── Contact ── */}
      <Section icon={Mail} title={t('gym.sectionContact')} rtl={isRTL}>
        <div className="grid grid-cols-2 gap-3">
          <F label={t('gym.phone')}>
            <Input data-testid="gym-phone" dir="ltr" value={form.phone} onChange={set('phone')} className="rounded-lg border p-2" type="tel" />
          </F>
          <F label="Email">
            <Input data-testid="gym-email" dir="ltr" value={form.email} onChange={set('email')} className="rounded-lg border p-2" type="email" />
          </F>
        </div>
        <F label={t('gym.website')}>
          <Input data-testid="gym-website" dir="ltr" value={form.website} onChange={set('website')} className="rounded-lg border p-2" type="url" placeholder="https://…" />
        </F>
        <F label={t('gym.addressEn')}>
          <Input data-testid="gym-address-en" value={form.address_en} onChange={set('address_en')} className="rounded-lg border p-2" />
        </F>
        <F label={t('gym.addressAr')} rtlLabel={isRTL} hint={reuseHint}>
          <Input data-testid="gym-address-ar" dir="rtl" value={form.address_ar} onChange={set('address_ar')} className="rounded-lg border p-2" />
        </F>
        <F label={t('gym.addressFr')} hint={reuseHint}>
          <Input data-testid="gym-address-fr" value={form.address_fr} onChange={set('address_fr')} className="rounded-lg border p-2" />
        </F>
      </Section>

      {/* ── Localization (pickers, no free-text for closed sets) ── */}
      <Section icon={Globe} title={t('gym.sectionLocalization')} rtl={isRTL}>
        <F label={t('gym.timezone')}>
          <TimezonePicker value={form.timezone} onChange={(tz) => setForm((prev) => ({ ...prev, timezone: tz }))} />
        </F>
        <F label={t('gym.currencyPreference')} rtlLabel={isRTL}>
          <div className="flex gap-2" data-testid="gym-currency" data-value={form.currency_preference}>
            {CURRENCIES.map((c) => {
              const active = form.currency_preference.toUpperCase() === c;
              return (
                <button
                  key={c}
                  type="button"
                  data-testid="gym-currency-chip"
                  data-value={c}
                  data-active={active}
                  onClick={() => setForm((prev) => ({ ...prev, currency_preference: c }))}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                    active ? 'border-[#cd1419] bg-[#cd1419] text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                  )}
                >
                  {c === 'BOTH' ? t('gym.currencyBoth') : c}
                </button>
              );
            })}
          </div>
          {fieldError === 'currency_preference' && (
            <p data-testid="gym-err-currency" className="text-xs text-red-600">{t('gym.err.invalid_currency')}</p>
          )}
        </F>
        {/* J5b: interface-language switcher — re-homed from the old always-visible card.
            It sets the per-DEVICE UI locale (NEXT_LOCALE cookie + route), NOT a gym-wide
            default, so the copy says "this device". Keeps the settings-language testid. */}
        <div data-testid="settings-language" className="space-y-1.5">
          <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>{t('gym.interfaceLanguage')}</label>
          <p className={cn('text-2xs text-gray-400', isRTL && 'font-arabic')}>{t('gym.interfaceLanguageHint')}</p>
          <LanguageSwitcher locale={locale} variant="inline" />
        </div>
      </Section>

      {/* ── Branding (000072) — id="branding" is the checklist deep-link target ── */}
      <Section icon={Palette} title={t('gym.branding')} rtl={isRTL} id="branding">
        <div className="grid grid-cols-2 gap-3">
          <F label={t('gym.brandColor')} rtlLabel={isRTL}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t('gym.brandColor')}
                value={/^#[0-9a-fA-F]{6}$/.test(form.brand_color) ? form.brand_color : '#cd1419'}
                onChange={(e) => setForm((prev) => ({ ...prev, brand_color: e.target.value }))}
                className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-0.5"
              />
              <Input data-testid="gym-brand-color" dir="ltr" value={form.brand_color} onChange={set('brand_color')} className="rounded-lg border p-2 font-mono" placeholder="#cd1419" />
            </div>
            {fieldError === 'brand_color' && (
              <p data-testid="gym-err-brand-color" className="mt-1 text-xs text-red-600">{t('gym.err.invalid_color')}</p>
            )}
          </F>

          {/* HERO — upload to the gym-landing bucket (relative path) + preview + URL escape hatch */}
          <F label={t('gym.heroImage')} rtlLabel={isRTL}>
            <label className="group relative block cursor-pointer" data-testid="gym-hero-upload">
              {heroSrc ? (
                <img src={heroSrc} alt={t('gym.heroImage')} className="h-20 w-full rounded-lg border object-cover" />
              ) : (
                <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-400">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <span className="absolute bottom-1 end-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#cd1419] text-primary-foreground ring-2 ring-white">
                {heroBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </span>
              <input type="file" accept="image/*" className="hidden" data-testid="gym-hero-input" onChange={onPickHero} />
            </label>
            <details className="mt-1">
              <summary className={cn('cursor-pointer text-2xs text-gray-500', isRTL && 'font-arabic')}>{t('gym.heroUrlEscape')}</summary>
              <Input
                data-testid="gym-hero-url"
                dir="ltr"
                value={form.hero_image_url}
                onChange={(e) => { setHeroVersion(undefined); set('hero_image_url')(e); }}
                className="mt-1 rounded-lg border p-2"
                type="url"
                placeholder="https://…"
              />
            </details>
          </F>
        </div>

        <F label={t('gym.taglineEn')}>
          <Input data-testid="gym-tagline-en" value={form.tagline_en} onChange={set('tagline_en')} className="rounded-lg border p-2" />
        </F>
        <F label={t('gym.taglineAr')} rtlLabel={isRTL} hint={reuseHint}>
          <Input data-testid="gym-tagline-ar" dir="rtl" value={form.tagline_ar} onChange={set('tagline_ar')} className="rounded-lg border p-2" />
        </F>
        <F label={t('gym.taglineFr')} hint={reuseHint}>
          <Input data-testid="gym-tagline-fr" value={form.tagline_fr} onChange={set('tagline_fr')} className="rounded-lg border p-2" />
        </F>
      </Section>

      {/* ── Save (one data flow for every section) ── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-2 pt-4">
          {error && (
            <div data-testid="gym-save-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <Button data-testid="gym-save" onClick={() => void save()} disabled={saving} className="w-full rounded-lg" size="lg">
            {saving ? t('gym.saving') : t('gym.saveChanges')}
          </Button>
          {saved && (
            <p data-testid="gym-save-ok" className={cn('text-xs font-medium text-green-700 text-center', isRTL && 'font-arabic')}>
              {t('gym.saved')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
