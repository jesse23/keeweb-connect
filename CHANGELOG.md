# Changelog

All notable changes to this fork are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Changes in upstream
[keeweb/keeweb-connect](https://github.com/keeweb/keeweb-connect) up to v0.3.7 are in
`release-notes.md`.

## [Unreleased]

### Fixed

- Reliable connection to the KeeWeb web app: wait for the tab to load, re-inject the content
  script on every attempt, longer handshake budget, origin-based tab matching.
- Shortcuts: resolve real frame ids instead of `NaN`, suggest four Chrome-safe default keys and
  list every command in the options page.

- A late reply to a handshake ping is no longer taken for the response to the first request.
- The KeeWeb tab is matched by origin and path directory, so another page on the same origin is
  not trusted as KeeWeb.
- `submit-auto` validates the top-level tab address, so fields in `about:blank` iframes work.
- A config change during a connect no longer shows a spurious connection error.
- `npm run package` refuses a development build (`unsafe-eval` CSP, inline source maps).

### Changed

- Web mode is the default connection mode; `nativeMessaging` is an optional permission, requested
  only when desktop mode is selected. `activeTab` was dropped (redundant with `<all_urls>`).
- Context menus are created on install/update, not on every service worker start.
- The manifest description states that this is an unofficial fork.
- Release workflow: upload only for `vX.Y.Z` tags reachable from master, secrets in the
  `chrome-web-store` environment, uploader pinned as a devDependency.

- Chromium only (Chrome and Edge). Safari, Firefox and Apple build targets were removed.
- Tooling: Node 22, TypeScript 5.9, ESLint 9, Prettier 3, Vitest, Playwright end-to-end tests.
- CI (GitHub Actions) and a tag-driven release workflow with optional Chrome Web Store upload.
