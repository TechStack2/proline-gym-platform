// Test stub for the `server-only` package. In unit tests (vitest, node env) we
// exercise the PURE logic of modules whose import chain includes `server-only`
// (e.g. lib/provisioning/invite.ts → lib/audit/log.ts). The real `server-only`
// throws when loaded outside a React Server Component, which aborts the whole
// suite at import time. Aliasing it to this no-op lets those suites load.
//
// Introduced because AUTH-DEPTH (11e1760) added a `recordAudit` (→ audit/log,
// which is `import 'server-only'`) call to invite.ts, breaking invite.test.ts.
export {}
