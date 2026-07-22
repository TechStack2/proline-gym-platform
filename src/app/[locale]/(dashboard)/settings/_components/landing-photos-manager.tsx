'use client';

/**
 * M2-C GALLERY — "Public page photos" manager, inside the Manage index's "Your gym
 * & public page" section. Owner/head_coach curate the three per-gym landing image
 * sections (Champions / Gallery / Affiliations) that the public landing renders
 * (get_landing_images, 000079). Upload reuses the J5 hero pattern: downscale →
 * upload to the public `gym-landing` bucket at `<gymId>/<file>` → store the RELATIVE
 * path (AVATAR-PATHS); the landing resolves it via storagePublicUrl. List / reorder /
 * delete / caption (ar·en·fr) the gym-scoped rows through the admin-write RLS (000079).
 * Dark + RTL safe. Module-scope sub-components (no in-render component definitions).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { downscaleImage } from '@/components/shared/avatar-upload';
import { storagePublicUrl } from '@/lib/storage/public-url';
import { useCaughtErrorText } from '@/lib/errors/use-error-text';
import { cn } from '@/lib/utils';
import { ImagePlus, ArrowUp, ArrowDown, Trash2, Loader2, Trophy, Images, BadgeCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Section = 'champions' | 'gallery' | 'affiliations';
const SECTIONS: Section[] = ['champions', 'gallery', 'affiliations'];
const SECTION_ICON: Record<Section, LucideIcon> = { champions: Trophy, gallery: Images, affiliations: BadgeCheck };
const LANGS = [
  { code: 'en', label: 'EN', dir: 'ltr' as const },
  { code: 'ar', label: 'ع', dir: 'rtl' as const },
  { code: 'fr', label: 'FR', dir: 'ltr' as const },
];

type Row = {
  id: string;
  section: Section;
  image_url: string;
  caption_ar: string | null;
  caption_en: string | null;
  caption_fr: string | null;
  sort_order: number;
  updated_at: string;
};

export function LandingPhotosManager({ gymId, locale }: { gymId: string; locale: string }) {
  const t = useTranslations('settings.landingPhotos');
  const supabase = createClient();
  const isRTL = locale === 'ar';
  const errCaught = useCaughtErrorText();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function reload() {
    const { data } = await supabase
      .from('gym_landing_images')
      .select('id, section, image_url, caption_ar, caption_en, caption_fr, sort_order, updated_at')
      .eq('gym_id', gymId)
      .order('section', { ascending: true })
      .order('sort_order', { ascending: true });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(section: Section, file: File) {
    if (busy) return;
    setBusy(`upload-${section}`);
    setError('');
    try {
      const blob = await downscaleImage(file, 1280, 0.82);
      // RELATIVE path (AVATAR-PATHS): `<gymId>/<section>-<uuid>.jpg`; the folder must
      // equal the caller's gym for the storage insert policy (000079).
      const path = `${gymId}/${section}-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage.from('gym-landing').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
        cacheControl: '3600',
      });
      if (upErr) throw upErr;
      const maxOrder = Math.max(-1, ...rows.filter((r) => r.section === section).map((r) => r.sort_order));
      const { error: insErr } = await supabase
        .from('gym_landing_images')
        .insert({ gym_id: gymId, section, image_url: path, sort_order: maxOrder + 1, is_active: true });
      if (insErr) throw insErr;
      await reload();
    } catch (e) {
      setError(errCaught(e));
    }
    setBusy(null);
  }

  async function saveCaption(row: Row, field: 'caption_ar' | 'caption_en' | 'caption_fr', value: string) {
    const next = value.trim() || null;
    if ((row[field] ?? null) === next) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [field]: next } : r))); // optimistic
    const { error: upErr } = await supabase.from('gym_landing_images').update({ [field]: next }).eq('id', row.id);
    if (upErr) setError(errCaught(upErr));
  }

  async function move(row: Row, dir: -1 | 1) {
    if (busy) return;
    const peers = rows.filter((r) => r.section === row.section);
    const idx = peers.findIndex((r) => r.id === row.id);
    const swap = peers[idx + dir];
    if (!swap) return;
    setBusy(`move-${row.id}`);
    // Swap the two sort_orders (two small updates; the section index re-sorts on reload).
    await supabase.from('gym_landing_images').update({ sort_order: swap.sort_order }).eq('id', row.id);
    await supabase.from('gym_landing_images').update({ sort_order: row.sort_order }).eq('id', swap.id);
    await reload();
    setBusy(null);
  }

  async function remove(row: Row) {
    if (busy) return;
    setBusy(`del-${row.id}`);
    const { error: delErr } = await supabase.from('gym_landing_images').delete().eq('id', row.id);
    if (delErr) {
      setError(errCaught(delErr));
    } else {
      // Best-effort: drop the now-orphaned storage object (only if it's a bucket path).
      if (row.image_url && !row.image_url.startsWith('/') && !row.image_url.startsWith('http')) {
        await supabase.storage.from('gym-landing').remove([row.image_url]).catch(() => {});
      }
      await reload();
    }
    setBusy(null);
  }

  return (
    <section
      data-testid="landing-photos-manager"
      dir={isRTL ? 'rtl' : 'ltr'}
      className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5"
    >
      <h3 className={cn('text-sm font-bold text-gray-900', isRTL && 'font-arabic')}>{t('title')}</h3>
      <p className={cn('mt-0.5 text-xs text-gray-500', isRTL && 'font-arabic')}>{t('desc')}</p>

      {error && <div className="tint-danger mt-3 rounded-xl p-3 text-sm">{error}</div>}

      <div className="mt-4 space-y-5">
        {SECTIONS.map((section) => (
          <SectionBlock
            key={section}
            section={section}
            rows={rows.filter((r) => r.section === section)}
            loading={loading}
            busy={busy}
            isRTL={isRTL}
            t={t}
            onUpload={(file) => upload(section, file)}
            onCaption={saveCaption}
            onMove={move}
            onRemove={remove}
          />
        ))}
      </div>
    </section>
  );
}

type TFn = ReturnType<typeof useTranslations>;

/** One section (Champions / Gallery / Affiliations): its images + an upload control. */
function SectionBlock({
  section,
  rows,
  loading,
  busy,
  isRTL,
  t,
  onUpload,
  onCaption,
  onMove,
  onRemove,
}: {
  section: Section;
  rows: Row[];
  loading: boolean;
  busy: string | null;
  isRTL: boolean;
  t: TFn;
  onUpload: (file: File) => void;
  onCaption: (row: Row, field: 'caption_ar' | 'caption_en' | 'caption_fr', value: string) => void;
  onMove: (row: Row, dir: -1 | 1) => void;
  onRemove: (row: Row) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const Icon = SECTION_ICON[section];
  const uploading = busy === `upload-${section}`;

  return (
    <div data-testid={`lp-section-${section}`} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold text-gray-800', isRTL && 'font-arabic')}>
          <Icon className="h-4 w-4 text-primary-600" /> {t(`sections.${section}` as Parameters<TFn>[0])}
        </span>
        <button
          type="button"
          data-testid={`lp-add-${section}`}
          disabled={!!busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {t('add')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid={`lp-upload-${section}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
      </div>

      {loading ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-gray-100" />
      ) : rows.length === 0 ? (
        <p data-testid={`lp-empty-${section}`} className={cn('mt-3 text-xs text-gray-400', isRTL && 'font-arabic')}>
          {t('empty')}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row, i) => (
            <ImageRow
              key={row.id}
              row={row}
              first={i === 0}
              last={i === rows.length - 1}
              busy={busy}
              isRTL={isRTL}
              t={t}
              onCaption={onCaption}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** One image row: thumbnail + ar·en·fr captions + reorder + delete. */
function ImageRow({
  row,
  first,
  last,
  busy,
  isRTL,
  t,
  onCaption,
  onMove,
  onRemove,
}: {
  row: Row;
  first: boolean;
  last: boolean;
  busy: string | null;
  isRTL: boolean;
  t: TFn;
  onCaption: (row: Row, field: 'caption_ar' | 'caption_en' | 'caption_fr', value: string) => void;
  onMove: (row: Row, dir: -1 | 1) => void;
  onRemove: (row: Row) => void;
}) {
  const busyThis = busy === `move-${row.id}` || busy === `del-${row.id}`;
  return (
    <li data-testid="lp-row" data-id={row.id} data-section={row.section} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={storagePublicUrl('gym-landing', row.image_url, row.updated_at)}
        alt=""
        className="h-14 w-14 shrink-0 rounded-md object-cover ring-1 ring-gray-200"
      />
      <div className="grid min-w-0 flex-1 grid-cols-3 gap-1.5">
        {LANGS.map((l) => (
          <input
            key={l.code}
            data-testid={`lp-caption-${l.code}`}
            dir={l.dir}
            defaultValue={(row[`caption_${l.code}` as keyof Row] as string) ?? ''}
            onBlur={(e) => onCaption(row, `caption_${l.code}` as 'caption_ar' | 'caption_en' | 'caption_fr', e.target.value)}
            placeholder={`${t('caption')} ${l.label}`}
            className="min-w-0 rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none"
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" data-testid="lp-up" aria-label={t('moveUp')} disabled={first || !!busy} onClick={() => onMove(row, -1)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">
          <ArrowUp className="h-4 w-4" />
        </button>
        <button type="button" data-testid="lp-down" aria-label={t('moveDown')} disabled={last || !!busy} onClick={() => onMove(row, 1)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">
          <ArrowDown className="h-4 w-4" />
        </button>
        <button type="button" data-testid="lp-delete" aria-label={t('delete')} disabled={!!busy} onClick={() => onRemove(row)} className="rounded-md p-1.5 text-gray-400 hover:bg-danger-500/10 hover:text-red-600 disabled:opacity-30">
          {busyThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}
