/**
 * AUTH-EASE (R1) — the ONE temporary-password generator, shared by every provisioning
 * site that mints a credential (inviteToPortal, vendor gym onboarding). Field finding
 * [14]: the old temps (`PL-a8Kq#f42!`, `Gp<base64>#7a`) were unreadable over WhatsApp
 * and painful to type on a phone. This mints a FRIENDLY-BUT-STRONG password:
 *
 *   two capitalised short words + two digits  →  e.g. "TigerPanda57"
 *
 * Properties (all unit-asserted):
 *   · ≥ 8 chars (two ≥3-letter words + 2 digits) — the money-path floor (see
 *     PASSWORD_MIN_LENGTH in ../utils/password).
 *   · NO ambiguous glyphs — the digit set is 2–9 (no 0/1) and the wordlist contains
 *     no 'l' and starts no word with a vowel that capitalises to O/I, so the output
 *     never contains l / 1 / O / 0 / I. Nothing to misread when dictated or typed.
 *   · Three character classes (upper + lower + digit) → clears GoTrue's weak-password
 *     heuristic without demanding a symbol the member has to hunt for on a phone keyboard.
 *
 * Server-only (uses node crypto). Kept OUT of ../utils/password (which is imported by
 * client components) so no node builtin leaks into a client bundle.
 */
import crypto from 'crypto'

// Short, pronounceable, dictate-friendly. Curated to contain no 'l' and to start no
// word with o/i, so a single leading capital can never be an O or I. ~50 words → a
// two-word body has thousands of combinations before the digits.
const WORDS = [
  'Tiger', 'Panda', 'Shark', 'Bear', 'Fox', 'Hawk', 'Deer', 'Duck', 'Swan', 'Crab',
  'Frog', 'Goat', 'Puma', 'Bee', 'Ant', 'Cat', 'Dog', 'Bird', 'Fish', 'Horse',
  'Zebra', 'Rhino', 'Bison', 'Moose', 'Raven', 'Robin', 'Finch', 'Heron', 'Cobra', 'Gecko',
  'Viper', 'Mouse', 'Sheep', 'Crane', 'Ferret', 'Badger', 'Monkey', 'Beaver', 'Hornet', 'Spider',
  'Pigeon', 'Sparrow', 'Rabbit', 'Donkey', 'Jaguar', 'Cheetah', 'Panther', 'Wombat', 'Marten', 'Meerkat',
] as const

// 2–9 only — never 0 or 1 (the classic 0/O and 1/l/I confusions).
const DIGITS = '23456789'

function pick<T>(arr: readonly T[]): T {
  return arr[crypto.randomInt(arr.length)]
}

/** A friendly, dictate-safe temporary password: TwoWords + 2 digits, ≥8 chars. */
export function generateTempPassword(): string {
  const w1 = pick(WORDS)
  let w2 = pick(WORDS)
  if (w2 === w1) w2 = pick(WORDS) // a light nudge away from "TigerTiger"
  const d1 = DIGITS[crypto.randomInt(DIGITS.length)]
  const d2 = DIGITS[crypto.randomInt(DIGITS.length)]
  return `${w1}${w2}${d1}${d2}`
}
