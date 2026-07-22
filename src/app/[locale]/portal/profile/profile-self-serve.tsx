'use client'

/**
 * MJ-3 Req1/Req4 — member self-serve profile edits.
 *  · DIRECT save (mode 'self' only): contact email + preferred locale. Low-risk,
 *    member-owned; writes straight to profiles (the narrowed self-update, 000095).
 *  · CHANGE REQUEST (both modes): emergency contact, medical notes, date of birth,
 *    phone → request_profile_change → the staff /inbox. Guardians acting for a kid
 *    (mode 'guardian') get the request half only — they cannot RLS-write the kid's
 *    profile, so every field is a request.
 * Phone carries the credential caveat: an approved change updates the contact
 * number only; a credentialed member's sign-in is untouched.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Mail, Languages, Pencil, ShieldAlert, Clock } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { updateContactFields, requestProfileChange, type ProfileChangePayload } from './actions'

type Props = {
  locale: string
  mode: 'self' | 'guardian'
  studentId: string
  credentialed: boolean
  pendingChange: boolean
  initial: {
    contactEmail: string | null
    prefLocale: string | null
    dob: string | null
    phone: string | null
    emergencyName: string | null
    emergencyPhone: string | null
    medical: string | null
  }
}

const LOCALES = ['ar', 'en', 'fr'] as const

export function ProfileSelfServe({ locale, mode, studentId, credentialed, pendingChange, initial }: Props) {
  const t = useTranslations('portalProfile')
  const isRTL = locale === 'ar'
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // ── Direct-save state (self only) ──
  const [email, setEmail] = useState(initial.contactEmail ?? '')
  const [pref, setPref] = useState(initial.prefLocale ?? locale)
  const dirty = mode === 'self' && (email.trim() !== (initial.contactEmail ?? '') || pref !== (initial.prefLocale ?? locale))

  const saveContact = () =>
    startTransition(async () => {
      const res = await updateContactFields({ contactEmail: email, locale: pref })
      if (res.ok) { toast.success(t('savedContact')); router.refresh() }
      else toast.error(res.error === 'not_authenticated' ? t('err') : res.error)
    })

  // ── Change-request modal state ──
  const [open, setOpen] = useState(false)
  const [dob, setDob] = useState(initial.dob ?? '')
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [emName, setEmName] = useState(initial.emergencyName ?? '')
  const [emPhone, setEmPhone] = useState(initial.emergencyPhone ?? '')
  const [medical, setMedical] = useState(initial.medical ?? '')
  const [note, setNote] = useState('')

  const submitChange = () =>
    startTransition(async () => {
      const profiles: NonNullable<ProfileChangePayload['profiles']> = {}
      const students: NonNullable<ProfileChangePayload['students']> = {}
      if (dob !== (initial.dob ?? '')) profiles.date_of_birth = dob
      if (phone.trim() !== (initial.phone ?? '')) profiles.phone = phone.trim()
      if (emName.trim() !== (initial.emergencyName ?? '')) students.emergency_contact_name = emName.trim()
      if (emPhone.trim() !== (initial.emergencyPhone ?? '')) students.emergency_contact_phone = emPhone.trim()
      if (medical.trim() !== (initial.medical ?? '')) students.medical_notes = medical.trim()

      const payload: ProfileChangePayload = {}
      if (Object.keys(profiles).length) payload.profiles = profiles
      if (Object.keys(students).length) payload.students = students
      if (!payload.profiles && !payload.students) { toast.error(t('noChanges')); return }

      const res = await requestProfileChange({ studentId, payload, note: note.trim() || undefined })
      if (res.ok) { toast.success(t('changeSent')); setOpen(false); router.refresh() }
      else toast.error(res.error)
    })

  return (
    <div className={cn('space-y-4', isRTL && 'rtl text-right')}>
      {/* ── DIRECT SAVE (self only) ── */}
      {mode === 'self' && (
        <div data-testid="profile-edit-contact" className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
          <h3 className="text-xs font-semibold uppercase text-gray-500">{t('contactPrefs')}</h3>

          <label className="block space-y-1">
            <span className="flex items-center gap-1.5 text-xs text-gray-500"><Mail className="h-3.5 w-3.5" /> {t('contactEmail')}</span>
            <input data-testid="contact-email-input" type="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder={t('contactEmailPh')}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-500" />
          </label>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs text-gray-500"><Languages className="h-3.5 w-3.5" /> {t('prefLocale')}</span>
            <div className="flex gap-1.5">
              {LOCALES.map((l) => (
                <button key={l} type="button" data-testid={`locale-chip-${l}`} onClick={() => setPref(l)}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium',
                    pref === l ? 'border-primary-700 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300')}>
                  {t(`localeName.${l}`)}
                </button>
              ))}
            </div>
          </div>

          <button type="button" data-testid="save-contact" disabled={!dirty || pending} onClick={saveContact}
            className={cn('w-full rounded-xl py-2 text-sm font-semibold text-primary-foreground',
              !dirty || pending ? 'bg-gray-300' : 'bg-primary-700 hover:bg-primary-800')}>
            {t('save')}
          </button>
        </div>
      )}

      {/* ── CHANGE REQUEST entry ── */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-500">
              <ShieldAlert className="h-3.5 w-3.5" /> {t('safetyDetails')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">{t('safetyHint')}</p>
          </div>
          <button type="button" data-testid="profile-change-open" onClick={() => setOpen(true)}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100">
            <Pencil className="h-3.5 w-3.5" /> {t('requestChange')}
          </button>
        </div>
        {pendingChange && (
          <div data-testid="profile-change-pending" className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <Clock className="h-3.5 w-3.5" /> {t('changePending')}
          </div>
        )}
      </div>

      {/* ── CHANGE REQUEST modal ── */}
      {open && (
        <Dialog
          open={open}
          onOpenChange={(o) => { if (!o && !pending) setOpen(false) }}
          title={t('requestChangeTitle')}
          description={t('requestChangeIntro')}
          variant="center"
          className="max-w-md"
          data-testid="profile-change-modal"
        >
            <div className="space-y-3">
              <Field label={t('dob')}>
                <input data-testid="pc-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </Field>

              <Field label={t('phone')}>
                <input data-testid="pc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+961…" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
                {credentialed && (
                  <p data-testid="credential-caveat" className="mt-1 text-[11px] leading-snug text-gray-400">{t('phoneCredentialCaveat')}</p>
                )}
              </Field>

              <Field label={t('emergencyName')}>
                <input data-testid="pc-emergency-name" value={emName} onChange={(e) => setEmName(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </Field>
              <Field label={t('emergencyPhone')}>
                <input data-testid="pc-emergency-phone" type="tel" inputMode="tel" value={emPhone} onChange={(e) => setEmPhone(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </Field>
              <Field label={t('medical')}>
                <textarea data-testid="pc-medical" value={medical} onChange={(e) => setMedical(e.target.value)} rows={2}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </Field>
              <Field label={t('noteToStaff')}>
                <input data-testid="pc-note" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={t('noteToStaffPh')} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
              </Field>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} disabled={pending}
                  className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  {t('cancel')}
                </button>
                <button type="button" data-testid="profile-change-submit" onClick={submitChange} disabled={pending}
                  className="flex-1 rounded-xl bg-primary-700 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-800 disabled:bg-gray-300">
                  {t('sendRequest')}
                </button>
              </div>
            </div>
        </Dialog>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-gray-500">{label}</span>
      {children}
    </label>
  )
}
