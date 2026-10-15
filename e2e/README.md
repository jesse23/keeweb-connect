# End-to-end tests

Real Chromium (Playwright, `channel: 'chromium'`, new headless mode) loads the production
build from `dist/chrome` and talks to a local mock of the KeeWeb web app.

```
npm run test:e2e                       # builds, then runs the suite
npx playwright test -g "cold connect"  # a subset (run `npm run build` first)
KWC_EXTENSION_DIR=/path/to/other/build npx playwright test
```

- `mock-keeweb.ts` serves a KeeWeb page that speaks the page side of the kwConnect protocol
  (same-origin `postMessage`, tweetnacl boxes, one request at a time, configurable late
  listener), plus login pages (top frame, same-origin iframe, cross-origin iframe).
- The extension is pointed at the mock through the stored `keeWebUrl` option, exactly as the
  options page does. Production URL handling is not touched and there is no test hook in the
  build.
- Commands are fired through `chrome.commands.onCommand.dispatch` in the service worker, the
  event a keyboard shortcut raises. The OS-level key binding itself is not covered.
- Any worker `error`/`warning` output or unhandled rejection fails the test.
- Headless needs no display. If a Linux runner misbehaves, use `xvfb-run -a npm run test:e2e`
  with `headless: false`-style fallbacks as a last resort.
