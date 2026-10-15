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

### Changed

- Chromium only (Chrome and Edge). Safari, Firefox and Apple build targets were removed.
- Tooling: Node 22, TypeScript 5.9, ESLint 9, Prettier 3, Vitest, Playwright end-to-end tests.
- CI (GitHub Actions) and a tag-driven release workflow with optional Chrome Web Store upload.
