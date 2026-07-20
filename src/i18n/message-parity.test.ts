import { describe, it, expect } from 'vitest';
import ar from './messages/ar.json';
import en from './messages/en.json';
import fr from './messages/fr.json';

/**
 * DS2-FMT §2.7 — the always-on half of the missing-key gate.
 *
 * DA-5 shipped `MISSING_MESSAGE: pt.unlinked_sessions` to production, where it
 * threw on every coach/pt load and printed the raw key above the sessions list.
 * The other half of the gate is the runtime `onError` throw in
 * src/i18n/request.ts (strict mode); this sweep is what runs on every commit and
 * catches the far more common shape — a key added to one locale only.
 */
type Tree = Record<string, unknown>;

function keyPaths(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? keyPaths(value as Tree, path)
      : [path];
  });
}

const LOCALES = { en, ar, fr } as Record<string, Tree>;

function blankPaths(node: Tree, prefix = '', out: string[] = []): string[] {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      blankPaths(value as Tree, path, out);
    } else if (typeof value === 'string' && value.trim() === '') {
      out.push(path);
    }
  }
  return out;
}

describe('i18n message parity', () => {
  const keys = Object.fromEntries(
    Object.entries(LOCALES).map(([locale, tree]) => [locale, new Set(keyPaths(tree))]),
  );

  for (const locale of ['ar', 'fr']) {
    it(`${locale} has every key en has`, () => {
      const missing = [...keys.en].filter((k) => !keys[locale].has(k));
      expect(missing, `missing in ${locale}.json`).toEqual([]);
    });

    it(`${locale} has no key en lacks`, () => {
      const extra = [...keys[locale]].filter((k) => !keys.en.has(k));
      expect(extra, `orphaned in ${locale}.json (no en counterpart)`).toEqual([]);
    });
  }

  it('no message is blank in SOME locales only', () => {
    // A key blank in every locale is a deliberate empty string (e.g. the
    // enterprise plan's absent "/month" suffix). A key blank in one or two is
    // an untranslated stub that renders as nothing on that locale's screen.
    const blanks = Object.fromEntries(
      Object.entries(LOCALES).map(([locale, tree]) => [locale, new Set(blankPaths(tree))]),
    );
    const partial = [...new Set(Object.values(blanks).flatMap((s) => [...s]))].filter(
      (path) => !Object.values(blanks).every((s) => s.has(path)),
    );
    expect(partial, 'blank in some locales but not all').toEqual([]);
  });
});
