import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { MapPin, Phone, Mail, Instagram } from 'lucide-react';
import { fmtPhone } from '@/lib/fmt';
import { EMPTY_CONTACT, type LandingContact } from '@/lib/marketing/contact';

type FacilitySectionProps = {
  locale: string;
  // TENANT-CONTENT: the resolved LANDING gym's public contact + address. Only the default
  // gym falls back to the built-in Proline location/address; other tenants show their own
  // (map/address/links self-hide when the gym hasn't set them).
  contact?: LandingContact;
  isDefault?: boolean;
  address?: string;
  gymName?: string;
};

export function FacilitySection({ locale, contact = EMPTY_CONTACT, isDefault = false, address, gymName }: FacilitySectionProps) {
  const t = useTranslations('landing.facility');
  const isRTL = locale === 'ar';
  // Map: only render when the gym actually has coordinates (default gym carries Proline's;
  // EMPTY_CONTACT is 0,0 → no map, never a marker in the ocean off West Africa).
  const { mapLat, mapLng } = contact;
  const hasLocation = mapLat !== 0 && mapLng !== 0;
  const bbox = `${(mapLng - 0.005).toFixed(4)}%2C${(mapLat - 0.005).toFixed(4)}%2C${(mapLng + 0.005).toFixed(4)}%2C${(mapLat + 0.005).toFixed(4)}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${mapLat.toFixed(4)}%2C${mapLng.toFixed(4)}`;
  // Address: the default gym keeps its curated i18n line; every other tenant shows its own
  // gyms.address row (or nothing). The Google-Maps query follows the same source.
  const addressLine = isDefault ? t('addr') : (address || '');
  const mapsQuery = isDefault ? 'Sky+Business+Center+Baabda' : encodeURIComponent(address || '');
  const mapTitle = `${gymName || (isDefault ? 'PRO LINE Gym' : '')}${addressLine ? ` — ${addressLine}` : ''}`.trim();

  return (
    <section id="facility" className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Facility image / map placeholder */}
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-secondary-800 to-secondary-900 overflow-hidden shadow-elevation-3">
              {/* AX-2: keyless OpenStreetMap embed. Rendered only when the gym has
                  coordinates — a tenant without a set location shows the neutral
                  gradient, never a marker at 0,0 / Proline's map. */}
              {hasLocation && (
                <iframe
                  src={mapSrc}
                  width="100%"
                  height="100%"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={mapTitle}
                  data-testid="facility-map"
                  className="absolute inset-0 border-0"
                />
              )}
            </div>
            {/* Address badge — the gym's OWN address (default gym: curated i18n line). */}
            {addressLine && (
              <div className="absolute -bottom-4 left-4 right-4 rounded-xl bg-white shadow-elevation-2 p-4"
                dir={isRTL ? 'rtl' : 'ltr'}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50">
                    <MapPin className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <p className={cn('text-sm font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                      {addressLine}
                    </p>
                    {isDefault && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t('country')}
                      </p>
                    )}
                    {mapsQuery && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="view-on-google-maps"
                        className="mt-1 inline-block text-xs font-medium text-primary-600 hover:underline"
                      >
                        {t('viewOnGoogle')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Contact info */}
          <div>
            <h2 className={cn('font-display text-3xl sm:text-4xl font-bold text-secondary-900')}>
              {t('title')}
            </h2>
            <p className="mt-3 text-gray-500 leading-relaxed">
              {isDefault ? t('subtitle') : t('subtitleAlt')}
            </p>

            <div className="mt-8 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/\s/g, '')}`}
                  data-testid="facility-phone"
                  className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary-200 hover:bg-primary-50/50 transition-colors"
                >
                  <Phone className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    {/* §2.7: fmtPhone display grouping (tel: href keeps the raw value). */}
                    <p className="text-sm font-medium text-secondary-900" dir="ltr">{fmtPhone(contact.phone)}</p>
                    <p className="text-xs text-gray-500">{t('callUs')}</p>
                  </div>
                </a>
              )}

              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  data-testid="facility-email"
                  className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary-200 hover:bg-primary-50/50 transition-colors"
                >
                  <Mail className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-secondary-900">{contact.email}</p>
                    <p className="text-xs text-gray-500">{t('email')}</p>
                  </div>
                </a>
              )}

              {contact.instagram && (
                <a
                  href={`https://instagram.com/${contact.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="facility-ig"
                  className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary-200 hover:bg-primary-50/50 transition-colors"
                >
                  <Instagram className="h-5 w-5 text-primary-600 flex-shrink-0" />
                  <div>
                    {/* DA-47: LTR isolation — the @ flipped to the end in Arabic. */}
                    <p className="text-sm font-medium text-secondary-900" dir="ltr">@{contact.instagram}</p>
                    <p className="text-xs text-gray-500">
                      {t('igStats')}
                    </p>
                  </div>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}