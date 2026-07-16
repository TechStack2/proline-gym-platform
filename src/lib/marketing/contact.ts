/**
 * PROLINE-LANDING-DATA — the landing's public contact identity (pure module).
 *
 * CLIENT-SAFE on purpose: LandingNav/LandingFooter are 'use client', so these
 * primitives must not ride in lib/marketing/gym.ts (whose supabase server
 * client pulls next/headers). gym.ts re-exports them for server callers.
 *
 * Resolution: per-gym columns (000078) with the built-in Proline defaults as
 * the template safety net. The Proline DEMO row carries these same values as
 * DATA (000078 §3), so the code defaults only fire for gyms that haven't
 * populated theirs — rendering identically to today.
 */
export type LandingContact = {
  whatsapp: string;                  // wa.me target (digits)
  phone: string;                     // public tel: display
  email: string;                     // public mailto
  instagram: string;                 // handle, no @
  facebook: string;                  // handle
  tiktok: string;                    // LANDING-CUSTOM: handle, no @
  youtube: string;                   // LANDING-CUSTOM: channel handle/path
  instagramFollowers: number | null; // null → the hero follower segment is dropped
  mapLat: number;
  mapLng: number;
};

export const DEFAULT_CONTACT: LandingContact = {
  whatsapp: '96170628601',
  phone: '+961 70 628 601',
  email: 'alifakih998@gmail.com',
  instagram: 'prolinegym.lb',
  facebook: 'prolinegym.lb',
  // Proline has no TikTok/YouTube today → empty → those icons stay hidden (footer
  // byte-identical for the default gym).
  tiktok: '',
  youtube: '',
  instagramFollowers: null,
  mapLat: 33.834,
  mapLng: 35.544,
};

/** Structural param (a LandingGym row or null) — kept structural so this module
 *  never imports the server-side gym module. */
type ContactColumns = {
  contact_whatsapp: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  instagram_handle: string | null;
  instagram_followers: number | null;
  facebook_handle: string | null;
  tiktok_handle?: string | null;
  youtube_handle?: string | null;
  map_lat: number | null;
  map_lng: number | null;
} | null | undefined;

// TENANT-CONTENT: the honest fallback for a NON-default gym that hasn't filled its own
// contact — empty, never the Proline founder's email/phone/socials/map. The landing chrome
// hides whatever is empty (no pretense of another gym's identity).
export const EMPTY_CONTACT: LandingContact = {
  whatsapp: '', phone: '', email: '', instagram: '', facebook: '', tiktok: '', youtube: '',
  instagramFollowers: null, mapLat: 0, mapLng: 0,
};

export function resolveLandingContact(gym: ContactColumns, isDefault: boolean = false): LandingContact {
  // The built-in Proline defaults are the honest identity ONLY for the default gym; every
  // other tenant falls back to EMPTY so alifakih998@gmail.com / the Proline phone / socials
  // / map coords never leak onto another gym's landing.
  const d = isDefault ? DEFAULT_CONTACT : EMPTY_CONTACT;
  return {
    whatsapp: (gym?.contact_whatsapp || d.whatsapp).replace(/\D/g, ''),
    phone: gym?.contact_phone || d.phone,
    email: gym?.contact_email || d.email,
    instagram: (gym?.instagram_handle || d.instagram).replace(/^@/, ''),
    facebook: (gym?.facebook_handle || d.facebook).replace(/^@/, ''),
    tiktok: (gym?.tiktok_handle || d.tiktok).replace(/^@/, ''),
    youtube: (gym?.youtube_handle || d.youtube).replace(/^@/, ''),
    instagramFollowers: gym?.instagram_followers ?? null,
    mapLat: gym?.map_lat != null ? Number(gym.map_lat) : d.mapLat,
    mapLng: gym?.map_lng != null ? Number(gym.map_lng) : d.mapLng,
  };
}
