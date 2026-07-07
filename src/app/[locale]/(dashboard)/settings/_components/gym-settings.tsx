import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Phone, Mail, Globe, Clock, CreditCard, MapPin, Camera, Loader2, Palette } from 'lucide-react';
import { downscaleImage } from '@/components/shared/avatar-upload';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { saveGymSettings } from './gym-actions';

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
// in-render component would remount its <Input> on every keystroke).
const F = ({ label, children, rtlLabel }: { label: string; children: React.ReactNode; rtlLabel?: boolean }) => (
  <div className="space-y-2">
    <label className={cn('text-xs font-medium text-gray-600', rtlLabel && 'font-arabic')}>{label}</label>
    {children}
  </div>
);

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
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState(gym?.logo_url ?? '');

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

  const save = async () => {
    setSaving(true); setSaved(false); setError('');
    const res = await saveGymSettings(form);
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    } else {
      setError(t(`gym.err.${res.error}` as Parameters<typeof t>[0]) || res.error);
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

  return (
    <div className="space-y-4">
      {/* Gym Identity Card */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            {/* SETTINGS-LIVE: the logo is now editable in place (avatar-upload pattern). */}
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
            <div>
              <CardTitle className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')} data-testid="gym-header-name">
                {gymName || t('gym.unnamed')}
              </CardTitle>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('gym.information')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Address */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className={cn('text-xs font-medium text-gray-500', isRTL && 'font-arabic')}>
                {t('gym.address')}
              </p>
              <p className={cn('text-sm text-gray-900', isRTL && 'font-arabic')}>
                {address || '—'}
              </p>
              {gym.city && (
                <p className="text-xs text-gray-500">
                  {gym.city}{gym.country ? `, ${gym.country}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Contact Info Row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
              <Phone className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-2xs text-gray-500">{t('gym.phone')}</p>
                <p className={cn('text-sm font-medium text-gray-900 truncate', isRTL && 'font-arabic')}>
                  {gym.phone || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
              <Mail className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-2xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {gym.email || '—'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
              <Globe className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-2xs text-gray-500">{t('gym.website')}</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {gym.website || '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
              <Clock className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-2xs text-gray-500">{t('gym.timezone')}</p>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {gym.timezone || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Currency Preference */}
          <div className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
            <CreditCard className="h-4 w-4 text-gray-400 shrink-0" />
            <div>
              <p className="text-2xs text-gray-500">
                {t('gym.currencyPreference')}
              </p>
              <Badge variant="default" size="sm" className="mt-0.5">
                {gym.currency_preference || 'BOTH'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable Form Card — SETTINGS-LIVE: controlled + persisted (was an inert stub) */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className={cn('text-base font-semibold text-gray-900', isRTL && 'font-arabic')}>
            {t('gym.editInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <F label={t('gym.nameAr')} rtlLabel={isRTL}>
            <Input data-testid="gym-name-ar" dir="rtl" value={form.name_ar} onChange={set('name_ar')} className="rounded-lg border p-2" placeholder={t('gym.enterArabicName')} />
          </F>
          <F label={t('gym.nameEn')}>
            <Input data-testid="gym-name-en" value={form.name_en} onChange={set('name_en')} className="rounded-lg border p-2" placeholder={t('gym.enterEnglishName')} />
          </F>
          <F label={t('gym.nameFr')}>
            <Input data-testid="gym-name-fr" value={form.name_fr} onChange={set('name_fr')} className="rounded-lg border p-2" placeholder={t('gym.enterFrenchName')} />
          </F>

          <F label={t('gym.addressAr')} rtlLabel={isRTL}>
            <Input data-testid="gym-address-ar" dir="rtl" value={form.address_ar} onChange={set('address_ar')} className="rounded-lg border p-2" />
          </F>
          <F label={t('gym.addressEn')}>
            <Input data-testid="gym-address-en" value={form.address_en} onChange={set('address_en')} className="rounded-lg border p-2" />
          </F>
          <F label={t('gym.addressFr')}>
            <Input data-testid="gym-address-fr" value={form.address_fr} onChange={set('address_fr')} className="rounded-lg border p-2" />
          </F>

          <div className="grid grid-cols-2 gap-3">
            <F label={t('gym.phone')}>
              <Input data-testid="gym-phone" dir="ltr" value={form.phone} onChange={set('phone')} className="rounded-lg border p-2" type="tel" />
            </F>
            <F label="Email">
              <Input data-testid="gym-email" dir="ltr" value={form.email} onChange={set('email')} className="rounded-lg border p-2" type="email" />
            </F>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label={t('gym.website')}>
              <Input data-testid="gym-website" dir="ltr" value={form.website} onChange={set('website')} className="rounded-lg border p-2" type="url" />
            </F>
            <F label={t('gym.timezone')}>
              <Input data-testid="gym-timezone" dir="ltr" value={form.timezone} onChange={set('timezone')} className="rounded-lg border p-2" placeholder="Asia/Beirut" />
            </F>
          </div>

          <F label={t('gym.currencyPreference')} rtlLabel={isRTL}>
            <Input data-testid="gym-currency" value={form.currency_preference} onChange={set('currency_preference')} className="rounded-lg border p-2" placeholder="USD / LBP / BOTH" />
          </F>

          {/* ── Branding (000072) ── J4: #branding is the checklist branding item's
              deep-link target (distinct from the profile fields above). scroll-mt keeps
              the heading clear of the sticky chrome when the anchor scrolls to it. */}
          <p id="branding" className={cn('flex items-center gap-1.5 pt-1 text-xs font-semibold text-gray-700 scroll-mt-24', isRTL && 'font-arabic')}>
            <Palette className="h-3.5 w-3.5 text-primary-600" /> {t('gym.branding')}
          </p>
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
            </F>
            <F label={t('gym.heroImageUrl')} rtlLabel={isRTL}>
              <Input data-testid="gym-hero-url" dir="ltr" value={form.hero_image_url} onChange={set('hero_image_url')} className="rounded-lg border p-2" type="url" placeholder="https://…" />
            </F>
          </div>
          <F label={t('gym.taglineAr')} rtlLabel={isRTL}>
            <Input data-testid="gym-tagline-ar" dir="rtl" value={form.tagline_ar} onChange={set('tagline_ar')} className="rounded-lg border p-2" />
          </F>
          <F label={t('gym.taglineEn')}>
            <Input data-testid="gym-tagline-en" value={form.tagline_en} onChange={set('tagline_en')} className="rounded-lg border p-2" />
          </F>
          <F label={t('gym.taglineFr')}>
            <Input data-testid="gym-tagline-fr" value={form.tagline_fr} onChange={set('tagline_fr')} className="rounded-lg border p-2" />
          </F>

          {error && (
            <div data-testid="gym-save-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <Button data-testid="gym-save" onClick={() => void save()} disabled={saving} className="w-full mt-2 rounded-lg" size="lg">
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
