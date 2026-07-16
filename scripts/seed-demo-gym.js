#!/usr/bin/env node
/**
 * DEMO-GYM + SHOT-SWAP · R1 — idempotent, service-role seed of the "demo" gym.
 *
 * Builds a photogenic demo tenant (slug "demo", deep-teal brand #0E7490) whose
 * real product screens are captured for the Praxella marketing landing. Safe by
 * construction: the SLUG is a hard constant — this script only ever touches the
 * "demo" gym, and --reset hard-refuses any other slug.
 *
 * Reuses existing platform idioms (never bypasses the BILL-GUARDS fee rules):
 *   · scaffolding via seed_e2e_gym_no_membership('demo', pwd) — the service-role-
 *     granted wrapper that runs the (REVOKEd) seed_e2e_gym as its owner: makes the
 *     gym, the 4 role logins, the 20-rank belt ladder, base catalog + FX. We then
 *     re-enable the membership product and layer a full, believable dataset.
 *   · every priced product (class fee, membership, PT pack, camp) is seeded WITH a
 *     price set (0 = legitimately free) — honouring the BILL-GUARDS NULL-fee guards
 *     by construction. Invoices are inserted directly (invoice_number='' → the
 *     number-lock trigger assigns it), exactly as seed_e2e_gym itself does.
 *
 * Idempotent / re-runnable:
 *   · default:  refreshes the demo data layer in place (WIPE member/journey/catalog-
 *     extras scoped to the demo gym, preserving the gym row + the 4 logins), then
 *     rebuilds deterministically → running twice converges to the same state.
 *   · --reset:  additionally tears the gym down entirely (gym row + demo logins)
 *     before re-provisioning — a clean-slate rebuild.
 *
 * Usage:
 *   node scripts/seed-demo-gym.js --url <supabase-url> --key <service-role-key> [--reset] [--password <pwd>]
 *   # or via env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEMO_SEED_PASSWORD
 *
 * ── DOCUMENTED DEMO LOGINS (email · password) ──────────────────────────────────
 *   Owner .......... owner+demo@e2e.local      · <password>   → lands in /dashboard
 *   Coach (Sami) ... coach+demo@e2e.local      · <password>   → lands in /coach
 *   Reception ...... reception+demo@e2e.local  · <password>   → lands in /dashboard
 *   Member (Karim) . student+demo@e2e.local    · <password>   → lands in /portal
 *   (<password> defaults to E2eTestPass!23 unless --password/DEMO_SEED_PASSWORD given)
 * ───────────────────────────────────────────────────────────────────────────────
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');

// ─── args / env ────────────────────────────────────────────────────────────────
function flag(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const SLUG = 'demo'; // HARD CONSTANT — never parameterised; the only gym this script touches
const RESET = process.argv.includes('--reset');
const URL = flag('url') || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = flag('key') || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = flag('password') || process.env.DEMO_SEED_PASSWORD || 'E2eTestPass!23';

if (!URL || !KEY) {
  console.error('ERROR: need a Supabase URL and service-role key.\n' +
    '  node scripts/seed-demo-gym.js --url <url> --key <service-key> [--reset]\n' +
    '  (or env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ─── date helpers (anchored to today; keeps the demo "live") ────────────────────
const today = new Date(); today.setHours(0, 0, 0, 0);
const now = new Date();
const month0 = new Date(today.getFullYear(), today.getMonth(), 1);
const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
const todayDow = today.getDay(); // 0=Sun … 6=Sat (matches class_schedules.day_of_week)
const d = (base, n) => { const x = new Date(base); x.setDate(x.getDate() + n); return x; };
const isoDate = (x) => x.toISOString().slice(0, 10);
const isoTs = (x) => x.toISOString();

// ─── tiny data helpers ──────────────────────────────────────────────────────────
async function insOne(table, row) {
  const { data, error } = await sb.from(table).insert(row).select().single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data;
}
async function insMany(table, rows) {
  if (!rows.length) return [];
  const { data, error } = await sb.from(table).insert(rows).select();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data;
}
async function update(table, patch, col, val) {
  const { error } = await sb.from(table).update(patch).eq(col, val);
  if (error) throw new Error(`update ${table}: ${error.message}`);
}
async function ids(table, col, filterCol, filterVal) {
  let q = sb.from(table).select(col);
  q = Array.isArray(filterVal) ? q.in(filterCol, filterVal) : q.eq(filterCol, filterVal);
  const { data, error } = await q;
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return data.map((r) => r[col]);
}
async function delIn(table, col, vals) {
  if (!vals.length) return;
  const { error } = await sb.from(table).delete().in(col, vals);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}
async function delEq(table, col, val) {
  const { error } = await sb.from(table).delete().eq(col, val);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}
async function count(table, filterCol, filterVal) {
  let q = sb.from(table).select('*', { count: 'exact', head: true });
  q = Array.isArray(filterVal) ? q.in(filterCol, filterVal) : q.eq(filterCol, filterVal);
  const { count: c, error } = await q;
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return c || 0;
}

// Direct invoice insert (seed idiom — invoice_number='' → number-lock trigger fills
// it). Optionally records a payment and flips to paid. Honours BILL-GUARDS: amount
// is always a real positive number.
async function issueInvoice({ gym, student, type, usd, membershipId = null, dueDate, notes, receivedBy, paid = false, method = 'cash_usd', payDate = today, status = 'pending' }) {
  const inv = await insOne('invoices', {
    gym_id: gym, student_id: student, membership_id: membershipId,
    invoice_type: type, invoice_number: '',
    amount_usd: usd, amount_lbp: 0, tax_rate: 11.0, total_usd: usd,
    status, due_date: isoDate(dueDate), notes_en: notes,
  });
  if (paid) {
    await insOne('payments', {
      invoice_id: inv.id, student_id: student, received_by: receivedBy || null,
      amount_usd: usd, payment_method: method, payment_date: isoTs(payDate),
    });
    await update('invoices', { status: 'paid' }, 'id', inv.id);
  }
  return inv;
}

// ─── teardown (—reset): gym cascade + demo logins ──────────────────────────────
async function teardownDemo(gymId) {
  // gym-scoped FKs are ON DELETE CASCADE (mirrors teardown_e2e_gym) → one delete
  // clears profiles/students/classes/leads/… and gym-scoped user_roles.
  if (gymId) await delEq('gyms', 'id', gymId);
  // remove the run-scoped logins (owner+demo@… etc.) so identity is regenerated.
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of (list?.users || [])) {
    if (u.email && u.email.endsWith(`+${SLUG}@e2e.local`)) {
      await sb.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }
}

// ─── WIPE the demo data layer (default refresh) — preserve gym + logins + belt
// ladder + membership_plans/pt_packages catalog tables; rebuild everything else. ──
async function wipeDataLayer(gym, keepCoachProfileIds) {
  const studentIds = await ids('students', 'id', 'gym_id', gym);
  const classIds = await ids('classes', 'id', 'gym_id', gym);
  const leadIds = await ids('leads', 'id', 'gym_id', gym);
  const campIds = await ids('camps', 'id', 'gym_id', gym);

  await delIn('payments', 'student_id', studentIds);
  await delEq('notifications', 'gym_id', gym);
  await delIn('belt_promotions', 'student_id', studentIds);
  await delIn('pt_sessions', 'student_id', studentIds);
  await delIn('pt_assignments', 'student_id', studentIds);
  await delIn('attendance_records', 'student_id', studentIds);
  await delIn('camp_registrations', 'camp_id', campIds);
  await delEq('camps', 'gym_id', gym);
  await delEq('class_registrations', 'gym_id', gym);
  await delIn('class_enrollments', 'student_id', studentIds);
  await delIn('trial_classes', 'lead_id', leadIds);
  await delEq('waiver_signatures', 'gym_id', gym);
  await delEq('member_followups', 'gym_id', gym);
  await delIn('invoices', 'student_id', studentIds); // after payments
  await delIn('student_memberships', 'student_id', studentIds);
  await delEq('leads', 'gym_id', gym); // after trial_classes
  await delIn('class_schedules', 'class_id', classIds);
  await delEq('coach_availability', 'gym_id', gym);
  await delEq('classes', 'gym_id', gym); // after enrollments/registrations/attendance
  await delEq('gym_landing_images', 'gym_id', gym);
  await delEq('students', 'gym_id', gym); // after all student children

  // Extra login-less coaches from a prior run (keep only the coach+demo login's row).
  const keepCoachRows = await sb.from('coaches').select('id,profile_id').eq('gym_id', gym);
  const dropCoachIds = (keepCoachRows.data || [])
    .filter((c) => !keepCoachProfileIds.includes(c.profile_id))
    .map((c) => c.id);
  await delIn('coaches', 'id', dropCoachIds);

  // Pure member/extra-coach profiles (NOT logins, NOT the preserved coach profiles).
  const roleUserIds = await ids('user_roles', 'user_id', 'gym_id', gym);
  const { data: memberProfiles } = await sb.from('profiles').select('id').eq('gym_id', gym);
  const dropProfileIds = (memberProfiles || [])
    .map((p) => p.id)
    .filter((id) => !roleUserIds.includes(id) && !keepCoachProfileIds.includes(id));
  await delIn('profiles', 'id', dropProfileIds);
}

// ─── name pools (believable Lebanese roster) ────────────────────────────────────
const FN = ['Karim', 'Lina', 'Omar', 'Maya', 'Rami', 'Nour', 'Sami', 'Dana', 'Ali', 'Yara', 'Hadi', 'Lara', 'Ziad', 'Rana', 'Fadi'];
const FN_AR = ['كريم', 'لينا', 'عمر', 'مايا', 'رامي', 'نور', 'سامي', 'دانا', 'علي', 'يارا', 'هادي', 'لارا', 'زياد', 'رنا', 'فادي'];
const LN = ['Mourad', 'Khalil', 'Haddad', 'Saad', 'Aoun', 'Fares', 'Nassar', 'Rizk', 'Sleiman', 'Daher', 'Karam', 'Najjar', 'Chami', 'Hage', 'Bitar'];
const LN_AR = ['مراد', 'خليل', 'حداد', 'سعد', 'عون', 'فارس', 'نصار', 'رزق', 'سليمان', 'ضاهر', 'كرم', 'نجار', 'شامي', 'حاج', 'بيطار'];
const GEN = ['male', 'female', 'male', 'female', 'male', 'female', 'male', 'female', 'male', 'female', 'male', 'female', 'male', 'female', 'male'];
const BELTS = ['orange', 'yellow', 'orange', 'white', 'green', 'yellow', 'blue', 'orange', 'white', 'yellow', 'green', 'white', 'orange', 'yellow', 'blue'];

async function main() {
  console.log(`[seed-demo-gym] slug="${SLUG}" reset=${RESET} url=${URL}`);

  // 0. reset → tear the existing demo gym down first.
  if (RESET) {
    const { data: g } = await sb.from('gyms').select('id').eq('slug', SLUG).maybeSingle();
    await teardownDemo(g?.id);
    console.log('[seed-demo-gym] --reset: torn down prior demo gym + logins');
  }

  // 1. scaffold: gym + 4 logins + belt ladder + base catalog + FX (idempotent).
  const { data: gymId, error: seedErr } = await sb.rpc('seed_e2e_gym_no_membership', { p_slug: SLUG, p_password: PASSWORD });
  if (seedErr) throw new Error(`seed_e2e_gym_no_membership: ${seedErr.message}`);
  console.log(`[seed-demo-gym] scaffolded gym ${gymId}`);

  // 2. re-enable ALL products (the no_membership wrapper disabled membership).
  await update('gyms', { enabled_products: { membership: true, class: true, pt: true, camp: true } }, 'id', gymId);

  // 3. resolve the role logins (owner=payments/notify, coach=Sami, student=Karim).
  const { data: userList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byEmail = (e) => (userList?.users || []).find((u) => u.email === e)?.id;
  const ownerUid = byEmail(`owner+${SLUG}@e2e.local`);
  const coachUid = byEmail(`coach+${SLUG}@e2e.local`);
  const studentUid = byEmail(`student+${SLUG}@e2e.local`);
  if (!coachUid || !studentUid) throw new Error('demo logins not found after scaffold');

  // 4. brand + identity + public landing content (deep-teal, dual-currency, Beirut).
  await update('gyms', {
    name_en: 'Demo Gym', name_ar: 'نادي ديمو', name_fr: 'Demo Gym',
    brand_color: '#0E7490', currency_preference: 'BOTH', timezone: 'Asia/Beirut',
    city: 'Hadath', country: 'Lebanon',
    tagline_en: 'Train hard. Track everything.', tagline_ar: 'تدرّب بقوة. تابع كل شيء.', tagline_fr: 'Entraîne-toi. Suis tout.',
    hero_image_url: '/landing/hero.jpg',
    contact_whatsapp: '96170000000', contact_phone: '+96170000000', contact_email: 'hello@demogym.example',
    instagram_handle: 'demogym', instagram_followers: 1840, facebook_handle: 'demogym',
    map_lat: 33.834, map_lng: 35.544,
  }, 'id', gymId);

  // 5. WIPE the prior data layer (keeps gym + logins + belt ladder + plans/packages).
  const samiCoach = (await sb.from('coaches').select('id,profile_id').eq('gym_id', gymId).eq('profile_id', coachUid).maybeSingle()).data;
  await wipeDataLayer(gymId, [coachUid]);

  // 6. disciplines → exactly {Muay Thai, BJJ, Fitness} (scaffold made Muay Thai + Boxing).
  const disc = {};
  {
    const { data: existing } = await sb.from('disciplines').select('id,name_en').eq('gym_id', gymId);
    const find = (n) => existing.find((x) => x.name_en === n)?.id;
    disc.mt = find('Muay Thai');
    // BJJ: reuse if present, else repurpose the scaffold "Boxing" row, else insert
    // (idempotent — a second run finds BJJ already and does not duplicate it).
    disc.bjj = find('BJJ');
    if (!disc.bjj) {
      const boxing = find('Boxing');
      if (boxing) {
        await update('disciplines', { name_en: 'BJJ', name_ar: 'جوجيتسو برازيلي', name_fr: 'JJB', sort_order: 2, is_active: true }, 'id', boxing);
        disc.bjj = boxing;
      } else {
        disc.bjj = (await insOne('disciplines', { gym_id: gymId, name_en: 'BJJ', name_ar: 'جوجيتسو برازيلي', name_fr: 'JJB', sort_order: 2 })).id;
      }
    }
    disc.fit = find('Fitness') || (await insOne('disciplines', { gym_id: gymId, name_en: 'Fitness', name_ar: 'لياقة', name_fr: 'Fitness', sort_order: 3 })).id;
    if (disc.mt) await update('disciplines', { sort_order: 1, is_active: true }, 'id', disc.mt);
    // retire any other scaffold disciplines from the active catalog (keep exactly 3)
    for (const x of existing) {
      if (![disc.mt, disc.bjj, disc.fit].includes(x.id)) await update('disciplines', { is_active: false }, 'id', x.id);
    }
  }

  // 7. coaches → 4 (Sami login + 3 login-less), published to the landing showcase.
  const coaches = [];
  // Sami (the coach login) — refreshed showcase copy
  await update('coaches', {
    specialization_en: 'Head Coach · Muay Thai', specialization_ar: 'المدرب الرئيسي · مواي تاي', specialization_fr: 'Entraîneur principal · Muay Thaï',
    bio_en: 'Leads the demo fight team with a decade in the ring — champions from the fundamentals up.',
    bio_ar: 'يقود الفريق بخبرة عقد في الحلبة — أبطال من الأساسيات.',
    bio_fr: 'Dirige l’équipe avec dix ans sur le ring — des champions dès les bases.',
    landing_visible: true, landing_status: 'active', has_pending_changes: false, last_published_at: isoTs(now),
  }, 'id', samiCoach.id);
  coaches.push(samiCoach.id);
  // 3 login-less coaches
  const extraCoachDefs = [
    { fn: 'Maya', ln: 'Fares', fnAr: 'مايا', lnAr: 'فارس', belt: 'brown', spec_en: 'BJJ & Grappling', spec_ar: 'جوجيتسو ومصارعة', spec_fr: 'JJB & Grappling', status: 'active' },
    { fn: 'Rani', ln: 'Saad', fnAr: 'راني', lnAr: 'سعد', belt: 'black_1', spec_en: 'Boxing & Conditioning', spec_ar: 'ملاكمة ولياقة', spec_fr: 'Boxe & Prépa', status: 'active' },
    { fn: 'Lea', ln: 'Khoury', fnAr: 'ليا', lnAr: 'خوري', belt: 'purple', spec_en: 'Fitness & Kids', spec_ar: 'لياقة وأطفال', spec_fr: 'Fitness & Enfants', status: 'coming_soon' },
  ];
  for (const c of extraCoachDefs) {
    const prof = await insOne('profiles', {
      gym_id: gymId, first_name_en: c.fn, first_name_ar: c.fnAr, first_name_fr: c.fn,
      last_name_en: c.ln, last_name_ar: c.lnAr, last_name_fr: c.ln, gender: 'female',
    });
    const row = await insOne('coaches', {
      profile_id: prof.id, gym_id: gymId, belt_rank: c.belt, hourly_rate_usd: 25.0, is_active: true,
      specialization_en: c.spec_en, specialization_ar: c.spec_ar, specialization_fr: c.spec_fr,
      bio_en: `${c.spec_en} coach at Demo Gym.`, bio_ar: 'مدرب في نادي ديمو.', bio_fr: `Entraîneur ${c.spec_en} au Demo Gym.`,
      landing_visible: true, landing_status: c.status, has_pending_changes: false, last_published_at: isoTs(now),
    });
    coaches.push(row.id);
  }
  const [cSami, cMaya, cRani, cLea] = coaches;

  // 8. membership plans → exactly 2 active (Monthly + Annual); deactivate extras.
  {
    const { data: plans } = await sb.from('membership_plans').select('id,duration_days').eq('gym_id', gymId);
    for (const p of plans) {
      if (p.duration_days === 30 || p.duration_days === 365) await update('membership_plans', { is_active: true }, 'id', p.id);
      else await update('membership_plans', { is_active: false }, 'id', p.id);
    }
  }
  const planMonthly = (await sb.from('membership_plans').select('id').eq('gym_id', gymId).eq('duration_days', 30).single()).data.id;
  const planAnnual = (await sb.from('membership_plans').select('id').eq('gym_id', gymId).eq('duration_days', 365).single()).data.id;

  // 9. PT packages → a 12-session pack (the "9 of 12 used" story) + a 5-pack shown on
  //    the landing; the scaffold's 1-session pack is retired from the catalog view.
  let pkg12 = (await sb.from('pt_packages').select('id').eq('gym_id', gymId).eq('session_count', 12).maybeSingle()).data?.id;
  if (!pkg12) {
    pkg12 = (await insOne('pt_packages', {
      gym_id: gymId, name_en: '12-Session Strength Block', name_ar: 'باقة 12 جلسة قوة', name_fr: 'Bloc Force 12 Séances',
      session_count: 12, price_usd: 300.0, price_lbp: 0, validity_days: 90, is_active: true, show_on_landing: true,
    })).id;
  } else {
    await update('pt_packages', { is_active: true, show_on_landing: true }, 'id', pkg12);
  }
  {
    const { data: pkgs } = await sb.from('pt_packages').select('id,session_count').eq('gym_id', gymId);
    for (const p of pkgs) {
      if (p.session_count === 5) await update('pt_packages', { is_active: true, show_on_landing: true }, 'id', p.id);
      else if (p.session_count === 12) { /* handled */ }
      else await update('pt_packages', { is_active: false, show_on_landing: false }, 'id', p.id);
    }
  }

  // 10. classes → 6, varied capacity/fee/coach, published; today's board is busy.
  const cls = {};
  const mk = async (key, name_en, name_ar, name_fr, discId, coachId, cap, fee, color, room) => {
    cls[key] = (await insOne('classes', {
      gym_id: gymId, discipline_id: discId, coach_id: coachId,
      name_en, name_ar, name_fr, room, max_capacity: cap, color,
      status: 'scheduled', is_active: true, show_on_landing: true,
      monthly_fee_usd: fee, monthly_fee_lbp: 0,
    })).id;
  };
  await mk('mtBeg', 'Muay Thai Beginner', 'مواي تاي مبتدئ', 'Muay Thaï Débutant', disc.mt, cSami, 16, 40, '#0E7490', 'Main Floor');
  await mk('mtPro', 'Muay Thai Pro', 'مواي تاي محترفين', 'Muay Thaï Pro', disc.mt, cSami, 12, 55, '#0891B2', 'Main Floor');
  await mk('bjjK', 'BJJ Kids', 'جوجيتسو أطفال', 'JJB Enfants', disc.bjj, cMaya, 14, 45, '#155E75', 'Studio B');
  await mk('bjjA', 'BJJ Adults', 'جوجيتسو كبار', 'JJB Adultes', disc.bjj, cMaya, 20, 50, '#0E7490', 'Studio B');
  await mk('box', 'Boxing Fundamentals', 'أساسيات الملاكمة', 'Boxe Bases', disc.mt, cRani, 18, 45, '#0891B2', 'Ring');
  await mk('fit', 'Conditioning', 'لياقة بدنية', 'Conditionnement', disc.fit, cRani, 24, 35, '#155E75', 'Main Floor');

  // schedules — spread across the week; put ≥3 classes on TODAY's weekday so the
  // day / coach board is populated for the capture.
  const nextDow = (n) => (todayDow + n) % 7;
  await insMany('class_schedules', [
    // today (coach board): Muay Thai Beginner (Sami), BJJ Adults (Maya), Boxing (Rani)
    { class_id: cls.mtBeg, day_of_week: todayDow, start_time: '18:00', end_time: '19:30', is_active: true },
    { class_id: cls.bjjA, day_of_week: todayDow, start_time: '17:00', end_time: '18:00', is_active: true },
    { class_id: cls.box, day_of_week: todayDow, start_time: '19:30', end_time: '20:30', is_active: true },
    // rest of week
    { class_id: cls.mtBeg, day_of_week: nextDow(2), start_time: '18:00', end_time: '19:30', is_active: true },
    { class_id: cls.mtBeg, day_of_week: nextDow(4), start_time: '18:00', end_time: '19:30', is_active: true },
    { class_id: cls.mtPro, day_of_week: nextDow(1), start_time: '20:00', end_time: '21:30', is_active: true },
    { class_id: cls.mtPro, day_of_week: nextDow(3), start_time: '20:00', end_time: '21:30', is_active: true },
    { class_id: cls.bjjK, day_of_week: nextDow(1), start_time: '16:00', end_time: '17:00', is_active: true },
    { class_id: cls.bjjK, day_of_week: nextDow(3), start_time: '16:00', end_time: '17:00', is_active: true },
    { class_id: cls.bjjA, day_of_week: nextDow(2), start_time: '17:00', end_time: '18:00', is_active: true },
    { class_id: cls.box, day_of_week: nextDow(4), start_time: '19:30', end_time: '20:30', is_active: true },
    { class_id: cls.fit, day_of_week: nextDow(5), start_time: '11:00', end_time: '12:00', is_active: true },
    { class_id: cls.fit, day_of_week: nextDow(2), start_time: '07:00', end_time: '08:00', is_active: true },
  ]);

  // 11. members (~15) — #1 reuses the student@ login (the portal hero, Karim).
  const students = []; // student.id in member order
  for (let i = 0; i < 15; i++) {
    let profileId;
    if (i === 0) {
      profileId = studentUid;
      await update('profiles', {
        first_name_en: 'Karim', first_name_ar: 'كريم', first_name_fr: 'Karim',
        last_name_en: 'Mourad', last_name_ar: 'مراد', last_name_fr: 'Mourad', phone: '+96170100001', gender: 'male',
      }, 'id', profileId);
    } else {
      profileId = (await insOne('profiles', {
        gym_id: gymId, first_name_en: FN[i], first_name_ar: FN_AR[i], first_name_fr: FN[i],
        last_name_en: LN[i], last_name_ar: LN_AR[i], last_name_fr: LN[i],
        phone: '+96171' + String(200001 + i), gender: GEN[i],
      })).id;
    }
    const stu = await insOne('students', {
      profile_id: profileId, gym_id: gymId,
      emergency_contact_name: `${LN[i]} (parent)`, emergency_contact_phone: '+96171' + String(900001 + i),
      current_belt_rank: BELTS[i], belt_promotion_date: isoDate(d(today, -(60 + i))), join_date: isoDate(d(today, -(90 + i * 5))), is_active: true,
    });
    students.push(stu.id);

    // membership: mostly active; #12 outstanding; #13 expiring soon; #14 lapsed.
    let plan = planMonthly, end = d(today, 20 + i), status = 'active', lapsed = null;
    if (i === 10) { plan = planAnnual; end = d(today, 300); }
    else if (i === 12) { end = d(today, 4); }               // expiring in 4 days
    else if (i === 13) { end = d(today, -12); status = 'lapsed'; lapsed = d(month0, 3); }
    const start = d(end, -(plan === planAnnual ? 365 : 30));
    const mem = await insOne('student_memberships', {
      student_id: stu.id, plan_id: plan, start_date: isoDate(start), end_date: isoDate(end),
      status, auto_renew: true, lapsed_at: lapsed ? isoTs(lapsed) : null,
    });

    // enrollments — varied fill: BJJ Adults FULL, Muay Thai Beginner near-full, rest mid.
    if (status === 'active') {
      const enroll = [];
      if (i < 12) enroll.push(cls.bjjA);            // 12 → toward FULL for a mid-cap class
      if (i < 14) enroll.push(cls.mtBeg);           // ~14/16 near-full
      if (i >= 2 && i < 10) enroll.push(cls.box);   // mid
      if (i >= 3 && i < 9) enroll.push(cls.bjjK);   // mid
      if (i % 3 === 0) enroll.push(cls.fit);        // light
      if (i % 4 === 0) enroll.push(cls.mtPro);      // light
      await insMany('class_enrollments', enroll.map((c) => ({ class_id: c, student_id: stu.id, is_active: true })));
    }

    // money — paid this-month renewals for regulars (revenue); #12 OUTSTANDING; #13 renewal due.
    if (i >= 1 && i <= 9) {
      await issueInvoice({ gym: gymId, student: stu.id, type: 'membership', usd: 50, dueDate: d(month0, 2), notes: 'Membership', receivedBy: ownerUid, paid: true, method: ['cash_usd', 'omt', 'whish'][i % 3], payDate: d(month0, 2) });
    } else if (i === 12) {
      await issueInvoice({ gym: gymId, student: stu.id, type: 'membership', usd: 50, membershipId: mem.id, dueDate: d(today, 4), notes: 'Renewal due this week' });
    } else if (i === 11) {
      // one clear OUTSTANDING balance on the portal hero-adjacent member
      await issueInvoice({ gym: gymId, student: stu.id, type: 'membership', usd: 50, dueDate: d(today, -3), notes: 'Overdue balance', status: 'overdue' });
    }
    // a couple of class-registration payments dated today (today's cash)
    if (i === 2 || i === 4) {
      await issueInvoice({ gym: gymId, student: stu.id, type: 'class_registration', usd: 40, dueDate: today, notes: 'Class registration', receivedBy: ownerUid, paid: true, method: 'cash_usd', payDate: now });
    }
  }

  // 12. member #1 (Karim) — an OUTSTANDING balance on the portal + a PT pack mid-use.
  await issueInvoice({ gym: gymId, student: students[0], type: 'membership', usd: 45, dueDate: d(today, -2), notes: 'Outstanding balance', status: 'overdue' });

  // 13. PT — Karim buys the 12-Session pack, 9 of 12 used (3 remaining); sessions booked.
  await insOne('pt_assignments', {
    student_id: students[0], package_id: pkg12, coach_id: cSami,
    sessions_total: 12, sessions_used: 9, purchased_at: isoTs(d(month0, 1)), expires_at: isoDate(d(today, 45)), is_active: true, status: 'active',
  });
  await issueInvoice({ gym: gymId, student: students[0], type: 'pt_package', usd: 300, dueDate: d(month0, 1), notes: '12-Session Strength Block', receivedBy: ownerUid, paid: true, method: 'whish', payDate: d(month0, 1) });
  // a couple more active packs for the coach's PT roster
  const pkg5 = (await sb.from('pt_packages').select('id').eq('gym_id', gymId).eq('session_count', 5).single()).data.id;
  await insMany('pt_assignments', [
    { student_id: students[2], package_id: pkg5, coach_id: cSami, sessions_total: 5, sessions_used: 2, purchased_at: isoTs(d(month0, 3)), expires_at: isoDate(d(today, 40)), is_active: true, status: 'active' },
    { student_id: students[4], package_id: pkg12, coach_id: cMaya, sessions_total: 12, sessions_used: 4, purchased_at: isoTs(d(month0, 5)), expires_at: isoDate(d(today, 70)), is_active: true, status: 'active' },
  ]);
  await insMany('pt_sessions', [
    { student_id: students[0], coach_id: cSami, package_id: pkg12, scheduled_at: isoTs(new Date(now.getTime() + 3 * 3600e3)), duration_minutes: 60, status: 'scheduled' },
    { student_id: students[2], coach_id: cSami, package_id: pkg5, scheduled_at: isoTs(new Date(now.getTime() + 5 * 3600e3)), duration_minutes: 60, status: 'scheduled' },
    { student_id: students[4], coach_id: cMaya, package_id: pkg12, scheduled_at: isoTs(d(today, 2)), duration_minutes: 60, status: 'scheduled' },
    { student_id: students[0], coach_id: cSami, package_id: pkg12, scheduled_at: isoTs(d(month0, 6)), duration_minutes: 60, status: 'completed' },
  ]);

  // 14. coach availability (so PT slot picker has windows; Sami open today).
  await insMany('coach_availability', [
    { gym_id: gymId, coach_id: cSami, day_of_week: todayDow, start_time: '16:00', end_time: '20:00', is_active: true },
    { gym_id: gymId, coach_id: cSami, day_of_week: nextDow(2), start_time: '16:00', end_time: '20:00', is_active: true },
    { gym_id: gymId, coach_id: cMaya, day_of_week: todayDow, start_time: '10:00', end_time: '15:00', is_active: true },
    { gym_id: gymId, coach_id: cRani, day_of_week: nextDow(1), start_time: '17:00', end_time: '21:00', is_active: true },
  ]);

  // 15. attendance — mark a few present in today's class, leave the rest unmarked.
  await insMany('attendance_records', [
    { class_id: cls.mtBeg, student_id: students[0], attendance_date: isoDate(today), status: 'present', check_in_time: isoTs(new Date(now.getTime() - 5 * 60e3)) },
    { class_id: cls.mtBeg, student_id: students[1], attendance_date: isoDate(today), status: 'present', check_in_time: isoTs(new Date(now.getTime() - 4 * 60e3)) },
  ]);

  // 16. camp — 1 upcoming, published, with a few signups (one paid).
  const camp = await insOne('camps', {
    gym_id: gymId, name_en: 'Summer Fight Camp', name_ar: 'مخيم صيفي', name_fr: 'Camp Été',
    max_capacity: 25, price_usd: 120, price_lbp: 0, status: 'open',
    start_date: isoDate(d(today, 14)), end_date: isoDate(d(today, 18)), show_on_landing: true,
  });
  const campInv = await issueInvoice({ gym: gymId, student: students[5], type: 'camp', usd: 120, dueDate: d(month0, 9), notes: 'Summer Fight Camp', receivedBy: ownerUid, paid: true, method: 'cash_usd', payDate: d(month0, 9) });
  await insMany('camp_registrations', [
    { camp_id: camp.id, student_id: students[5], invoice_id: campInv.id, status: 'confirmed' },
    { camp_id: camp.id, student_id: students[6], status: 'confirmed' },
    { camp_id: camp.id, student_id: students[7], status: 'pending' },
  ]);

  // 17. leads pipeline — rows in each stage (feeds the signups board capture).
  const leadRows = await insMany('leads', [
    { gym_id: gymId, first_name: 'Walid', last_name: 'Nakhle', phone: '+96171000001', source: 'instagram', status: 'new', created_at: isoTs(new Date(now.getTime() - 2 * 3600e3)) },
    { gym_id: gymId, first_name: 'Carla', last_name: 'Maroun', phone: '+96171000002', source: 'walk_in', status: 'new', created_at: isoTs(new Date(now.getTime() - 5 * 3600e3)) },
    { gym_id: gymId, first_name: 'Georges', last_name: 'Saadeh', phone: '+96171000003', source: 'referral', status: 'contacted', created_at: isoTs(d(today, -2)) },
    { gym_id: gymId, first_name: 'Nadine', last_name: 'Khoury', phone: '+96171000004', source: 'instagram', status: 'trial_scheduled', created_at: isoTs(d(today, -3)) },
    { gym_id: gymId, first_name: 'Bilal', last_name: 'Hamdan', phone: '+96171000005', source: 'phone', status: 'lost', created_at: isoTs(d(today, -6)) },
    { gym_id: gymId, first_name: 'Joelle', last_name: 'Aractingi', phone: '+96171000010', source: 'instagram', status: 'converted', converted_student_id: students[1], converted_at: isoTs(d(month0, 3)) },
    { gym_id: gymId, first_name: 'Marc', last_name: 'Doumit', phone: '+96171000011', source: 'walk_in', status: 'converted', converted_student_id: students[3], converted_at: isoTs(d(month0, 7)) },
  ]);
  const nadine = leadRows.find((l) => l.first_name === 'Nadine');
  if (nadine) {
    await insOne('trial_classes', { lead_id: nadine.id, class_id: cls.mtBeg, scheduled_date: isoDate(d(today, 2)), scheduled_time: '18:00', assigned_coach_id: cSami, status: 'scheduled' });
  }

  // 18. landing gallery — reuse the shipped marketing photos so the public page fills.
  await insMany('gym_landing_images', [
    { gym_id: gymId, section: 'gallery', image_url: '/landing/gym-1.jpg', caption_en: 'Main floor', caption_ar: 'الصالة', caption_fr: 'Salle', sort_order: 1, is_active: true },
    { gym_id: gymId, section: 'gallery', image_url: '/landing/gym-2.jpg', caption_en: 'Ring work', caption_ar: 'الحلبة', caption_fr: 'Ring', sort_order: 2, is_active: true },
    { gym_id: gymId, section: 'champions', image_url: '/landing/champions-1.jpg', caption_en: 'National medalist', caption_ar: 'بطل وطني', caption_fr: 'Médaillé', sort_order: 1, is_active: true },
  ]);

  // ─── readiness counts (auditor-verifiable) ─────────────────────────────────────
  const summary = {
    gym_id: gymId, slug: SLUG, brand_color: '#0E7490',
    disciplines: await count('disciplines', 'gym_id', gymId),
    coaches: await count('coaches', 'gym_id', gymId),
    classes: await count('classes', 'gym_id', gymId),
    members: await count('students', 'gym_id', gymId),
    leads: await count('leads', 'gym_id', gymId),
    camps: await count('camps', 'gym_id', gymId),
  };
  const memStudentIds = await ids('students', 'id', 'gym_id', gymId);
  summary.invoices = await count('invoices', 'student_id', memStudentIds);
  summary.pt_assignments = await count('pt_assignments', 'student_id', memStudentIds);
  console.log('[seed-demo-gym] DONE\n' + JSON.stringify(summary, null, 2));
  return summary;
}

main().then(() => process.exit(0)).catch((e) => { console.error('[seed-demo-gym] FAILED:', e.message); process.exit(1); });
