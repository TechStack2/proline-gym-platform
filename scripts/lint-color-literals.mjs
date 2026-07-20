#!/usr/bin/env node
/**
 * DS2-TOKENS §1.1 — THE LITERAL BAN, ENFORCED.
 *
 * A color literal outside the token files is how the design system leaks: the audit's
 * root cause #1. Every `bg-[#25D366]` is a hue that no token owns, that dark mode
 * cannot flip, that a white-label gym cannot rebrand, and that nobody can find again.
 * This gate fails the build on one.
 *
 * WHAT IT FLAGS
 *   1. An arbitrary-value color utility carrying a literal:
 *        text-[#cd1419]  bg-[#25D366]/10  ring-[rgb(1,2,3)]  hover:border-[#abc]
 *      `bg-[color:var(--shell-accent)]` is FINE — a var reference is the sanctioned form.
 *   2. A raw hex in TS/TSX code — the ones that reach className/style at runtime.
 *   3. A raw hex in a CSS file that is not a token file.
 *
 * WHAT IT DOES NOT FLAG
 *   · Comments. Prose explaining that --c-brand-700 defaults to #cd1419 is documentation,
 *     and the whole point of a token is that you can write down what it equals.
 *   · A hex-VALIDATING regex (`/^#[0-9a-fA-F]{6}$/`) — the `#` is followed by `[`.
 *   · An anchor href (`#facility`) — a match must be a complete 3/4/6/8-digit token.
 *
 * ADDING AN EXCEPTION: put the file in ALLOWLIST below WITH A REASON. A reason that is
 * really "I did not get to it yet" must say so with a wave marker (TODO(W2-portal-coach),
 * TODO(W3-landing-brand)) so the debt is visible and scheduled rather than laundered
 * into a permanent exemption.
 *
 * Wired into `npm run lint`. Run standalone: node scripts/lint-color-literals.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = process.cwd();
// `--dir <path>` points the scanner somewhere else. Used by the gate's OWN test
// (scripts/lint-color-literals.test.ts) to run it against fixtures — a gate nobody
// has watched fail is not a gate.
const dirArg = process.argv.indexOf('--dir');
const SCAN_DIRS = dirArg >= 0 ? [process.argv[dirArg + 1]] : ['src'];
const EXTS = ['.ts', '.tsx', '.css'];

// ─── The allowlist. Every entry is a FILE plus WHY it is exempt. ──────────────
const ALLOWLIST = {
  // ── The token layer itself. Somewhere has to hold the literals; this is where.
  'src/app/globals.css':
    'THE token file — every channel var is defined here by definition (§1.1 allowlist).',
  'tailwind.config.ts':
    'The token→utility map. Binds families to the channel vars; the few remaining literals ' +
    'are the palettes not yet var-backed (accent/gold/belt).',
  'src/lib/theme/brand.ts':
    'WL-THEME: computes a per-gym brand ramp FROM a #hex the owner picked. Parsing and ' +
    'generating hex is its entire job.',

  // ── Values that are not CSS at all: they are strings a browser/OS API consumes.
  'src/lib/seo.ts':
    'THEME_COLOR is a <meta name="theme-color"> value — consumed by the OS chrome, not by ' +
    'any stylesheet. A CSS var is not a legal value there.',
  'src/lib/pwa/identity.ts':
    'Web App Manifest theme_color/background_color. The manifest is JSON read by the OS ' +
    'installer; it cannot reference a CSS custom property.',
  'src/lib/marketing/gym.ts':
    'DEFAULT_BRAND_COLOR mirrors the gyms.brand_color DB default. It is a data value that ' +
    'the theme layer turns into tokens — the one hex that must exist before tokens do.',
  'src/app/[locale]/(dashboard)/layout.tsx':
    'generateViewport theme-color (OS status bar). Same reason as seo.ts.',
  'src/app/[locale]/(dashboard)/settings/_components/gym-settings.tsx':
    'The brand-color PICKER: an <input type="color"> value plus the hex-validating regex. ' +
    'It edits the brand literal, so it must speak hex.',
  'src/components/shared/signature-pad.tsx':
    'canvas 2D ctx.strokeStyle — the Canvas API takes a color string, not a CSS var.',

  // ── Scheduled debt. Real violations, deliberately not fixed in THIS slice.
  'src/app/[locale]/portal/layout.tsx':
    'TODO(W2-portal-coach): PWA theme-color for the member shell. Lane A owns portal ' +
    'layout files during W2a; editing here would collide. Revisit when W2a merges.',
  'src/app/[locale]/coach/layout.tsx':
    'TODO(W2-portal-coach): PWA theme-color for the coach shell. Same collision reason.',
  'src/app/praxella-landing.css':
    'TODO(W3-landing-brand): the vendor marketing surface ships its own scoped --px-* ' +
    'design system (all literals are token DEFINITIONS inside .px-landing, not escape ' +
    'hatches). Folding it into the app token layer is the W3 landing pass.',
};

// Tests may name a color: asserting "the branded gym renders #0e7490" requires saying it.
const ALLOW_PATTERNS = [/\.test\.tsx?$/];

// ─── Detection ───────────────────────────────────────────────────────────────
// A complete 3/4/6/8-digit hex token. The trailing guard is what keeps `#facility`
// (an anchor href) and `#[0-9a-fA-F]{6}` (a validating regex) from matching.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/;
const COLOR_PROPS =
  'text|bg|border|from|via|to|ring|shadow|fill|stroke|outline|decoration|accent|caret|divide|placeholder';
const ARBITRARY = new RegExp(
  `(?:^|[\\s"'\`])(?:[a-z0-9-]+:)*(?:${COLOR_PROPS})-\\[[^\\]]*` +
    `(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\\(\\s*[\\d.]+)[^\\]]*\\]`,
  'i',
);

/**
 * Blank out comments while PRESERVING every byte offset and newline, so reported line
 * numbers stay true. String bodies are kept — a literal inside a string is exactly what
 * we are hunting. Walking the source (rather than regexing it) is what stops `//` inside
 * `'https://…'` from blanking the rest of a real line.
 */
function stripComments(src, isCss) {
  const n = src.length;
  const out = new Array(n);
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) out[k] = src[k] === '\n' ? '\n' : ' ';
  };
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) { j++; break; }
        if (c !== '`' && src[j] === '\n') break; // unterminated — bail at EOL
        j++;
      }
      for (let k = i; k < Math.min(j, n); k++) out[k] = src[k];
      i = j;
      continue;
    }
    if (c === '/' && c2 === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (!isCss && c === '/' && c2 === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    out[i] = c;
    i++;
  }
  return out.join('');
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (EXTS.some((e) => name.endsWith(e))) acc.push(full);
  }
  return acc;
}

// ALLOWLIST INTEGRITY. An entry naming a file that no longer exists is silent rot:
// it reads as a live exemption, so nobody re-examines it, and it quietly stops covering
// anything. Fail on it — an exemption must always point at something real.
const stale = Object.keys(ALLOWLIST).filter((f) => !existsSync(resolve(ROOT, f)));
if (stale.length && dirArg < 0) {
  console.error(
    '\n\u2716 DS2-TOKENS \u00a71.1 \u2014 the allowlist names files that no longer exist:\n' +
      stale.map((f) => `  ${f}`).join('\n') +
      '\n\n  Delete the entry, or fix the path. A stale exemption covers nothing.\n',
  );
  process.exit(1);
}

const violations = [];
const exempted = [];

// resolve() (not join) so an absolute --dir is honoured rather than glued onto ROOT.
for (const file of SCAN_DIRS.flatMap((d) => walk(resolve(ROOT, d)))) {
  const rel = relative(ROOT, file).split(sep).join('/');
  if (ALLOWLIST[rel]) { exempted.push(rel); continue; }
  if (ALLOW_PATTERNS.some((p) => p.test(rel))) continue;

  const isCss = rel.endsWith('.css');
  const code = stripComments(readFileSync(file, 'utf8'), isCss);
  code.split('\n').forEach((line, idx) => {
    if (!line.trim()) return;
    const arb = line.match(ARBITRARY);
    if (arb) {
      violations.push({ rel, line: idx + 1, kind: 'arbitrary color utility', text: arb[0].trim() });
      return; // one finding per line is enough to fail it
    }
    const hex = line.match(HEX);
    if (hex) violations.push({ rel, line: idx + 1, kind: 'raw color literal', text: hex[0] });
  });
}

if (violations.length) {
  console.error('\n✖ DS2-TOKENS §1.1 — color literals found outside the token files:\n');
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}\n      ${v.kind}: ${v.text}`);
  }
  console.error(
    `\n  ${violations.length} violation(s).\n\n` +
      '  Use a token, not a literal. If the hue is worth using it is worth naming:\n' +
      '    · a role token   — primary-* / danger-* / success|warning|info|neutral-* / cat-1…8\n' +
      '    · a named hue    — whatsapp / flare (see globals.css "NAMED EXCEPTIONS")\n' +
      '    · a var          — bg-[color:var(--shell-accent)]\n' +
      '  A genuine exception goes in ALLOWLIST in this file, WITH A REASON.\n',
  );
  process.exit(1);
}

console.log(
  `✔ DS2-TOKENS §1.1 — no color literals outside the token files ` +
    `(${Object.keys(ALLOWLIST).length} allowlisted, each with a documented reason; ` +
    `${exempted.length} of them under the scanned tree).`,
);
