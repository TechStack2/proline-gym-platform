'use client'

/**
 * COACH-PHOTO-GATE — the coach stages a NEW headshot as a DRAFT. The downscaled
 * image is uploaded to the PRIVATE `coach-avatar-drafts` bucket (Storage RLS:
 * coach-own / in-gym staff, no anon) at the contract path <gym_id>/<profile_id>.jpg;
 * the path is recorded in coach_profile_pending.avatar_url via saveCoachDraftPhoto.
 * Nothing reaches the public landing until an admin publishes in Coach-360 — the
 * publish action copies the draft → the public `avatars` bucket atomically.
 */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { downscaleImage } from '@/components/shared/avatar-upload'
import { Avatar } from '@/components/shared/avatar'
import { cn } from '@/lib/utils'
import { Camera, Loader2, Clock } from 'lucide-react'
import { saveCoachDraftPhoto } from './actions'

export const DRAFT_BUCKET = 'coach-avatar-drafts'

export function CoachPhotoDraftUpload({
  coachId, gymId, profileId, name, liveUrl, draftUrl, draftPath, locale,
}: {
  coachId: string
  gymId: string
  profileId: string
  name: string
  liveUrl: string | null
  draftUrl: string | null   // signed url of an existing draft (private bucket)
  draftPath: string | null  // object path of an existing draft, for the diff
  locale: string
}) {
  const t = useTranslations('coachEdit')
  const router = useRouter()
  const isRTL = locale === 'ar'
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // show the existing draft (signed) if any, else the live photo; swap to the
  // freshly-picked blob immediately after a successful upload.
  const [preview, setPreview] = useState<string | null>(draftUrl ?? liveUrl ?? null)
  const [path, setPath] = useState<string | null>(draftPath)
  const [hasDraft, setHasDraft] = useState<boolean>(!!draftPath)

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    try {
      const supabase = createClient()
      const blob = await downscaleImage(file)
      const objectPath = `${gymId}/${profileId}.jpg`
      const { error: upErr } = await supabase.storage.from(DRAFT_BUCKET).upload(objectPath, blob, {
        upsert: true, contentType: 'image/jpeg', cacheControl: '3600',
      })
      if (upErr) throw upErr
      const res = await saveCoachDraftPhoto({ coachId, path: objectPath })
      if (!res.ok) throw new Error(res.error)
      setPreview(URL.createObjectURL(blob))
      setPath(objectPath)
      setHasDraft(true)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || t('photoFailed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="mb-6 flex items-center gap-4" data-testid="coach-photo-draft" data-path={path ?? ''} dir={isRTL ? 'rtl' : 'ltr'}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative rounded-2xl"
        aria-label={t('photoChange')}
        data-testid="coach-photo-draft-btn"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={name} data-testid="coach-photo-draft-preview"
            className="h-20 w-20 rounded-2xl object-cover ring-2 ring-primary-500/40" />
        ) : (
          <Avatar url={null} name={name} size="lg" />
        )}
        <span className={cn(
          'absolute -bottom-1 -end-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#cd1419] text-primary-foreground ring-2 ring-white',
          busy && 'opacity-70',
        )}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </span>
      </button>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{t('photoLabel')}</p>
        {hasDraft ? (
          <span data-testid="coach-photo-pending" className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            <Clock className="h-3 w-3" /> {t('photoPending')}
          </span>
        ) : (
          <p className="mt-0.5 text-xs text-gray-500">{t('photoHint')}</p>
        )}
        {error && <p data-testid="coach-photo-error" className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="coach-photo-draft-input"
        onChange={onPick}
      />
    </div>
  )
}
