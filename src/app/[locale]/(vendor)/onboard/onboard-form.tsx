'use client';

import { useState } from 'react';
import { onboardGym, type OnboardResult } from './actions';

/**
 * Minimal super-admin onboarding form (single page — a polished multi-step UI is a
 * follow-up, do not gold-plate). English-only labels: this is an internal vendor
 * tool, not a customer surface. Calls the onboardGym server action, which
 * independently RE-ASSERTS the platform-admin gate before any write.
 */
export function OnboardForm({ locale }: { locale: string }) {
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setResult(
      await onboardGym({
        gymNameEn: String(formData.get('gymNameEn') || ''),
        gymNameAr: String(formData.get('gymNameAr') || ''),
        slug: String(formData.get('slug') || ''),
        ownerEmail: String(formData.get('ownerEmail') || ''),
        ownerFirstEn: String(formData.get('ownerFirstEn') || ''),
        ownerLastEn: String(formData.get('ownerLastEn') || ''),
      }),
    );
    setPending(false);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1 data-testid="onboard-title" className="text-2xl font-bold text-secondary-900">
        Onboard a new gym
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Super-admin only. Creates the gym, its owner login, and a starter catalog.
      </p>

      {result?.ok ? (
        <div data-testid="onboard-success" className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-semibold text-green-800">Gym created ✓</p>
          <p className="mt-2 text-gray-700">
            Owner login: <span data-testid="onboard-owner-email" className="font-mono">{result.ownerEmail}</span>
          </p>
          <p className="text-gray-700">
            Temp password: <span data-testid="onboard-temp-pw" className="font-mono">{result.tempPassword}</span>
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Share these with the owner — they must change the password on first login.
          </p>
        </div>
      ) : (
        <form action={onSubmit} className="mt-6 space-y-4" data-testid="onboard-form">
          {result && !result.ok && (
            <p data-testid="onboard-error" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              Error: {result.error}
            </p>
          )}
          <Field name="gymNameEn" label="Gym name (English)" />
          <Field name="gymNameAr" label="Gym name (Arabic)" dir="rtl" />
          <Field name="slug" label="Slug (a–z, 0–9, hyphens)" />
          <Field name="ownerEmail" label="Owner email" type="email" />
          <Field name="ownerFirstEn" label="Owner first name" />
          <Field name="ownerLastEn" label="Owner last name" />
          <button
            type="submit"
            disabled={pending}
            data-testid="onboard-submit"
            className="w-full rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create gym'}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({ name, label, type = 'text', dir }: { name: string; label: string; type?: string; dir?: 'rtl' | 'ltr' }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        name={name}
        type={type}
        required
        dir={dir}
        data-testid={`onboard-${name}`}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
      />
    </label>
  );
}
