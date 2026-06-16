import { test, expect } from '@playwright/test'

/**
 * AX-3 regression guard: a NESTED layout must never render its own
 * `<html>`/`<body>` — only the locale ROOT layout may. `auth/layout.tsx` used to
 * (since AX-1), emitting a second `<html><body>` inside the first → invalid DOM
 * → hydration error → `NotFoundError: removeChild` on the auth→app navigation
 * (every login, in dev where StrictMode double-commits). A prod build tolerates
 * the bad DOM at RUNTIME, so the runtime crash is invisible to this prod CI —
 * we therefore assert at the SERVER-HTML level: exactly one <html>/<body>.
 */
test('auth route renders a single <html>/<body> (no nested-layout duplication)', async ({ request }) => {
  const res = await request.get('/en/auth/login')
  expect(res.ok(), '/en/auth/login responds 2xx').toBeTruthy()
  const html = await res.text()
  expect((html.match(/<html[\s>]/g) || []).length, 'exactly one <html> element in the document').toBe(1)
  expect((html.match(/<body[\s>]/g) || []).length, 'exactly one <body> element in the document').toBe(1)
})
