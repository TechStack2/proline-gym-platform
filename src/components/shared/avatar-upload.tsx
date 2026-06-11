'use client'

/**
 * Avatar uploader (ADM-2). Client-side downscale to ≤512px (JPEG ~0.85 ≈
 * ≤200KB for photos), upsert to the public `avatars` bucket at the contract
 * path <gym_id>/<profile_id>.jpg (Storage RLS: owner-or-staff, path-scoped),
 * then set profiles.avatar_url to the public URL with a cache-busting version.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from './avatar'
import { cn } from '@/lib/utils'
import { Camera, Loader2 } from 'lucide-react'

export async function downscaleImage(file: File, maxDim = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality),
  )
}

/** Uploads + sets profiles.avatar_url; returns the public URL. */
export async function uploadAvatar(gymId: string, profileId: string, file: File): Promise<string> {
  const supabase = createClient()
  const blob = await downscaleImage(file)
  const path = `${gymId}/${profileId}.jpg`
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (upErr) throw upErr
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${data.publicUrl}?v=${Date.now()}` // replace-in-place needs a buster
  const { error: profErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profileId)
  if (profErr) throw profErr
  return url
}

export function AvatarUpload({
  gymId, profileId, name, currentUrl, size = 'lg', locale,
}: {
  gymId: string
  profileId: string
  name: string
  currentUrl?: string | null
  size?: 'md' | 'lg'
  locale: string
}) {
  const t = useTranslations('avatar')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [url, setUrl] = useState(currentUrl ?? null)

  // The (dashboard) double-shell mounts this component twice; only the instance
  // whose <input> received the file updates its local state. After
  // router.refresh() the server delivers the new currentUrl — re-sync so every
  // mounted instance (incl. the visible one) shows the uploaded photo.
  useEffect(() => {
    if (currentUrl) setUrl(currentUrl)
  }, [currentUrl])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const newUrl = await uploadAvatar(gymId, profileId, file)
      setUrl(newUrl)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || t('failed'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-1" data-testid="avatar-upload">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="group relative rounded-full"
        aria-label={t('change')}
        data-testid="avatar-upload-btn"
      >
        <Avatar url={url} name={name} size={size} />
        <span className={cn(
          'absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#cd1419] text-white ring-2 ring-white',
          busy && 'opacity-70',
        )}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="avatar-file-input"
        onChange={onPick}
      />
      {error && <span data-testid="avatar-error" className="max-w-[10rem] text-center text-[10px] text-red-600">{error}</span>}
    </div>
  )
}
