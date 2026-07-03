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
  map_lat: number | null;
  map_lng: number | null;
} | null | undefined;

export function resolveLandingContact(gym: ContactColumns): LandingContact {
  return {
    whatsapp: (gym?.contact_whatsapp || DEFAULT_CONTACT.whatsapp).replace(/\D/g, ''),
    phone: gym?.contact_phone || DEFAULT_CONTACT.phone,
    email: gym?.contact_email || DEFAULT_CONTACT.email,
    instagram: (gym?.instagram_handle || DEFAULT_CONTACT.instagram).replace(/^@/, ''),
    facebook: (gym?.facebook_handle || DEFAULT_CONTACT.facebook).replace(/^@/, ''),
    instagramFollowers: gym?.instagram_followers ?? null,
    mapLat: gym?.map_lat != null ? Number(gym.map_lat) : DEFAULT_CONTACT.mapLat,
    mapLng: gym?.map_lng != null ? Number(gym.map_lng) : DEFAULT_CONTACT.mapLng,
  };
}
