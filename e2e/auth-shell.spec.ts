import { test, expect } from '@playwright/test'

/**
 * AX-3 regression guard: a NESTED layout must never render its own
 * `<html>`/`<body>` — only the locale ROOT layout may. `auth/layout.tsx` used to
 * (since AX-1), emitting a second `<html><body>` inside the first → invalid DOM
 * → hydration error → `NotFoundError: removeChild` on the auth→app navigation.
 * A prod build tolerates the bad DOM at RUNTIME, so the runtime crash is
 * invisible to this prod CI — we assert at the SERVER-HTML level instead.
 *
 * We read the RAW response body via the browser navigation (`response.text()`),
 * NOT a bare APIRequestContext fetch: the browser request path is the one the
 * app actually serves (and is warm post-`setup`), and `response.text()` returns
 * the server HTML BEFORE the browser drops a nested `<html>/<body>` — so the
 * duplication is still detectable.
 */
test('auth route renders a single <html>/<body> (no nested-layout duplication)', async ({ page }) => {
  const res = await page.goto('/en/auth/login')
  expect(res, 'navigation produced a response').toBeTruthy()
  expect(res!.status(), '/en/auth/login responds OK (<400)').toBeLessThan(400)
  const html = await res!.text()
  expect((html.match(/<html[\s>]/gi) || []).length, 'exactly one <html> element in the document').toBe(1)
  expect((html.match(/<body[\s>]/gi) || []).length, 'exactly one <body> element in the document').toBe(1)
})
