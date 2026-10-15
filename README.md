# KeeWeb Connect (unofficial Chrome fork)

A Chrome (Manifest V3) extension that fills passwords from [KeeWeb](https://keeweb.info) into web pages.
This is an **unofficial fork** of [keeweb/keeweb-connect](https://github.com/keeweb/keeweb-connect),
focused on one goal: reliably connecting to the KeeWeb **web app** (`https://app.keeweb.info/`,
`https://beta.keeweb.info/`) and having every keyboard shortcut work in Chrome.
It targets Chromium browsers only (Chrome, and Edge which accepts the same package).
It is not affiliated with or endorsed by the KeeWeb project.

## Why this fork exists

Upstream is effectively unmaintained and its Manifest V3 port has bugs that hit Chrome users:

1. The KeeWeb tab connection injects its content script once and never retries, so it connects only some of the time.
2. The handshake budget (about 5 s) is shorter than a cold KeeWeb web app load.
3. Tab matching is an exact URL match, so a tab with a query string or other path is missed and duplicated.
4. Only 1 of the 9 commands has a default shortcut, and the others are not shown in options until bound.
5. Every non-auto command fails once bound, because the frame id computed in `commands.ts` is `NaN`.

Details and the fix plan are tracked in the commits on the `chrome-fixes` branch.

## Install (unpacked)

1. Build it (see [Development](#development)) or take a release zip and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select `dist/chrome`.

## Configure web mode

1. Open the extension options page (right-click the toolbar icon, **Options**).
2. In **Connection**, choose the web app mode and enter your KeeWeb URL,
   for example `https://app.keeweb.info/` or `https://beta.keeweb.info/`.
3. In KeeWeb settings, make sure browser integration is enabled.

The extension opens (or reuses) a tab with that URL and talks to it through the page.

## Keyboard shortcuts

Only `submit-auto` has a suggested default. Assign the rest at `chrome://extensions/shortcuts`
(find KeeWeb Connect, click the pencil next to a command, press the key combination).

| Command                    | Action                         | Default shortcut              |
| -------------------------- | ------------------------------ | ----------------------------- |
| `submit-auto`              | Submit the form automatically  | `Ctrl+Shift+U` (Cmd on macOS) |
| `submit-username-password` | Submit username and password   | unbound                       |
| `insert-username-password` | Insert username and password   | unbound                       |
| `submit-username`          | Submit username                | unbound                       |
| `insert-username`          | Insert username                | unbound                       |
| `submit-password`          | Submit password                | unbound                       |
| `insert-password`          | Insert password                | unbound                       |
| `insert-otp`               | Insert one-time code           | unbound                       |
| `insert-other`             | Choose another field in KeeWeb | unbound                       |

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run verify      # format:check, lint, typecheck, test:unit, build
```

| Script                   | What it does                                                      |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run build`          | Production build into `dist/chrome`                               |
| `npm run build:dev`      | Development build (inline source maps, `unsafe-eval`)             |
| `npm run watch`          | Development build, rebuild on change                              |
| `npm run typecheck`      | `tsc --noEmit`                                                    |
| `npm run lint`           | ESLint 9 (flat config, type-checked rules)                        |
| `npm run lint:fix`       | ESLint with autofix                                               |
| `npm run format`         | Prettier write                                                    |
| `npm run format:check`   | Prettier check                                                    |
| `npm test` / `test:unit` | Vitest unit tests                                                 |
| `npm run package`        | Zip `dist/chrome` into `dist/keeweb-connect-chrome-<version>.zip` |
| `npm run clean`          | Remove `dist/`                                                    |
| `npm run verify`         | All of the checks plus build                                      |

Layout: `src/background` (service worker, protocol, transports), `src/content` (content scripts),
`src/options` (Preact options page), `src/common`, `_locales`, `manifest.json`.

### Native messaging

The native-messaging transport is kept but web mode is the supported path. Still present:
`native-messaging-host/` (C++ host sources, built separately with CMake, see its `Makefile`),
`packages/native-messaging-host/` and `native-manifest.json` (host manifest template).
The npm scripts do not build them.

## Protocol

KeeWeb implements [keepassxc-protocol](https://github.com/keepassxreboot/keepassxc-browser/blob/develop/keepassxc-protocol.md)
with modifications listed in [docs/keeweb-connect-protocol.md](docs/keeweb-connect-protocol.md).

## Relation to upstream, license

Based on [keeweb/keeweb-connect](https://github.com/keeweb/keeweb-connect) by Antelle and contributors.
Licensed under the [MIT License](LICENSE); the original copyright notice is retained.
The Safari, Firefox and Xcode parts of upstream were removed in this fork.
