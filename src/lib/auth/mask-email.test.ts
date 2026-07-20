import { describe, it, expect } from 'vitest';
import { maskEmail } from './mask-email';

describe('OWNER-RESET — maskEmail', () => {
  it('keeps first + last of a long local part, and the whole domain', () => {
    // The domain must survive: it is what distinguishes the right account from a
    // same-named one elsewhere, which is the whole point of the confirmation step.
    expect(maskEmail('owner@proline.lb')).toBe('o***r@proline.lb');
    expect(maskEmail('sami.haddad@gmail.com')).toBe('s***d@gmail.com');
  });

  it('does not print most of a SHORT local part back out', () => {
    // first+last of a 3-char local is 2 of 3 characters — masking in name only.
    expect(maskEmail('abc@x.io')).toBe('a***@x.io');
    expect(maskEmail('ab@x.io')).toBe('a***@x.io');
    expect(maskEmail('a@x.io')).toBe('a***@x.io');
  });

  it('reveals nothing when the input is not a parseable address', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@leading.lb')).toBe('***');
    expect(maskEmail('trailing@')).toBe('***');
  });

  it('handles absent input without throwing', () => {
    expect(maskEmail(null)).toBe('—');
    expect(maskEmail(undefined)).toBe('—');
    expect(maskEmail('   ')).toBe('—');
  });

  it('masks the local part of a synthetic member login but keeps it identifiable', () => {
    // The platform's own login shape (invite.ts): m-<uuid>@members.proline.lb.
    const out = maskEmail('m-3f2504e0-4f89-11d3-9a0c-0305e82c3301@members.proline.lb');
    expect(out).toBe('m***1@members.proline.lb');
    expect(out, 'the uuid body must not survive masking').not.toContain('4f89');
  });

  it('never leaks the full local part for any realistic address', () => {
    for (const e of ['owner@proline.lb', 'a.very.long.address@corp.example.com', 'x1@y.z']) {
      const local = e.slice(0, e.lastIndexOf('@'));
      if (local.length > 2) expect(maskEmail(e)).not.toContain(local);
    }
  });
});
