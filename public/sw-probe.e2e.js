// PWA-UPDATE e2e fixture — NOT used by the app in production.
// Registering this byte-different worker at scope '/' creates a genuine WAITING
// worker behind the active one (skipWaiting:false), which drives the app's real
// update-detection path (updatefound → installed-with-a-controller) so the "New
// version — Refresh" prompt can be asserted deterministically — without depending
// on the test runner intercepting the browser's service-worker script fetch. It
// does nothing and is never promoted during the test.
self.addEventListener('install', () => {});
