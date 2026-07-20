import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * DS2-TOKENS §1.1 — the gate's own regression net.
 *
 * The whole value of a lint gate is what it CATCHES and what it correctly LETS PASS.
 * A rule tuned only until the repo went green is a rule nobody has watched fail — and
 * the ways this one could quietly stop working (a `#` in a comment, an anchor href, a
 * hex-validating regex, `//` inside a URL) are exactly the cases that would push
 * someone to loosen it until it caught nothing.
 */
let dir: string;
const run = (target: string) => {
  try {
    execFileSync('node', ['scripts/lint-color-literals.mjs', '--dir', target], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, out: '' };
  } catch (e: any) {
    return { code: e.status as number, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ds2-gate-'));
  mkdirSync(join(dir, 'clean'), { recursive: true });
  mkdirSync(join(dir, 'dirty'), { recursive: true });

  // Everything here is legal and MUST pass — these are the false positives that would
  // discredit the gate.
  writeFileSync(
    join(dir, 'clean', 'ok.tsx'),
    [
      '// prose may say --c-brand-700 defaults to #cd1419',
      '/* and so may a block comment: #FF5A36 */',
      "const anchor = 'https://example.com/#facility';",
      "const deep = 'https://example.com/a//b';",
      'const isHex = /^#[0-9a-fA-F]{6}$/;',
      "const cls = 'bg-[color:var(--shell-accent)] text-primary-700 bg-whatsapp/10';",
      "const tint = 'cat-tint';",
      'export { anchor, deep, isHex, cls, tint };',
    ].join('\n'),
  );

  writeFileSync(
    join(dir, 'dirty', 'bad.tsx'),
    [
      "const a = 'bg-[#25D366]';",
      "const b = '#0e7490';",
      "const c = 'hover:text-[#a81014]';",
      'export { a, b, c };',
    ].join('\n'),
  );
  writeFileSync(join(dir, 'dirty', 'bad.css'), '.x { color: #123456; }');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('DS2-TOKENS §1.1 — the color-literal gate', () => {
  it('passes the legal forms (comment prose, anchor href, hex regex, var reference)', () => {
    const r = run(join(dir, 'clean'));
    expect(r.out).toBe('');
    expect(r.code, 'a false positive here is what makes people disable the rule').toBe(0);
  });

  it('fails on an arbitrary color utility, a bare hex, and a hex in CSS', () => {
    const r = run(join(dir, 'dirty'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('bg-[#25D366]');
    expect(r.out).toContain('#0e7490');
    expect(r.out).toContain('hover:text-[#a81014]');
    expect(r.out).toContain('#123456');
  });

  it('reports the true line number even when comments precede the violation', () => {
    const f = join(dir, 'dirty2');
    mkdirSync(f, { recursive: true });
    writeFileSync(
      join(f, 'x.tsx'),
      ['/* one', ' * two #cd1419', ' */', '', "const bad = '#25D366';", 'export { bad };'].join('\n'),
    );
    const r = run(f);
    expect(r.code).toBe(1);
    // Blanking comments must preserve offsets, or every reported location is a lie.
    expect(r.out).toMatch(/x\.tsx:5/);
  });

  it('reports the real repo as clean — the gate is ON, not merely present', () => {
    expect(run('src').code).toBe(0);
  });
});
