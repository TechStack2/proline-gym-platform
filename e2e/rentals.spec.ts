import { test, expect } from '@playwright/test';
import { ROLES, E2E_GYM_SLUG } from './roles';

/**
 * RENTALS smoke (QUICK-WINS #3). The rentals page's bookings query was un-scoped
 * and unbounded; it is now scoped to THIS gym's rentals (rental_bookings has no
 * gym_id — it joins rentals(rental_id)) and bounded to most-recent 200. This seeds
 * one own-gym rental + external coach + a booking in the current (UTC) week via the
 * service role and asserts the page renders that own-gym data through the scoped
 * query — a phantom-column regression (e.g. a bare .eq('gym_id')) would silently
 * empty it and the booked cell would vanish. Full cleanup afterwards.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function svc(path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY as string, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`svc ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

test.describe('RENTALS', () => {
  test.use({ storageState: ROLES.owner.storage });

  test('renders the run gym\'s own rental + booking through the gym-scoped query', async ({ page }) => {
    test.setTimeout(60_000);
    if (!URL || !KEY) throw new Error('RENTALS needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL');

    const gym = (await svc(`gyms?slug=eq.${E2E_GYM_SLUG}&select=id`))[0];
    const cleanup: Array<[string, string]> = [];
    try {
      const rentalName = `E2E Rental ${Date.now().toString().slice(-6)}`;
      const rental = (await svc('rentals', 'POST', {
        gym_id: gym.id, name_ar: rentalName, name_en: rentalName, name_fr: rentalName,
        hourly_rate_usd: 10, status: 'available',
      }))[0];
      cleanup.push(['rentals', rental.id]);

      const coach = (await svc('external_coaches', 'POST', {
        gym_id: gym.id, first_name_en: 'Ext', last_name_en: 'Coach', phone: '+9611999888',
      }))[0];
      cleanup.push(['external_coaches', coach.id]);

      // A booking on TODAY (UTC) — the calendar defaults to the current week (weekOffset 0)
      // and matches cells by the UTC date prefix (isBooked → start_time.startsWith(ds)).
      const day = new Date().toISOString().slice(0, 10);
      const booking = (await svc('rental_bookings', 'POST', {
        rental_id: rental.id, external_coach_id: coach.id,
        start_time: `${day}T12:00:00.000Z`, end_time: `${day}T13:00:00.000Z`,
        total_amount_usd: 10, status: 'confirmed',
      }))[0];
      cleanup.push(['rental_bookings', booking.id]);

      await page.goto('/en/rentals', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(rentalName).first(), 'own-gym rental renders').toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('✓').first(), 'own-gym booking renders a booked (✓) cell').toBeVisible();
    } finally {
      for (const [table, id] of cleanup.reverse()) {
        await svc(`${table}?id=eq.${id}`, 'DELETE').catch(() => {});
      }
    }
  });
});
