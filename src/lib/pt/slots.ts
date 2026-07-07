import { dateLocale } from '@/lib/utils/locale-format'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * PT slot engine (PT-2) — THE one shared read-side implementation
 * (portal member picker, Member-360 staff picker, diary picker all call this).
 * Bookable slots for an assignment's coach =
 *   availability windows − block overrides (+ extra overrides)
 *   − the coach's class slots (recurring, day_of_week)
 *   − the coach's live PT (scheduled + proposed)
 *   bounded by min-notice / horizon / slot grid / package validity,
 * all computed in the GYM'S TIMEZONE (gyms.timezone — the IA-3 server-clock
 * caveat ends here for booking). The booking RPC re-validates everything in
 * SQL with AT TIME ZONE — this engine is presentation; the RPC is authority.
 */

export type SlotDay = { date: string; label: string; slots: { iso: string; label: string }[] }

/** Local wall-clock parts of a UTC instant in an IANA timezone. */
function localParts(d: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(d)) p[part.type] = part.value
  const dateStr = `${p.year}-${p.month}-${p.day}`
  const minutes = Number(p.hour) * 60 + Number(p.minute)
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { dateStr, minutes, dow }
}

/** UTC instant for a local wall-clock time in tz (2-pass offset correction — DST-safe). */
function utcFromLocal(dateStr: string, minutes: number, tz: string): Date {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  let guess = new Date(`${dateStr}T${hh}:${mm}:00Z`)
  for (let i = 0; i < 2; i++) {
    const got = localParts(guess, tz)
    const wantAbs = Date.parse(`${dateStr}T00:00:00Z`) / 60000 + minutes
    const gotAbs = Date.parse(`${got.dateStr}T00:00:00Z`) / 60000 + got.minutes
    const diff = wantAbs - gotAbs
    if (diff === 0) break
    guess = new Date(guess.getTime() + diff * 60000)
  }
  return guess
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE

export async function getBookableSlots(
  supabase: SupabaseClient<any>,
  assignmentId: string,
  locale = 'en',
): Promise<{ slots: SlotDay[]; coachName?: string; coachId?: string; noAvailability?: boolean; error?: string }> {
  const { data: a } = await supabase
    .from('pt_assignments')
    .select(`id, coach_id, status, sessions_remaining, expires_at,
      pt_packages:package_id (gym_id),
      coaches:coach_id (profiles:profile_id (first_name_en, first_name_ar, first_name_fr))`)
    .eq('id', assignmentId)
    .maybeSingle()
  if (!a || !a.coach_id) return { slots: [], error: 'no_assignment' }
  const gymId = (Array.isArray(a.pt_packages) ? a.pt_packages[0] : a.pt_packages)?.gym_id
  const { data: gym } = await supabase
    .from('gyms')
    .select('timezone, pt_slot_minutes, pt_min_notice_hours, pt_booking_horizon_days, pt_buffer_minutes')
    .eq('id', gymId)
    .single()

  const tz = gym?.timezone || 'Asia/Beirut'
  const slotMin = gym?.pt_slot_minutes ?? 60
  const noticeMs = (gym?.pt_min_notice_hours ?? 12) * 3600_000
  const horizonDays = gym?.pt_booking_horizon_days ?? 14
  const buffer = gym?.pt_buffer_minutes ?? 0

  const now = new Date()
  const horizonEnd = new Date(now.getTime() + horizonDays * 86400_000)
  const validityEnd = a.expires_at ? new Date(a.expires_at) : null

  const [{ data: windows }, { data: overrides }, { data: classSlots }, { data: liveSessions }] = await Promise.all([
    supabase.from('coach_availability')
      .select('day_of_week, start_time, end_time')
      .eq('coach_id', a.coach_id).eq('is_active', true),
    supabase.from('coach_availability_overrides')
      .select('date, kind, start_time, end_time')
      .eq('coach_id', a.coach_id)
      .gte('date', localParts(now, tz).dateStr)
      .lte('date', addDays(localParts(now, tz).dateStr, horizonDays)),
    supabase.from('class_schedules')
      .select('day_of_week, start_time, end_time, is_active, classes:class_id (coach_id, is_active)')
      .eq('is_active', true),
    supabase.from('pt_sessions')
      .select('scheduled_at, duration_minutes, status')
      .eq('coach_id', a.coach_id)
      .in('status', ['scheduled', 'proposed'])
      .gte('scheduled_at', now.toISOString()),
  ])

  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const coachClassSlots = ((classSlots ?? []) as any[]).filter((s) => {
    const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes
    return cls && cls.coach_id === a.coach_id && cls.is_active
  })
  const busy = ((liveSessions ?? []) as any[]).map((s) => {
    const start = new Date(s.scheduled_at).getTime()
    return { start: start - buffer * 60000, end: start + ((s.duration_minutes ?? 60) + buffer) * 60000 }
  })

  const dayFmt = new Intl.DateTimeFormat(dateLocale(locale),
    { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
  const timeFmt = new Intl.DateTimeFormat(dateLocale(locale),
    { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  const todayLocal = localParts(now, tz).dateStr
  const days: SlotDay[] = []
  for (let i = 0; i <= horizonDays; i++) {
    const dateStr = addDays(todayLocal, i)
    const dow = localParts(utcFromLocal(dateStr, 720, tz), tz).dow
    const dayOverrides = ((overrides ?? []) as any[]).filter((o) => o.date === dateStr)
    if (dayOverrides.some((o) => o.kind === 'block' && o.start_time === null)) continue
    const blocks = dayOverrides.filter((o) => o.kind === 'block' && o.start_time !== null)
      .map((o) => ({ s: toMin(o.start_time), e: toMin(o.end_time) }))
    const dayWindows = [
      ...((windows ?? []) as any[]).filter((w) => w.day_of_week === dow)
        .map((w) => ({ s: toMin(w.start_time), e: toMin(w.end_time) })),
      ...dayOverrides.filter((o) => o.kind === 'extra')
        .map((o) => ({ s: toMin(o.start_time), e: toMin(o.end_time) })),
    ]
    if (dayWindows.length === 0) continue

    const daySlots: { iso: string; label: string }[] = []
    const seen = new Set<string>()
    for (const w of dayWindows) {
      for (let m = Math.ceil(w.s / slotMin) * slotMin; m + slotMin <= w.e; m += slotMin) {
        const end = m + slotMin
        if (blocks.some((b) => overlaps(m, end, b.s, b.e))) continue
        if (coachClassSlots.some((c: any) => c.day_of_week === dow && overlaps(m, end, toMin(c.start_time), toMin(c.end_time)))) continue
        const utc = utcFromLocal(dateStr, m, tz)
        if (utc.getTime() < now.getTime() + noticeMs) continue
        if (utc.getTime() > horizonEnd.getTime()) continue
        if (validityEnd && utc.getTime() > validityEnd.getTime()) continue
        if (busy.some((b) => overlaps(utc.getTime(), utc.getTime() + slotMin * 60000, b.start, b.end))) continue
        if (seen.has(utc.toISOString())) continue // overlapping windows dedupe
        seen.add(utc.toISOString())
        daySlots.push({ iso: utc.toISOString(), label: timeFmt.format(utc) })
      }
    }
    if (daySlots.length) days.push({ date: dateStr, label: dayFmt.format(utcFromLocal(dateStr, 720, tz)), slots: daySlots })
  }

  const coachProf: any = (() => {
    const c = Array.isArray(a.coaches) ? a.coaches[0] : a.coaches
    const p = c && (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles)
    return p
  })()
  const coachName = coachProf
    ? (locale === 'ar' ? coachProf.first_name_ar : locale === 'fr' ? coachProf.first_name_fr : coachProf.first_name_en) || coachProf.first_name_en
    : undefined
  // J3 PT-GUARDS: expose the assigned coach + whether they have ZERO active
  // availability windows, so the STAFF booking surface can diagnose an empty
  // slot list ("coach has no published availability → set it") vs a genuinely
  // full calendar. The member surface ignores these (stays generic).
  const noAvailability = ((windows ?? []) as any[]).length === 0
  return { slots: days, coachName, coachId: a.coach_id, noAvailability }
}
