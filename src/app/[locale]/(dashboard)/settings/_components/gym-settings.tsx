import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useErrorText, useCaughtErrorText } from '@/lib/errors/use-error-text';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Mail, Globe, Camera, Loader2, Palette,
  ImageIcon, Share2, MapPin, Clock, CalendarClock, type LucideIcon,
} from 'lucide-react';
import { downscaleImage, decodeToBitmap } from '@/components/shared/avatar-upload';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { renderMaskableIcon } from '@/lib/pwa/maskable';
import { processedIconPath, PROCESSED_ICON_SIZES } from '@/lib/pwa/icon-paths';
import { safeBrandColor } from '@/lib/theme/brand';
import { saveGymSettings } from './gym-actions';
import { TimezonePicker } from './timezone-picker';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { parseMapLink } from '@/lib/marketing/map-link';
import { DAY_KEYS, defaultOfficeHours, normalizeOfficeHours, hasOfficeHours, type DayKey, type OfficeHours } from '@/lib/marketing/office-hours';

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
  // BILL-POLICY (000107)
  billing_cycle_policy?: string;
  billing_cycle_day?: number;
  logo_url?: string;
  city?: string;
  country?: string;
  tva_registration_number?: string;
  // 000072 branding
  brand_color?: string;
  hero_image_url?: string;
  tagline_ar?: string;
  tagline_en?: string;
  tagline_fr?: string;
  // LANDING-CUSTOM (000078/000101): public contact + socials + map + hours
  contact_phone?: string | null;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  instagram_handle?: string | null;
  instagram_followers?: number | null;
  facebook_handle?: string | null;
  tiktok_handle?: string | null;
  youtube_handle?: string | null;
  map_lat?: number | null;
  map_lng?: number | null;
  office_hours?: OfficeHours | null;
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
 * at `<gymId>/gym-logo.jpg` (staff path-scope, 000039) → gyms.logo_url, caller RLS).
 * W2c §5: the SAME upload also renders the REAL maskable icon set (512/192
 * manifest + 180 apple-touch) — square PNGs, brand-color matte, logo contain-fit
 * in the maskable safe zone — at the sibling paths the manifest builder probes
 * (icon-paths.ts is the shared derivation). Icon failures are non-fatal: the
 * logo upload must never break because an icon render did (the manifest then
 * simply keeps the legacy behavior for this gym). */
async function uploadGymLogo(gymId: string, file: File, brandColor?: string): Promise<string> {
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

  try {
    const bitmap = await decodeToBitmap(file);
    const matte = safeBrandColor(brandColor);
    for (const size of PROCESSED_ICON_SIZES) {
      const icon = await renderMaskableIcon(bitmap, size, matte);
      const { error: iconErr } = await supabase.storage
        .from('avatars')
        .upload(processedIconPath(path, size), icon, {
          upsert: true,
          contentType: 'image/png',
          cacheControl: '3600',
        });
      if (iconErr) throw iconErr;
    }
  } catch (iconErr) {
    console.warn('[pwa] maskable icon render failed — manifest keeps legacy icons', iconErr);
  }
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

// ERROR-COPY: keys owned by the gym.err namespace keep their tailored copy; any other
// key (the stable keys from actionError) falls back to friendly, shared errors.* copy.
const GYM_ERR_KEYS = new Set(['invalid_color', 'invalid_currency', 'invalid_number', 'invalid_billing_policy', 'not_allowed', 'nothing_to_save', 'no_gym', 'not_signed_in']);

// M2-D WIZARD-POLISH: each J5 section saves independently. saveGymSettings already
// accepts a PARTIAL payload (it skips undefined keys), so a section save sends only its
// own fields. Field lists mirror the JSX sections below.
type SectionKey = 'identity' | 'contact' | 'localization' | 'billing' | 'branding' | 'publicPage' | 'hours';
const SECTION_FIELDS: Record<SectionKey, string[]> = {
  identity: ['name_en', 'name_ar', 'name_fr', 'tva_registration_number'],
  contact: ['phone', 'email', 'website', 'address_en', 'address_ar', 'address_fr'],
  localization: ['timezone', 'currency_preference', 'city', 'country'],
  // BILL-POLICY: the gym-wide billing-cycle choice saves on its own.
  billing: ['billing_cycle_policy', 'billing_cycle_day'],
  branding: ['brand_color', 'hero_image_url', 'tagline_en', 'tagline_ar', 'tagline_fr'],
  // publicPage + hours build their payloads directly in saveSection (numbers + JSONB).
  publicPage: [],
  hours: [],
};

export function GymSettings({ gym, locale }: Props) {
  const t = useTranslations('settings');
  const errText = useErrorText();
  const errCaught = useCaughtErrorText();
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
    // BILL-POLICY: default to the pre-BILL-POLICY behavior, never a blank.
    billing_cycle_policy: gym?.billing_cycle_policy ?? 'anniversary',
    billing_cycle_day: String(gym?.billing_cycle_day ?? 1),
    city: gym?.city ?? '',
    country: gym?.country ?? '',
    tva_registration_number: gym?.tva_registration_number ?? '',
    brand_color: gym?.brand_color ?? '',
    hero_image_url: gym?.hero_image_url ?? '',
    tagline_ar: gym?.tagline_ar ?? '',
    tagline_en: gym?.tagline_en ?? '',
    tagline_fr: gym?.tagline_fr ?? '',
    // LANDING-CUSTOM: public contact + socials + map (numbers kept as strings in the form)
    contact_phone: gym?.contact_phone ?? '',
    contact_whatsapp: gym?.contact_whatsapp ?? '',
    contact_email: gym?.contact_email ?? '',
    instagram_handle: gym?.instagram_handle ?? '',
    instagram_followers: gym?.instagram_followers != null ? String(gym.instagram_followers) : '',
    facebook_handle: gym?.facebook_handle ?? '',
    tiktok_handle: gym?.tiktok_handle ?? '',
    youtube_handle: gym?.youtube_handle ?? '',
    map_lat: gym?.map_lat != null ? String(gym.map_lat) : '',
    map_lng: gym?.map_lng != null ? String(gym.map_lng) : '',
  }));
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // LANDING-CUSTOM: office-hours editor state (structured; separate from the string form).
  const [hoursEnabled, setHoursEnabled] = useState(() => hasOfficeHours(gym?.office_hours));
  const [officeHours, setOfficeHours] = useState<OfficeHours>(() => normalizeOfficeHours(gym?.office_hours));
  const setDay = (day: DayKey, patch: Partial<OfficeHours[DayKey]>) =>
    setOfficeHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  // Map: paste a Google-Maps link → parse → fill lat/lng; a manual lat/lng fallback stays.
  const [mapLink, setMapLink] = useState('');
  const [mapParseError, setMapParseError] = useState(false);
  const applyMapLink = () => {
    const parsed = parseMapLink(mapLink);
    if (!parsed) { setMapParseError(true); return; }
    setMapParseError(false);
    setForm((prev) => ({ ...prev, map_lat: String(parsed.lat), map_lng: String(parsed.lng) }));
  };

  // M2-D: per-section save state (was one shared save/saved/error).
  const [savingSec, setSavingSec] = useState<SectionKey | null>(null);
  const [savedSec, setSavedSec] = useState<SectionKey | null>(null);
  const [sectionError, setSectionError] = useState<{ section: SectionKey; msg: string } | null>(null);
  // Which single field a validation failure maps to (per-field inline error).
  const [fieldError, setFieldError] = useState<'brand_color' | 'currency_preference' | 'billing_cycle_policy' | null>(null);
  // The instant logo/hero uploads keep their own banner (they're not part of a section save).
  const [uploadError, setUploadError] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState(gym?.logo_url ?? '');
  const [heroBusy, setHeroBusy] = useState(false);
  const [heroVersion, setHeroVersion] = useState<number | undefined>(undefined);

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

  // M2-D: save ONE section — send only its fields (partial payload; the action skips
  // undefined keys). The en→ar/fr write-time fallback applies to this section's
  // trilingual fields only. Per-section busy/ok/error; per-field errors preserved.
  const saveSection = async (section: SectionKey) => {
    setSavingSec(section); setSavedSec(null); setSectionError(null); setFieldError(null);
    const fb = (val: string, en: string) => val.trim() || en.trim();
    const payload: Record<string, unknown> = {};
    if (section === 'publicPage') {
      // Public contact + socials (strings) + map coordinates (parsed by the action).
      for (const k of ['contact_phone', 'contact_whatsapp', 'contact_email', 'instagram_handle', 'facebook_handle', 'tiktok_handle', 'youtube_handle', 'instagram_followers', 'map_lat', 'map_lng'] as const) {
        payload[k] = form[k];
      }
    } else if (section === 'hours') {
      // Enabled → the structured object; disabled → NULL (footer keeps its i18n fallback).
      payload.office_hours = hoursEnabled ? officeHours : null;
    } else {
      for (const k of SECTION_FIELDS[section]) payload[k] = (form as Record<string, string>)[k];
      if (section === 'identity') { payload.name_ar = fb(form.name_ar, form.name_en); payload.name_fr = fb(form.name_fr, form.name_en); }
      if (section === 'contact') { payload.address_ar = fb(form.address_ar, form.address_en); payload.address_fr = fb(form.address_fr, form.address_en); }
      if (section === 'branding') { payload.tagline_ar = fb(form.tagline_ar, form.tagline_en); payload.tagline_fr = fb(form.tagline_fr, form.tagline_en); }
    }
    const res = await saveGymSettings(payload as Parameters<typeof saveGymSettings>[0]);
    setSavingSec(null);
    if (res.ok) {
      setSavedSec(section);
      setTimeout(() => setSavedSec(null), 2500);
      router.refresh();
    } else {
      setSectionError({ section, msg: GYM_ERR_KEYS.has(res.error) ? t(`gym.err.${res.error}` as Parameters<typeof t>[0]) : errText(res.error) });
      if (res.error === 'invalid_color') setFieldError('brand_color');
      else if (res.error === 'invalid_currency') setFieldError('currency_preference');
      else if (res.error === 'invalid_billing_policy') setFieldError('billing_cycle_policy');
    }
  };

  // A section's Save + ok/error footer (a render helper, NOT a component → no remount).
  // Section-suffixed testids so a spec can target one section.
  const saveBar = (section: SectionKey) => (
    <div className="space-y-1.5 border-t pt-3">
      {sectionError?.section === section && (
        <div data-testid={`gym-save-error-${section}`} className="tint-danger rounded-lg px-3 py-2 text-sm">{sectionError.msg}</div>
      )}
      <div className="flex items-center gap-2">
        <Button data-testid={`gym-save-${section}`} onClick={() => void saveSection(section)} disabled={savingSec === section} size="sm" className="rounded-lg">
          {savingSec === section ? t('gym.saving') : t('gym.saveChanges')}
        </Button>
        {savedSec === section && (
          <span data-testid={`gym-save-ok-${section}`} className={cn('text-xs font-medium text-green-700', isRTL && 'font-arabic')}>{t('gym.saved')}</span>
        )}
      </div>
    </div>
  );

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gym.id) return;
    setLogoBusy(true); setUploadError('');
    try {
      const url = await uploadGymLogo(gym.id, file, form.brand_color);
      setLogoUrl(url);
      router.refresh();
    } catch (err: any) {
      setUploadError(errCaught(err));
    } finally {
      setLogoBusy(false);
      e.target.value = '';
    }
  };

  const onPickHero = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gym.id) return;
    setHeroBusy(true); setUploadError('');
    try {
      const path = await uploadGymHero(gym.id, file);
      setForm((prev) => ({ ...prev, hero_image_url: path })); // relative path, mirrors the DB
      setHeroVersion(Date.now()); // bust the preview cache
      router.refresh();
    } catch (err: any) {
      // gym-landing write RLS is is_gym_admin() — a non-admin surfaces here, not silently.
      setUploadError(errCaught(err));
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
          <span className="absolute -bottom-1 -end-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-700 text-primary-foreground ring-2 ring-white">
            {logoBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          </span>
          <input type="file" accept="image/*" className="hidden" data-testid="gym-logo-input" onChange={onPickLogo} />
        </label>
        <h2 className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="gym-header-name">
          {gymName || t('gym.unnamed')}
        </h2>
      </div>
      {uploadError && (
        <div data-testid="gym-upload-error" className="tint-danger rounded-lg px-3 py-2 text-sm">{uploadError}</div>
      )}

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
        {/* BILL-LOCALIZE: the gym's TVA registration number — its billing/tax identity.
            Empty = the gym isn't TVA-registered → invoices show NO tax line (honest). */}
        <F label={t('gym.tvaNumber')} hint={t('gym.tvaNumberHint')}>
          <Input data-testid="gym-tva-number" dir="ltr" value={form.tva_registration_number} onChange={set('tva_registration_number')} className="rounded-lg border p-2" placeholder={t('gym.tvaNumberPlaceholder')} />
        </F>
        {saveBar('identity')}
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
        {saveBar('contact')}
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
                    active ? 'border-primary-700 bg-primary-700 text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
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
        {/* BILL-LOCALIZE: where the gym operates — surfaced on receipts + billing identity. */}
        <div className="grid grid-cols-2 gap-3">
          <F label={t('gym.city')}>
            <Input data-testid="gym-city" value={form.city} onChange={set('city')} className="rounded-lg border p-2" placeholder={t('gym.cityPlaceholder')} />
          </F>
          <F label={t('gym.country')}>
            <Input data-testid="gym-country" value={form.country} onChange={set('country')} className="rounded-lg border p-2" placeholder={t('gym.countryPlaceholder')} />
          </F>
        </div>
        {saveBar('localization')}
      </Section>

      {/* ── BILL-POLICY: when the monthly bill lands (gym-wide) ── */}
      <Section icon={CalendarClock} title={t('gym.sectionBilling')} rtl={isRTL} id="billing">
        <p className={cn('text-xs text-gray-500', isRTL && 'font-arabic')}>{t('gym.billingIntro')}</p>

        <div className="grid gap-2 sm:grid-cols-2" data-testid="gym-billing-policy" data-value={form.billing_cycle_policy}>
          {([
            { key: 'calendar', title: t('gym.calendarTitle'), body: t('gym.calendarBody'), example: t('gym.calendarExample') },
            { key: 'anniversary', title: t('gym.anniversaryTitle'), body: t('gym.anniversaryBody'), example: t('gym.anniversaryExample') },
          ] as const).map((opt) => {
            const active = form.billing_cycle_policy === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                data-testid="gym-billing-policy-option"
                data-value={opt.key}
                data-active={active}
                aria-pressed={active}
                onClick={() => setForm((prev) => ({ ...prev, billing_cycle_policy: opt.key }))}
                className={cn(
                  'min-w-0 rounded-xl border p-3 text-start transition-colors',
                  active ? 'border-primary-700 bg-primary-50' : 'border-gray-200 bg-white hover:border-gray-300',
                )}
              >
                <span className={cn('block text-sm font-semibold text-gray-900', isRTL && 'font-arabic')}>{opt.title}</span>
                <span className={cn('mt-1 block text-xs text-gray-600', isRTL && 'font-arabic')}>{opt.body}</span>
                {/* A concrete worked example — the owner should not have to imagine it. */}
                <span className={cn('mt-2 block text-xs text-gray-500', isRTL && 'font-arabic')}>{opt.example}</span>
              </button>
            );
          })}
        </div>

        {/* The grid day only means anything under `calendar`. */}
        {form.billing_cycle_policy === 'calendar' && (
          <F label={t('gym.cycleDayLabel')} rtlLabel={isRTL}>
            <Input
              type="number" min={1} max={28} dir="ltr" data-testid="gym-billing-cycle-day"
              value={form.billing_cycle_day}
              onChange={set('billing_cycle_day')}
              className="w-24 rounded-lg border p-2"
            />
            <p className={cn('mt-1 text-2xs text-gray-400', isRTL && 'font-arabic')}>{t('gym.cycleDayHint')}</p>
          </F>
        )}

        {/* R4: the consequence of switching, stated honestly. Enforced by construction —
            anchors are stored per-registration at activation and nothing recomputes them. */}
        <p data-testid="gym-billing-switch-note" className={cn('tint-warning rounded-lg p-2.5 text-xs', isRTL && 'font-arabic')}>
          {t('gym.switchNote')}
        </p>

        {fieldError === 'billing_cycle_policy' && (
          <p data-testid="gym-err-billing-policy" className="text-xs text-red-600">{t('gym.err.invalid_billing_policy')}</p>
        )}
        {saveBar('billing')}
      </Section>

      {/* ── Branding (000072) ── */}
      <Section icon={Palette} title={t('gym.branding')} rtl={isRTL}>
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
              <span className="absolute bottom-1 end-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-700 text-primary-foreground ring-2 ring-white">
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
        {saveBar('branding')}
      </Section>

      {/* ── Public page: contact + socials + map (000078/000101) ── */}
      <Section icon={Share2} title={t('gym.sectionPublic')} rtl={isRTL} id="public">
        <p className={cn('-mt-1 text-2xs text-gray-400', isRTL && 'font-arabic')}>{t('gym.publicHint')}</p>
        {/* Public contact — distinct from the internal ops phone/email above. */}
        <div className="grid grid-cols-2 gap-3">
          <F label={t('gym.contactPhone')}>
            <Input data-testid="gym-contact-phone" dir="ltr" value={form.contact_phone} onChange={set('contact_phone')} className="rounded-lg border p-2" type="tel" placeholder="+961 …" />
          </F>
          <F label={t('gym.contactWhatsapp')}>
            <Input data-testid="gym-contact-whatsapp" dir="ltr" value={form.contact_whatsapp} onChange={set('contact_whatsapp')} className="rounded-lg border p-2" type="tel" placeholder="+961 …" />
          </F>
        </div>
        <F label={t('gym.contactEmail')}>
          <Input data-testid="gym-contact-email" dir="ltr" value={form.contact_email} onChange={set('contact_email')} className="rounded-lg border p-2" type="email" placeholder="hello@…" />
        </F>
        {/* Socials — handles only (no leading @); followers is the hero social-proof count. */}
        <div className="grid grid-cols-2 gap-3">
          <F label={t('gym.instagram')} hint={t('gym.handleHint')}>
            <Input data-testid="gym-instagram" dir="ltr" value={form.instagram_handle} onChange={set('instagram_handle')} className="rounded-lg border p-2" placeholder="prolinegym.lb" />
          </F>
          <F label={t('gym.instagramFollowers')}>
            <Input data-testid="gym-instagram-followers" dir="ltr" inputMode="numeric" value={form.instagram_followers} onChange={set('instagram_followers')} className="rounded-lg border p-2" placeholder="0" />
          </F>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <F label={t('gym.facebook')} hint={t('gym.handleHint')}>
            <Input data-testid="gym-facebook" dir="ltr" value={form.facebook_handle} onChange={set('facebook_handle')} className="rounded-lg border p-2" />
          </F>
          <F label={t('gym.tiktok')} hint={t('gym.handleHint')}>
            <Input data-testid="gym-tiktok" dir="ltr" value={form.tiktok_handle} onChange={set('tiktok_handle')} className="rounded-lg border p-2" />
          </F>
        </div>
        <F label={t('gym.youtube')} hint={t('gym.handleHint')}>
          <Input data-testid="gym-youtube" dir="ltr" value={form.youtube_handle} onChange={set('youtube_handle')} className="rounded-lg border p-2" />
        </F>

        {/* Map picker — paste a Google-Maps link → parse @lat,lng; manual lat/lng fallback. */}
        <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
          <label className={cn('flex items-center gap-1.5 text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
            <MapPin className="h-3.5 w-3.5 text-primary-600" /> {t('gym.mapLocation')}
          </label>
          <p className={cn('text-2xs text-gray-400', isRTL && 'font-arabic')}>{t('gym.mapHint')}</p>
          <div className="flex gap-2">
            <Input
              data-testid="gym-map-link"
              dir="ltr"
              value={mapLink}
              onChange={(e) => { setMapLink(e.target.value); setMapParseError(false); }}
              className="rounded-lg border p-2"
              placeholder="https://maps.google.com/…"
            />
            <Button type="button" size="sm" variant="outline" data-testid="gym-map-apply" onClick={applyMapLink} className="rounded-lg whitespace-nowrap">
              {t('gym.mapUseLink')}
            </Button>
          </div>
          {mapParseError && (
            <p data-testid="gym-map-parse-error" className="text-xs text-red-600">{t('gym.mapParseError')}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <F label={t('gym.mapLat')}>
              <Input data-testid="gym-map-lat" dir="ltr" inputMode="decimal" value={form.map_lat} onChange={set('map_lat')} className="rounded-lg border p-2" placeholder="33.833104" />
            </F>
            <F label={t('gym.mapLng')}>
              <Input data-testid="gym-map-lng" dir="ltr" inputMode="decimal" value={form.map_lng} onChange={set('map_lng')} className="rounded-lg border p-2" placeholder="35.541895" />
            </F>
          </div>
          {(() => {
            const lat = Number(form.map_lat), lng = Number(form.map_lng);
            if (!form.map_lat || !form.map_lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const d = 0.01;
            const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
            return (
              <iframe
                data-testid="gym-map-preview"
                title={t('gym.mapLocation')}
                className="h-40 w-full rounded-lg border"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`}
              />
            );
          })()}
        </div>
        {saveBar('publicPage')}
      </Section>

      {/* ── Opening hours (000101) ── */}
      <Section icon={Clock} title={t('gym.sectionHours')} rtl={isRTL} id="hours">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            data-testid="gym-hours-enabled"
            checked={hoursEnabled}
            onChange={(e) => { setHoursEnabled(e.target.checked); if (e.target.checked && !hasOfficeHours(gym?.office_hours)) setOfficeHours(defaultOfficeHours()); }}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className={cn(isRTL && 'font-arabic')}>{t('gym.hoursEnable')}</span>
        </label>
        <p className={cn('text-2xs text-gray-400', isRTL && 'font-arabic')}>{t('gym.hoursHint')}</p>
        {hoursEnabled && (
          <div className="space-y-2" data-testid="gym-hours-editor">
            {DAY_KEYS.map((day) => (
              <div key={day} className="flex items-center gap-2" data-testid={`gym-hours-row-${day}`}>
                <span className={cn('w-24 shrink-0 text-sm text-gray-700', isRTL && 'font-arabic')}>{t(`gym.days.${day}` as Parameters<typeof t>[0])}</span>
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    data-testid={`gym-hours-closed-${day}`}
                    checked={officeHours[day].closed}
                    onChange={(e) => setDay(day, { closed: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  {t('gym.hoursClosed')}
                </label>
                {!officeHours[day].closed && (
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <Input data-testid={`gym-hours-open-${day}`} type="time" value={officeHours[day].open} onChange={(e) => setDay(day, { open: e.target.value })} className="w-28 rounded-lg border p-1.5" />
                    <span className="text-gray-400">–</span>
                    <Input data-testid={`gym-hours-close-${day}`} type="time" value={officeHours[day].close} onChange={(e) => setDay(day, { close: e.target.value })} className="w-28 rounded-lg border p-1.5" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {saveBar('hours')}
      </Section>
    </div>
  );
}
