import '@/app/praxella-landing.css';
import { useTranslations } from 'next-intl';
import { PraxellaLogo } from '@/components/brand/PraxellaLogo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { RequestDemoSection } from '@/components/marketing/RequestDemoSection';

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
  const days = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;

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
            <div className="board-grid">
              {days.map((d) => (
                <div className="day" key={d}>
                  <div className="day-h">{t(`board.days.${d}` as Parameters<typeof t>[0])}</div>
                  {BOARD[d].map((s, i) => (
                    <div className={`sess${s.k ? ' ' + s.k : ''}`} key={i}>
                      <div className="sess-t num">{s.pt ? `${s.time} · PT` : s.time}</div>
                      <div className="sess-n">{s.name}</div>
                      <div className="sess-c">{s.coach}</div>
                      <div className="cap">
                        <span className="cap-bar"><i className={s.w} /></span>
                        <span className="cap-n num">{s.cap}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
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
              <div className="pipe">
                <div className="pipe-col"><h4>{t('ops.s1.col1')} <b className="num">3</b></h4>
                  <div className="lead"><div className="lead-n">Omar K.</div><div className="lead-d">BJJ Kids · age 9 · via website</div>
                    <div className="lead-a"><span className="ok">{t('ops.s1.approve')}</span><span className="no">{t('ops.s1.later')}</span></div></div>
                  <div className="lead ghost"><div className="lead-n">Sara M.</div><div className="lead-d">Ladies Fitness · walk-in</div></div>
                </div>
                <div className="pipe-col"><h4>{t('ops.s1.col2')} <b className="num">2</b></h4>
                  <div className="lead"><div className="lead-n">Nour H.</div><div className="lead-d">Gymnastics L2 · {t('ops.s1.invoiced')}</div></div>
                  <div className="lead ghost"><div className="lead-n">Jad T.</div><div className="lead-d">Boxing Adults</div></div>
                </div>
                <div className="pipe-col"><h4>{t('ops.s1.col3')} <b className="num">1</b></h4>
                  <div className="lead paid"><div className="lead-n">Karim A.</div><div className="lead-d"><b>{t('ops.s1.paid')}</b> · Muay Thai</div></div>
                </div>
              </div>
            </div>
          </div>

          {/* 02 · Schedules/capacity/coaches — mirrors the schedule coach-diary lanes */}
          <div className="split rev mb-[88px]" data-testid="vendor-ops-split" data-op="schedule">
            <div className="viz" role="img" aria-label={t('ops.s2.viz_t')}>
              <div className="viz-h"><span className="viz-t">{t('ops.s2.viz_t')}</span><span className="chip chip-amber">{t('ops.s2.chip')}</span></div>
              <div className="lanes">
                {LANES.map((ln) => (
                  <div className="lane" key={ln.i}>
                    <div className="lane-c"><span className={`ava ${ln.avaBg}`}>{ln.i}</span>
                      <span><span className="lane-nm">{ln.nm}</span><br /><span className="lane-r">{ln.r}</span></span></div>
                    <div className="lane-t">
                      {ln.blocks.map((b, j) => (
                        <span key={j} className={`blk ${b.k} ${b.pos}`}>{b.label}</span>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="lane-axis"><div /><div className="axis-t"><span>8:00</span><span>12:00</span><span>16:00</span><span>20:00</span></div></div>
              </div>
              <div className="legend">
                <span><i className="bg-[var(--px-mat)]" />{t('ops.s2.legend_cls')}</span>
                <span><i className="bg-[var(--px-court)]" />{t('ops.s2.legend_cls2')}</span>
                <span><i className="bg-[var(--px-flare)]" />{t('ops.s2.legend_pt')}</span>
              </div>
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
              <div className="ptwrap">
                <div className="ptcard">
                  <div className="k">{t('ops.s3.pkg_k')}</div>
                  <div className="n">{t('ops.s3.pkg_n')}</div>
                  <div className="ptdots" aria-label={t('ops.s3.used', { u: 9, total: 12 })}>
                    {Array.from({ length: 12 }).map((_, i) => <i key={i} className={i < 9 ? 'u' : ''} />)}
                  </div>
                  <div className="s">{t.rich('ops.s3.usedline', { u: 9, total: 12, d: 'Oct 15', b: (c) => <b className="num">{c}</b> })}</div>
                </div>
                <div className="slots">
                  <h5>{t('ops.s3.slots_h')}</h5>
                  <div className="slot-g">
                    <span className="slot num">Tue 10:00</span><span className="slot off num">Tue 16:00</span><span className="slot num">Wed 09:00</span>
                    <span className="slot on num">Wed 20:00</span><span className="slot off num">Thu 18:00</span><span className="slot num">Fri 11:00</span>
                  </div>
                  <div className="foot">{t('ops.s3.foot')}</div>
                </div>
              </div>
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
                <div className="papp">
                  <div className="papp-h"><span className="hi">{t('portals.member_hi')}<small>Proline Gym · {t('portals.member_role')}</small></span>
                    <span className="ava bg-[var(--px-court)]">KA</span></div>
                  <div className="pcard"><div className="k">{t('portals.next_class')}</div><div className="v num">Muay Thai · Mon 18:00</div>
                    <div className="v !text-[10.5px] !font-bold mt-px text-[color:var(--px-ink-mute)]">{t('portals.spots', { n: 2 })}</div></div>
                  <div className="pcard"><div className="k">{t('portals.rank')}</div><div className="v">{t('portals.rank_v')}</div>
                    <div className="belt"><i className="w" /><i className="y" /><i className="o" /><i /><i /><i /></div></div>
                  <div className="pcard due"><div className="k">{t('portals.balance')}</div><div className="v num">$45 <small>· 4,050,000 LBP</small></div>
                    <span className="act f">{t('portals.view_invoice')}</span></div>
                </div>
              </div>
            </div>
            {/* Coach portal — mirrors coach today + roster one-tap check-in */}
            <div className="phone-slot" data-testid="vendor-phone" data-portal="coach">
              <h4>{t('portals.coach_t')}</h4>
              <p>{t('portals.coach_p')}</p>
              <div className="phone" role="img" aria-label={t('portals.coach_t')}>
                <div className="phone-bar" />
                <div className="papp">
                  <div className="papp-h"><span className="hi">Coach Sami<small>{t('portals.coach_sub')}</small></span>
                    <span className="ava bg-[var(--px-flare)]">SA</span></div>
                  <div className="pcard"><div className="k">{t('portals.now')} · 16:00</div><div className="v num">BJJ Kids · {t('portals.checked_in', { n: 14, m: 16 })}</div></div>
                  <div className="roster">
                    <div className="rrow here"><span className="ava bg-[var(--px-court)]">OK</span><span className="nm">Omar K.</span><span className="st in">{t('portals.in')}</span></div>
                    <div className="rrow here"><span className="ava bg-[var(--px-mat)]">NH</span><span className="nm">Nour H.</span><span className="st in">{t('portals.in')}</span></div>
                    <div className="rrow"><span className="ava bg-[var(--px-sand)]">JT</span><span className="nm">Jad T.</span><span className="st tap">{t('portals.tap_in')}</span></div>
                  </div>
                  <div className="pcard mt-2 !mb-0"><div className="k">{t('portals.next')}</div>
                    <div className="v num">18:00 BJJ Adults · {t('portals.then_pt')}</div></div>
                </div>
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

// Illustrative vignette data (marketing mock; labels above are real i18n terminology).
const BOARD: Record<string, Array<{ time: string; name: string; coach: string; cap: string; w: string; k?: string; pt?: boolean }>> = {
  mon: [
    { time: '16:00', name: 'BJJ Kids', coach: 'Coach Sami', cap: '12/16', w: 'w-[75%]' },
    { time: '18:00', name: 'Muay Thai', coach: 'Coach Rani', cap: '18/20', w: 'w-[90%]', k: 'warn' },
  ],
  tue: [
    { time: '10:00', name: '1-on-1 Strength', coach: 'Coach Maya', cap: '1/1', w: 'w-full', k: 'pt', pt: true },
    { time: '17:00', name: 'Gymnastics L2', coach: 'Coach Maya', cap: '7/12', w: 'w-[58%]' },
  ],
  wed: [
    { time: '16:00', name: 'BJJ Kids', coach: 'Coach Sami', cap: '16/16', w: 'w-full', k: 'full' },
    { time: '19:00', name: 'Ladies Fitness', coach: 'Coach Maya', cap: '13/20', w: 'w-[65%]' },
    { time: '20:00', name: 'Fight Camp Prep', coach: 'Coach Rani', cap: '1/1', w: 'w-full', k: 'pt', pt: true },
  ],
  thu: [
    { time: '17:00', name: 'Hip-Hop Teens', coach: 'Coach Lea', cap: '9/20', w: 'w-[45%]' },
    { time: '18:30', name: 'Boxing Adults', coach: 'Coach Rani', cap: '22/24', w: 'w-[92%]', k: 'warn' },
  ],
  fri: [
    { time: '16:00', name: 'BJJ Adults', coach: 'Coach Sami', cap: '14/20', w: 'w-[70%]' },
    { time: '18:00', name: 'Open Mat', coach: 'All coaches', cap: '—', w: 'w-[40%]' },
  ],
};

const LANES = [
  { i: 'SA', nm: 'Sami', r: 'BJJ · Head coach', avaBg: 'bg-[var(--px-court)]', blocks: [
    { k: 'cls', label: 'BJJ Kids', pos: 'left-[8%] w-[19%]' }, { k: 'cls2', label: 'BJJ Adults', pos: 'left-[32%] w-[21%]' }, { k: 'pt', label: 'PT · Ali', pos: 'left-[58%] w-[15%]' },
  ] },
  { i: 'MA', nm: 'Maya', r: 'Gymnastics · Fitness', avaBg: 'bg-[var(--px-flare)]', blocks: [
    { k: 'pt', label: 'PT · Rita', pos: 'left-[2%] w-[15%]' }, { k: 'cls', label: 'Gymnastics', pos: 'left-[22%] w-[23%]' }, { k: 'cls2', label: 'Ladies Fit', pos: 'left-[50%] w-[21%]' },
  ] },
  { i: 'RA', nm: 'Rani', r: 'Muay Thai · Boxing', avaBg: 'bg-[var(--px-mat)]', blocks: [
    { k: 'cls', label: 'Muay Thai', pos: 'left-[14%] w-[23%]' }, { k: 'pt', label: 'PT · Hadi', pos: 'left-[62%] w-[17%]' },
  ] },
] as const;
