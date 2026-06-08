/**
 * Render a notification's title/body for display.
 *
 * Producer-layer notifications (Cycle 5) store i18n KEYS + a `params` JSON and
 * are rendered here via the next-intl `notifications` namespace translator.
 * Legacy rows that stored rendered per-locale strings (pre-000015) fall back to
 * their `*_ar/_en/_fr` columns.
 */
export type RenderableNotification = {
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, unknown> | null;
  title_ar?: string | null;
  title_en?: string | null;
  title_fr?: string | null;
  body_ar?: string | null;
  body_en?: string | null;
  body_fr?: string | null;
};

type NotificationsTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function renderNotification(
  n: RenderableNotification,
  t: NotificationsTranslator,
  locale: string,
): { title: string; body: string } {
  const legacyTitle =
    locale === 'ar'
      ? n.title_ar || n.title_en
      : locale === 'fr'
        ? n.title_fr || n.title_en
        : n.title_en;
  const legacyBody =
    locale === 'ar'
      ? n.body_ar || n.body_en
      : locale === 'fr'
        ? n.body_fr || n.body_en
        : n.body_en;

  const values = (n.params ?? {}) as Record<string, string | number>;

  return {
    title: n.title_key ? t(n.title_key, values) : legacyTitle || '',
    body: n.body_key ? t(n.body_key, values) : legacyBody || '',
  };
}
