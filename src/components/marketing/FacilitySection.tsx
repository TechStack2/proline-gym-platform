import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { MapPin, Phone, Mail, Instagram } from 'lucide-react';
import { DEFAULT_CONTACT, type LandingContact } from '@/lib/marketing/contact';

type FacilitySectionProps = {
  locale: string;
  // PROLINE-LANDING-DATA: the resolved gym's public contact (fallback = Proline defaults).
  contact?: LandingContact;
};

export function FacilitySection({ locale, contact = DEFAULT_CONTACT }: FacilitySectionProps) {
  const t = useTranslations('landing.facility');
  const isRTL = locale === 'ar';
  // Map: derive the OSM bbox (±0.005°) + marker from the gym's coordinates.
  const { mapLat, mapLng } = contact;
  const bbox = `${(mapLng - 0.005).toFixed(4)}%2C${(mapLat - 0.005).toFixed(4)}%2C${(mapLng + 0.005).toFixed(4)}%2C${(mapLat + 0.005).toFixed(4)}`;
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${mapLat.toFixed(4)}%2C${mapLng.toFixed(4)}`;

  return (
    <section id="facility" className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Facility image / map placeholder */}
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-secondary-800 to-secondary-900 overflow-hidden shadow-elevation-3">
              {/* AX-2: keyless OpenStreetMap embed — always renders (the keyless
                  Google embed showed a blank dark box). Centered on Sky Business
                  Center, Baabda. A Google Maps API key, if supplied later, is a
                  trivial swap. */}
              <iframe
                src={mapSrc}
                width="100%"
                height="100%"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="PRO LINE Gym — Sky Business Center, Baabda"
                data-testid="facility-map"
                className="absolute inset-0 border-0"
              />
            </div>
            {/* Address badge */}
            <div className="absolute -bottom-4 left-4 right-4 rounded-xl bg-white shadow-elevation-2 p-4"
              dir={isRTL ? 'rtl' : 'ltr'}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50">
                  <MapPin className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className={cn('text-sm font-semibold text-secondary-900', isRTL && 'font-arabic')}>
                    {t('addr')}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('country')}
                  </p>
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=Sky+Business+Center+Baabda"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="view-on-google-maps"
                    className="mt-1 inline-block text-xs font-medium text-primary-600 hover:underline"
                  >
                    {t('viewOnGoogle')}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div>
            <h2 className={cn('text-3xl sm:text-4xl font-bold text-secondary-900', isRTL && 'font-arabic')}>
              {t('title')}
            </h2>
            <p className="mt-3 text-gray-500 leading-relaxed">
              {t('subtitle')}
            </p>

            <div className="mt-8 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
              <a
                href={`tel:${contact.phone.replace(/\s/g, '')}`}
                data-testid="facility-phone"
                className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary-200 hover:bg-primary-50/50 transition-colors"
              >
                <Phone className="h-5 w-5 text-primary-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-secondary-900" dir="ltr">{contact.phone}</p>
                  <p className="text-xs text-gray-500">{t('callUs')}</p>
                </div>
              </a>

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

              <a
                href={`https://instagram.com/${contact.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="facility-ig"
                className="flex items-center gap-3 rounded-xl border p-4 hover:border-primary-200 hover:bg-primary-50/50 transition-colors"
              >
                <Instagram className="h-5 w-5 text-primary-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-secondary-900">@{contact.instagram}</p>
                  <p className="text-xs text-gray-500">
                    {t('igStats')}
                  </p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}