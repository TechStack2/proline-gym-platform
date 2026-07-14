import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getLandingGym, DEFAULT_GYM_SLUG, safeBrandColor, resolveLandingContact } from '@/lib/marketing/gym';
import { classifyHost, resolveTenantSlug, vendorRedirectUrl, type HostClass } from '@/lib/host/resolver';
import { PLATFORM_BRAND } from '@/lib/brand';
import { getLandingMeta } from '@/lib/marketing/seo';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { VendorLanding } from '@/components/marketing/VendorLanding';
import { LandingNav } from '@/components/layout/LandingNav';
import { LandingFooter } from '@/components/layout/LandingFooter';
import { HeroSection } from '@/components/marketing/HeroSection';
import { AffiliationsSection } from '@/components/marketing/AffiliationsSection';
import { DisciplinesSection } from '@/components/marketing/DisciplinesSection';
import { ScheduleSection } from '@/components/marketing/ScheduleSection';
import { ChampionsSection } from '@/components/marketing/ChampionsSection';
import { CoachesSection } from '@/components/marketing/CoachesSection';
import { GallerySection } from '@/components/marketing/GallerySection';
import { WhySection } from '@/components/marketing/WhySection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { PtSection } from '@/components/marketing/PtSection';
import { CampsSection } from '@/components/marketing/CampsSection';
import { FacilitySection } from '@/components/marketing/FacilitySection';
import { TrialCTASection } from '@/components/marketing/TrialCTASection';
import { JoinCTASection } from '@/components/marketing/JoinCTASection';

export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string };
  // X1: an explicit gym selector so CI's public-lead submit + catalog target the
  // run gym; prod (no ?gym) falls back to the demo gym (DEFAULT_GYM_SLUG).
  // VENDOR-LANDING: ?vendor=1 previews the vendor product page.
  searchParams?: { gym?: string; vendor?: string };
};

// PRAXELLA-DOOR R1: classify the request Host through the ONE central resolver —
// (i) vendor host (praxella.com/www/VENDOR_LANDING_HOSTS or ?vendor=1) → the vendor
// landing; (iii) <slug>.praxella.com → that gym; (iv) else → custom-domain lookup /
// DEFAULT. Shared by generateMetadata (the <head>) and the body so both agree.
function classifyRequest(searchParams?: { vendor?: string }): { rawHost: string | null; cls: HostClass } {
  const hdrs = headers();
  const rawHost = hdrs.get('x-forwarded-host') || hdrs.get('host');
  return { rawHost, cls: classifyHost(rawHost, { forceVendor: searchParams?.vendor === '1' }) };
}

// WL-BRANDING-DATA: build the `:root{--brand…}` CSS from the resolved gym's brand
// color. Emitted in a NONCE'D <style> (prod style-src is nonce + strict-dynamic
// with NO 'unsafe-inline', so an inline style="" attr would be STRIPPED — a var'd
// class + a nonce'd :root block is the CSP-safe path). --brand-dark (hover) is an
// 82% shade (floor → the default #cd1419 → exactly #a81014, today's hover); --brand-
// soft is the 10% tint (the old bg-primary-700/10). Literal values → no color-mix dep.
function buildBrandCss(brand: string): string {
  const n = parseInt(brand.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const shade = (f: number) => '#' + [r, g, b].map((x) => Math.floor(x * f).toString(16).padStart(2, '0')).join('');
  return `:root{--brand:${brand};--brand-dark:${shade(0.82)};--brand-soft:rgba(${r},${g},${b},0.1)}`;
}

/**
 * SEO-PER-GYM: per-gym <head> (title/description/OG + JSON-LD name/address/phone/IG).
 * Lives on the PAGE, not the layout, because only a page can read searchParams —
 * so the share/search identity follows the resolved gym. The default gym keeps
 * today's curated `seo` copy byte-identically (see getLandingMeta).
 */
export async function generateMetadata({ params: { locale }, searchParams }: Props): Promise<Metadata> {
  const { rawHost, cls } = classifyRequest(searchParams);
  // PRAXELLA-DOOR R5: the vendor page gets its OWN <head> (Praxella), not a
  // tenant's. Absolute title → the app-wide "%s | PRO LINE Gym" template can't
  // leak the tenant brand onto the platform's marketing page.
  if (cls.kind === 'vendor') {
    const t = await getTranslations({ locale, namespace: 'vendor' });
    return {
      title: { absolute: t('meta.title') },
      description: t('meta.description'),
      applicationName: PLATFORM_BRAND.name,
      robots: { index: true, follow: true },
    };
  }
  // Subdomain gyms keep gym metadata; an unknown subdomain (body redirects) → default.
  const gymSlug = await resolveTenantSlug(rawHost, searchParams?.gym, cls);
  const { metadata } = await getLandingMeta(locale, gymSlug);
  return metadata;
}

/**
 * Public landing (Cycle 5 / V1 / LP). Renders the brand + the gym's live catalog
 * to LOGGED-OUT visitors via the anon public-read policies (000035): disciplines,
 * weekly schedule grid, membership plans + class monthly fees. Section order is
 * the validated structure. All data sections are gym-scoped + active-only.
 */
export default async function LandingPage({ params: { locale }, searchParams }: Props) {
  setRequestLocale(locale); // pages render independently of layouts — both need it

  // PRAXELLA-DOOR R1: a vendor request renders the Praxella marketing page and
  // returns — no tenant gym resolution, no catalog reads, no tenant chrome.
  const { rawHost, cls } = classifyRequest(searchParams);
  if (cls.kind === 'vendor') {
    return <VendorLanding locale={locale} />;
  }
  // A malformed *.praxella.com subdomain → clean redirect to the vendor apex (never 500).
  if (cls.kind === 'subdomain-invalid') {
    redirect(vendorRedirectUrl());
  }

  // WL-DOMAIN-ROUTING: which gym is this request for? ?gym= (explicit; CI + preview)
  // WINS, then a <slug>.praxella.com subdomain, then a mapped custom domain, then
  // DEFAULT_GYM_SLUG (Railway/localhost → the demo — nothing regresses). Same
  // resolution as the <head> (generateMetadata) so metadata + JSON-LD match.
  const gymSlug = await resolveTenantSlug(rawHost, searchParams?.gym, cls);

  // GRW-1: gym's active disciplines (anon-readable, 000035) → trial-capture
  // interest chips. One fetch here keeps the chips id-accurate for the RPC.
  const gym = await getLandingGym(gymSlug || DEFAULT_GYM_SLUG);
  // An unknown <slug>.praxella.com (no such gym) → clean redirect to the vendor apex,
  // NOT the default gym (a subdomain typo shouldn't silently serve Proline).
  if (cls.kind === 'subdomain' && !gym) {
    redirect(vendorRedirectUrl());
  }
  // AX-2 (defect 4): the RESOLVED, post-fallback slug. On the bare prod landing
  // (no ?gym=) the raw `gymSlug` is undefined → the trial RPC got p_gym_slug=null
  // → 'invalid' → dead form. Every gym-scoped section gets the resolved slug.
  const sectionSlug = gym?.slug ?? DEFAULT_GYM_SLUG;
  // TENANT-CONTENT: only the DEFAULT gym (Proline) may fall back to the built-in Proline
  // identity (name/logo/address/contact/founder credit). Every other tenant shows its own
  // row with honest EMPTY fallbacks — no Proline leak. Passed to every chrome surface.
  const isDefault = sectionSlug === DEFAULT_GYM_SLUG;
  const supabase = await createClient();
  // CATALOG-SCOPE: the trial chips read the same per-gym definer RPC (000080) as
  // DisciplinesSection — no blanket anon table read. Returns id + names, sorted.
  const { data: discRows } = gym
    ? await supabase.rpc('get_landing_disciplines', { p_gym_id: gym.id })
    : { data: null };
  const captureDisciplines = (discRows ?? []).map((d: any) => ({
    id: d.id,
    name: (locale === 'ar' ? d.name_ar : locale === 'fr' ? d.name_fr : d.name_en) || d.name_en,
  }));

  // WL-LANDING: resolve the gym's branding (name/logo/hero/color/tagline). Each
  // falls back to the built-in Proline default when the gym leaves it unset, so
  // the demo renders exactly as before and any gym renders its own look.
  const pick = (ar?: string | null, en?: string | null, fr?: string | null) =>
    (locale === 'ar' ? ar : locale === 'fr' ? fr : en) || en || undefined;
  const branding = {
    name: gym ? (pick(gym.name_ar, gym.name_en, gym.name_fr) || undefined) : undefined,
    // AVATAR-PATHS: logo_url (avatars) + hero_image_url (gym-landing, J5) are stored
    // bucket paths → resolve to public URLs (feed the Nav/Hero/Footer). A pasted
    // absolute URL passes through storagePublicUrl unchanged (the hero escape hatch).
    logoUrl: storagePublicUrl('avatars', gym?.logo_url) || undefined,
    heroImageUrl: storagePublicUrl('gym-landing', gym?.hero_image_url) || undefined,
    brandColor: safeBrandColor(gym?.brand_color),
    tagline: gym ? pick(gym.tagline_ar, gym.tagline_en, gym.tagline_fr) : undefined,
  };

  // PROLINE-LANDING-DATA: contact/social identity + address from the SAME
  // resolved gym (fallback = the built-in Proline defaults when NULL). The
  // Nav/Footer render here (not the layout) because only the page can resolve
  // ?gym= — one gym, one identity, every landing surface.
  const contact = resolveLandingContact(gym, isDefault);
  const address = gym ? pick(gym.address_ar, gym.address_en, gym.address_fr) : undefined;
  const heroBranding = {
    ...branding,
    contactWhatsapp: contact.whatsapp,
    instagramHandle: contact.instagram,
    instagramFollowers: contact.instagramFollowers,
  };

  // SEO-PER-GYM: JSON-LD for the RESOLVED gym (moved out of the layout, which
  // can't read ?gym=). ld+json is a data block — not subject to the strict-dynamic
  // script-src CSP — so no per-request nonce is required.
  const { jsonLd } = await getLandingMeta(locale, gymSlug);

  // WL-BRANDING-DATA: nonce'd :root{--brand…} for the resolved gym (CSP-safe —
  // grabbed from the per-request X-CSP-Nonce the middleware forwards). Default gym
  // + any gym with brand_color NULL resolve to Proline crimson → zero visual change.
  const nonce = headers().get('X-CSP-Nonce') ?? '';
  const brandCss = buildBrandCss(branding.brandColor);

  return (
    <>
      <style
        nonce={nonce}
        data-testid="brand-vars"
        dangerouslySetInnerHTML={{ __html: brandCss }}
      />
      <script
        type="application/ld+json"
        data-testid="landing-jsonld"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingNav locale={locale} gymName={branding.name} logoUrl={branding.logoUrl} isDefault={isDefault} />
      <HeroSection locale={locale} branding={heroBranding} isDefault={isDefault} />
      <AffiliationsSection locale={locale} gymSlug={sectionSlug} />
      <DisciplinesSection locale={locale} gymSlug={sectionSlug} />
      <ScheduleSection locale={locale} gymSlug={sectionSlug} />
      <ChampionsSection locale={locale} gymSlug={sectionSlug} />
      <CoachesSection locale={locale} gymSlug={sectionSlug} />
      <GallerySection locale={locale} gymSlug={sectionSlug} />
      <WhySection locale={locale} isDefault={isDefault} />
      <PricingSection locale={locale} gymSlug={sectionSlug} />
      {/* MJ-5 JOIN-DOOR: the prominent "Request to join" CTA — every gym landing,
          right after the plans (the decision moment). Lands a source=landing lead. */}
      <JoinCTASection locale={locale} gymSlug={sectionSlug} />
      <PtSection locale={locale} gymSlug={sectionSlug} />
      <CampsSection locale={locale} gymSlug={sectionSlug} />
      <FacilitySection locale={locale} contact={contact} isDefault={isDefault} address={address} gymName={branding.name} />
      <TrialCTASection locale={locale} gymSlug={sectionSlug} disciplines={captureDisciplines} />
      <LandingFooter locale={locale} gymName={branding.name} logoUrl={branding.logoUrl} address={address} contact={contact} isDefault={isDefault} />
    </>
  );
}
