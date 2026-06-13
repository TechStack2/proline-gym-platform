import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Phone, Mail, Globe, Clock, CreditCard, MapPin } from 'lucide-react';

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
} | null;

type Props = {
  gym: GymData;
  locale: string;
};

export function GymSettings({ gym, locale }: Props) {
  const t = useTranslations('settings');
  const isRTL = locale === 'ar';

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

  return (
    <div className="space-y-4">
      {/* Gym Identity Card */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            {gym.logo_url ? (
              <img
                src={gym.logo_url}
                alt={gymName || 'Gym logo'}
                className="h-14 w-14 rounded-xl object-cover border"
              />
            ) : (
              <div className="h-14 w-14 rounded-xl bg-primary-50 flex items-center justify-center">
                <Building2 className="h-7 w-7 text-primary-500" />
              </div>
            )}
            <div>
              <CardTitle className={cn('text-lg font-bold text-gray-900', isRTL && 'font-arabic')}>
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

      {/* Editable Form Card */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className={cn('text-base font-semibold text-gray-900', isRTL && 'font-arabic')}>
            {t('gym.editInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Name fields */}
          <div className="space-y-2">
            <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
              {t('gym.nameAr')}
            </label>
            <Input
              defaultValue={gym.name_ar || ''}
              className="rounded-lg border p-2"
              placeholder={t('gym.enterArabicName')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">{t('gym.nameEn')}</label>
            <Input
              defaultValue={gym.name_en || ''}
              className="rounded-lg border p-2"
              placeholder={t('gym.enterEnglishName')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">{t('gym.nameFr')}</label>
            <Input
              defaultValue={gym.name_fr || ''}
              className="rounded-lg border p-2"
              placeholder={t('gym.enterFrenchName')}
            />
          </div>

          {/* Address fields */}
          <div className="space-y-2">
            <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
              {t('gym.addressAr')}
            </label>
            <Input
              defaultValue={gym.address_ar || ''}
              className="rounded-lg border p-2"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">{t('gym.addressEn')}</label>
            <Input
              defaultValue={gym.address_en || ''}
              className="rounded-lg border p-2"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">{t('gym.addressFr')}</label>
            <Input
              defaultValue={gym.address_fr || ''}
              className="rounded-lg border p-2"
            />
          </div>

          {/* Contact fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">
                {t('gym.phone')}
              </label>
              <Input
                defaultValue={gym.phone || ''}
                className="rounded-lg border p-2"
                type="tel"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Email</label>
              <Input
                defaultValue={gym.email || ''}
                className="rounded-lg border p-2"
                type="email"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">{t('gym.website')}</label>
              <Input
                defaultValue={gym.website || ''}
                className="rounded-lg border p-2"
                type="url"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">{t('gym.timezone')}</label>
              <Input
                defaultValue={gym.timezone || ''}
                className="rounded-lg border p-2"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className={cn('text-xs font-medium text-gray-600', isRTL && 'font-arabic')}>
              {t('gym.currencyPreference')}
            </label>
            <Input
              defaultValue={gym.currency_preference || ''}
              className="rounded-lg border p-2"
              placeholder="USD / LBP / BOTH"
            />
          </div>

          <Button className="w-full mt-2 rounded-lg" size="lg">
            {t('gym.saveChanges')}
          </Button>
          <p className="text-2xs text-gray-400 text-center">
            {t('gym.saveNotActive')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
