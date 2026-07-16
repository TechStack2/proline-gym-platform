import '@/app/praxella-landing.css';
import { useTranslations } from 'next-intl';
import { PraxellaLogo } from '@/components/brand/PraxellaLogo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { RequestDemoSection } from '@/components/marketing/RequestDemoSection';
import { LandingImage } from '@/components/marketing/LandingImage';

/**
 * PRAXELLA-BRAND-IMPL — the Praxella vendor marketing surface, rebuilt to the
 * owner-approved design (docs/demo/praxella-landing-design.html). Server component;
 * copy is code-level i18n (vendor.landing.*, ar/en/fr). Scoped to `.px-landing`
 * (praxella-landing.css) so NOTHING leaks into tenant pages. CSP-safe: classes +
 * Tailwind arbitrary values only, no inline style attributes. Dark sections
 * (hero/verticals/portals/demo/footer) are designed-dark Mat, pinned in both
 * themes; Chalk sections adapt to the viewer's theme via the html.dark override.
 *
 * VIGNETTE FIDELITY: each product mock mirrors a REAL Praxella screen — the hero
 * week board = the /schedule week grid; signups pipeline = leads/approvals;
 * coach board = the schedule coach-diary; PT card+slots = the coach PT roster +
 * schedule flow; the phones = the member portal home + coach today/roster. Sample
 * names/times are illustrative; every LABEL is our real terminology via i18n.
 */
export function VendorLanding({ locale }: { locale: string }) {
  const t = useTranslations('vendor.landing');
  const isRTL = locale === 'ar';
  // Per-locale real product screenshots of the demo gym (seed-demo-gym.js →
  // demo-marketing-capture.spec.ts). /ar shows the Arabic captures. CSP-safe plain
  // <img> via LandingImage (never next/image `fill`, which injects a stripped style).
  const shot = (name: string) => `/marketing/demo/${isRTL ? 'ar' : 'en'}/${name}.webp`;

  return (
    <div className="px-landing" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ══ HERO (designed-dark, pinned) ══ */}
      <header className="px-hero" data-testid="vendor-hero">
        <nav className="px-nav" aria-label="Main">
          <div className="px-wrap">
            <span data-testid="vendor-nav-name">
              <PraxellaLogo markSize={30} className="text-white" />
            </span>
            <div className="nav-links">
              <a className="nav-link" href="#ops">{t('nav.ops')}</a>
              <a className="nav-link" href="#portals">{t('nav.portals')}</a>
              <a className="nav-link" href="#region">{t('nav.region')}</a>
              <LanguageSwitcher locale={locale} />
              <ThemeToggle className="text-white hover:bg-white/10 hover:text-white" />
              {/* host-preserving relative sign-in: on the vendor host the login gate
                  routes platform admins to /vendor; tenant hosts keep their own login */}
              <a className="text-[14px] font-semibold text-white/70 transition-colors hover:text-white" href={`/${locale}/auth/login`} data-testid="vendor-nav-signin">{t('nav.signin')}</a>
              <a className="btn btn-flare !py-2.5" href="#demo" data-testid="vendor-nav-cta">{t('nav.demo')}</a>
            </div>
          </div>
        </nav>

        <div className="px-wrap">
          <span className="hero-badge"><i />{t('hero.badge')}</span>
          <h1 className="hero-h1">
            {t('hero.h1_l1')}<br />{t('hero.h1_l2_before')}<span className="em">{t('hero.h1_flare')}</span>{t('hero.h1_l2_after')}
          </h1>
          <p className="hero-sub">{t('hero.sub')}</p>
          <div className="hero-ctas">
            <a className="btn btn-flare" href="#demo" data-testid="vendor-cta">{t('hero.cta')}</a>
            <a className="btn btn-ghost" href="#ops">{t('hero.cta2')}</a>
          </div>
          <div className="hero-proof">
            {([1, 2, 3, 4] as const).map((n) => (
              <span key={n}><b>{t(`hero.proof${n}_b` as Parameters<typeof t>[0])}</b> {t(`hero.proof${n}_t` as Parameters<typeof t>[0])}</span>
            ))}
          </div>

          {/* week board — mirrors the /schedule week grid (week-chip per slot + live capacity) */}
          <div className="board" data-testid="vendor-board" role="img" aria-label={t('board.title')}>
            <div className="board-head">
              <span className="board-title"><i />{t('board.title')}</span>
              <span className="board-meta num">{t('board.meta')}</span>
            </div>
            <LandingImage src={shot('board')} alt={t('board.title')} eager
              className="board-shot" fallbackClassName="aspect-[16/6] rounded-[10px]" fallbackLabel={t('board.title')} />
          </div>
        </div>
      </header>

      {/* ══ VERTICALS strip (pinned dark) ══ */}
      <div className="verticals" data-testid="vendor-verticals" aria-label={t('nav.region')}>
        <div className="px-wrap">
          {['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map((v, i) => (
            <span key={v} className="contents">
              {i > 0 && <i />}
              <span className="v">{t(`verticals.${v}` as Parameters<typeof t>[0])}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ══ OPERATIONS (chalk, adapts) ══ */}
      <section className="sec" id="ops" data-testid="vendor-ops">
        <div className="px-wrap">
          <div className="sec-head">
            <span className="kicker">{t('ops.kicker')}</span>
            <h2>{t('ops.h2_l1')}<br />{t('ops.h2_l2')}</h2>
            <p>{t('ops.sub')}</p>
          </div>

          {/* 01 · Signups — mirrors the leads pipeline + request→approve→roster flow */}
          <div className="split mb-[88px]" data-testid="vendor-ops-split" data-op="signups">
            <div>
              <span className="kicker">{t('ops.s1.kicker')}</span>
              <h3>{t('ops.s1.h3_l1')}<br />{t('ops.s1.h3_l2')}</h3>
              <p>{t('ops.s1.p')}</p>
              <ul className="ticks">
                <li>{t('ops.s1.t1')}</li><li>{t('ops.s1.t2')}</li><li>{t('ops.s1.t3')}</li>
              </ul>
            </div>
            <div className="viz" role="img" aria-label={t('ops.s1.viz_t')}>
              <div className="viz-h"><span className="viz-t">{t('ops.s1.viz_t')}</span><span className="chip chip-jade">{t('ops.s1.chip')}</span></div>
              <LandingImage src={shot('signups')} alt={t('ops.s1.viz_t')}
                className="viz-shot" fallbackClassName="aspect-[16/10] rounded-[10px]" fallbackLabel={t('ops.s1.viz_t')} />
            </div>
          </div>

          {/* 02 · Schedules/capacity/coaches — mirrors the schedule coach-diary lanes */}
          <div className="split rev mb-[88px]" data-testid="vendor-ops-split" data-op="schedule">
            <div className="viz" role="img" aria-label={t('ops.s2.viz_t')}>
              <div className="viz-h"><span className="viz-t">{t('ops.s2.viz_t')}</span><span className="chip chip-amber">{t('ops.s2.chip')}</span></div>
              <LandingImage src={shot('coachboard')} alt={t('ops.s2.viz_t')}
                className="viz-shot" fallbackClassName="aspect-[16/10] rounded-[10px]" fallbackLabel={t('ops.s2.viz_t')} />
            </div>
            <div>
              <span className="kicker">{t('ops.s2.kicker')}</span>
              <h3>{t('ops.s2.h3_l1')}<br />{t('ops.s2.h3_l2')}</h3>
              <p>{t('ops.s2.p')}</p>
              <ul className="ticks"><li>{t('ops.s2.t1')}</li><li>{t('ops.s2.t2')}</li><li>{t('ops.s2.t3')}</li></ul>
            </div>
          </div>

          {/* 03 · PT — mirrors the coach PT roster (package + sessions) + slot scheduling */}
          <div className="split" data-testid="vendor-ops-split" data-op="pt">
            <div>
              <span className="kicker">{t('ops.s3.kicker')}</span>
              <h3>{t('ops.s3.h3_l1')}<br />{t('ops.s3.h3_l2')}</h3>
              <p>{t('ops.s3.p')}</p>
              <ul className="ticks"><li>{t('ops.s3.t1')}</li><li>{t('ops.s3.t2')}</li><li>{t('ops.s3.t3')}</li></ul>
            </div>
            <div className="viz" role="img" aria-label={t('ops.s3.viz_t')}>
              <div className="viz-h"><span className="viz-t">{t('ops.s3.viz_t')}</span><span className="chip chip-flare">{t('ops.s3.chip')}</span></div>
              <LandingImage src={shot('pt')} alt={t('ops.s3.viz_t')}
                className="viz-shot" fallbackClassName="aspect-[16/10] rounded-[10px]" fallbackLabel={t('ops.s3.viz_t')} />
            </div>
          </div>
        </div>
      </section>

      {/* ══ PORTALS (dark band, pinned) ══ */}
      <section className="sec px-dark" id="portals" data-testid="vendor-portals">
        <div className="px-wrap">
          <div className="sec-head mx-auto text-center">
            <span className="kicker justify-center">{t('portals.kicker')}</span>
            <h2>{t('portals.h2_l1')}<br />{t('portals.h2_l2')}</h2>
            <p className="mx-auto">{t('portals.sub')}</p>
          </div>
          <div className="phones">
            {/* Member portal — mirrors /portal home: next class, rank/belt, balance-due card */}
            <div className="phone-slot" data-testid="vendor-phone" data-portal="member">
              <h4>{t('portals.member_t')}</h4>
              <p>{t('portals.member_p')}</p>
              <div className="phone" role="img" aria-label={t('portals.member_t')}>
                <div className="phone-bar" />
                <LandingImage src={shot('member')} alt={t('portals.member_t')}
                  className="papp-shot" fallbackClassName="aspect-[9/17] rounded-[19px]" fallbackLabel={t('portals.member_t')} />
              </div>
            </div>
            {/* Coach portal — mirrors coach today + roster one-tap check-in */}
            <div className="phone-slot" data-testid="vendor-phone" data-portal="coach">
              <h4>{t('portals.coach_t')}</h4>
              <p>{t('portals.coach_p')}</p>
              <div className="phone" role="img" aria-label={t('portals.coach_t')}>
                <div className="phone-bar" />
                <LandingImage src={shot('coach')} alt={t('portals.coach_t')}
                  className="papp-shot" fallbackClassName="aspect-[9/17] rounded-[19px]" fallbackLabel={t('portals.coach_t')} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ REGION (chalk, adapts) ══ */}
      <section className="sec" id="region" data-testid="vendor-region">
        <div className="px-wrap">
          <div className="sec-head">
            <span className="kicker">{t('region.kicker')}</span>
            <h2>{t('region.h2_l1')}<br />{t('region.h2_l2')}</h2>
            <p>{t('region.sub')}</p>
          </div>
          <div className="trio">
            <div className="tcard" data-testid="vendor-tcard" data-card="arabic">
              <div className="art art-ar" dir="rtl" role="img" aria-label={t('region.ar_aria')}>
                <b>منصّتك، <em>بلغتك</em></b>
              </div>
              <h3>{t('region.ar_t')}</h3><p>{t('region.ar_p')}</p>
            </div>
            <div className="tcard" data-testid="vendor-tcard" data-card="fx">
              <div className="art art-fx" role="img" aria-label={t('region.fx_aria')}>
                <div className="fxrow usd"><span className="cur">USD</span><span className="amt num">$45.00</span></div>
                <div className="fxrow"><span className="cur">LBP</span><span className="amt num">4,050,000</span></div>
                <span className="fxnote num">{t('region.fx_note')}</span>
              </div>
              <h3>{t('region.fx_t')}</h3><p>{t('region.fx_p')}</p>
            </div>
            <div className="tcard" data-testid="vendor-tcard" data-card="wa">
              <div className="art art-wa" role="img" aria-label={t('region.wa_aria')}>
                <span className="offline-pill"><i />{t('region.offline')}</span>
                <span className="bub">{t('region.wa_bub')}</span>
                <span className="bub me">{t('region.wa_me')}</span>
              </div>
              <h3>{t('region.wa_t')}</h3><p>{t('region.wa_p')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ WHITE-LABEL (chalk, adapts) ══ */}
      <section className="sec pt-0" data-testid="vendor-wl">
        <div className="px-wrap">
          <div className="sec-head">
            <span className="kicker">{t('wl.kicker')}</span>
            <h2>{t('wl.h2')}</h2>
            <p>{t.rich('wl.sub', { b: (c) => <strong>{c}</strong> })}</p>
          </div>
          <div className="wl">
            <div className="browser" data-testid="vendor-browser" role="img" aria-label={t('wl.b1_aria')}>
              <div className="bbar"><span className="bdots"><i /><i /><i /></span>
                <span className="burl">https://<b>proline-gym</b>.praxella.com</span></div>
              <div className="bhero crimson"><span className="mini-k">{t('wl.b1_k')}</span><div className="mini-t">Pro Line Gym</div><span className="mini-b">{t('wl.b1_b')}</span></div>
            </div>
            <div className="browser" data-testid="vendor-browser" role="img" aria-label={t('wl.b2_aria')}>
              <div className="bbar"><span className="bdots"><i /><i /><i /></span>
                <span className="burl">https://<b>aluna-dance.com</b> · {t('wl.custom')}</span></div>
              <div className="bhero royal"><span className="mini-k">{t('wl.b2_k')}</span><div className="mini-t">Aluna Studio</div><span className="mini-b">{t('wl.b2_b')}</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ DEMO (dark band, pinned) — the REAL submit_platform_lead form ══ */}
      <RequestDemoSection locale={locale} />

      {/* ══ FOOTER (pinned dark) ══ */}
      <footer className="px-footer" data-testid="vendor-footer">
        <div className="px-wrap">
          <PraxellaLogo markSize={22} className="text-white" />
          <div className="foot-links">
            <a href="#ops">{t('nav.ops')}</a><a href="#portals">{t('nav.portals')}</a>
            <a href="#region">{t('footer.region')}</a><a href="#demo">{t('footer.demo')}</a>
          </div>
          <span>{t('footer.copy')}</span>
        </div>
      </footer>
    </div>
  );
}
