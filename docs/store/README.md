# Publishing to the Chrome Web Store

Runbook for the human owner. Everything that needs an account, a browser or a decision is here;
the build, packaging, GitHub Release and upload are automated by `.github/workflows/release.yml`.

## 0. Name and branding (read first)

This is an **unofficial fork**. The store listing must not suggest it is the official KeeWeb
extension or endorsed by the KeeWeb project, or review can reject it for impersonation.

- Keep the name `KeeWeb Connect (unofficial Chrome fork)` (it is already the manifest `name`),
  or pick a clearly distinct name. Do not use the KeeWeb logo as the extension's own mark
  without checking the icons in `icons/`; if in doubt, replace them.
- First line of the detailed description says it is an unofficial fork and links upstream.
- Keep the MIT license and the upstream attribution (`LICENSE`, README, `release-notes.md`).
- Do not claim the extension stores or manages passwords. It only relays them from the user's
  own KeeWeb.

## 1. One-time account setup

1. Register a Chrome Web Store developer account at
   <https://chrome.google.com/webstore/devconsole> (one-time $5 fee, 2-step verification required).
2. Optional: create a group publisher if the item should not live under a personal account.
3. In the dashboard open **Account** and note the **Publisher ID**.

## 2. Create the item (first upload is manual)

1. `npm ci && npm run build && npm run package`, which produces
   `dist/keeweb-connect-chrome-<version>.zip` (or take the zip from a GitHub Release).
2. Dashboard, **Add new item**, upload the zip. The item gets its permanent **extension ID**
   (32 letters); this is `CHROME_EXTENSION_ID` below.
3. Fill the sections below, then **Submit for review**. Later versions go through the workflow.

### Store listing

- **Category:** Productivity. **Language:** English.
- **Summary (max 132 chars):** the store takes it from the manifest `description`
  (`__MSG_description__`, so `_locales/*/messages.json`), it is not a separate field. It already
  says it is an unofficial fork:
  `Unofficial fork: autofill logins from your own KeeWeb web app, with working keyboard shortcuts.`
- **Detailed description:**

  ```text
  Unofficial community fork of KeeWeb Connect. Not affiliated with or endorsed by the KeeWeb project.

  KeeWeb Connect fills usernames, passwords and one-time codes from your KeeWeb password
  database into the web page you are on, using keyboard shortcuts or the context menu.

  - Connects to the KeeWeb web app you already use (https://app.keeweb.info/,
    https://beta.keeweb.info/ or your own KeeWeb URL, ideally on its own origin).
  - Keyboard shortcuts for auto-fill, username, password, OTP and other fields. Assign
    them at chrome://extensions/shortcuts.
  - Nothing is sent anywhere except between this extension and your own KeeWeb. There are no
    accounts, analytics or servers operated by the author.

  Requires KeeWeb with browser integration enabled. Source code (MIT):
  https://github.com/jesse23/keeweb-connect. Based on https://github.com/keeweb/keeweb-connect.
  ```

- **Single purpose statement:**
  `Fill login credentials stored in the user's own KeeWeb password manager into the web page the user is currently on.`
- **Screenshots (1280x800 or 640x400, 1 to 5, PNG/JPEG, no transparency):** prepare
  (a) a login form being filled after pressing the shortcut,
  (b) the options page with the KeeWeb URL and the shortcut list,
  (c) the context menu on a login field,
  (d) the KeeWeb app asking to allow the connection.
  Small promo tile 440x280 is required; marquee 1400x560 is optional. Blur any real data.
- **Support URL:** `https://github.com/jesse23/keeweb-connect/issues`.
  **Homepage:** `https://github.com/jesse23/keeweb-connect`.

## 3. Privacy tab

### Permission justifications (paste into the dashboard)

| Permission                          | Justification                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host_permissions: <all_urls>`      | The extension fills login forms on whichever site the user chooses, so it must be able to inject its form-filling script into the page and its frames, and to talk to the user's KeeWeb tab. It does not read or transmit page content elsewhere. |
| `scripting`                         | Injects the content script that finds the login fields and writes the credential, and the script that talks to the KeeWeb web app tab.                                                                                                         |
| `tabs`                              | Finds an already open KeeWeb tab, opens one if needed, and reads the active tab's URL to ask KeeWeb for matching entries.                                                                                                                      |
| `webNavigation`                     | Lists the frames of the active page to find the frame containing the login field (login forms often sit in iframes).                                                                                                                           |
| `contextMenus`                      | Adds "fill username / password / OTP" entries to the right-click menu on form fields.                                                                                                                                                          |
| `storage`                           | Stores the user's settings locally (KeeWeb URL, web or desktop mode).                                                                                                                                                                          |
| `optional_permissions: nativeMessaging` | Not granted at install. Requested only if the user selects the optional desktop mode; the desktop host must also trust this extension's ID (see README). Not used in web mode.                                                            |
| Remote code                         | **No.** All code ships in the package; CSP is `default-src 'self'`.                                                                                                                                                                            |

### Data usage disclosures

- Check **Authentication information** and **Website content** as handled data (credentials are
  passed from KeeWeb to the page; page URLs are sent to KeeWeb to find matching entries).
- Certify: not sold to third parties, not used for unrelated purposes, not used for
  creditworthiness or lending.

### Privacy policy (host this text at a stable URL, for example a GitHub Pages page or the repo's `docs/store/PRIVACY.md` raw/blob URL, and enter the URL)

```text
KeeWeb Connect (unofficial Chrome fork) privacy policy

KeeWeb Connect does not collect, store, sell or transmit personal data to the author or to any
third party. It has no servers, accounts, analytics or tracking.

To work, the extension exchanges messages with the user's own KeeWeb: the page address of the
tab being filled is sent to KeeWeb to find matching entries, and the chosen username, password
or one-time code is returned and written into the page. This exchange happens only between the
browser, the user's KeeWeb web app tab (or the locally installed KeeWeb desktop app) and the
page being filled. Messages are encrypted with a key pair generated by the extension. KeeWeb
and the password database are operated by the user, not by this extension.

The extension stores its settings (KeeWeb URL and connection mode) locally in the browser
through the storage permission. It does not store passwords.

Source code: https://github.com/jesse23/keeweb-connect
Contact: https://github.com/jesse23/keeweb-connect/issues
```

(Verify before publishing: the "key pair generated by the extension" sentence matches the
tweetnacl handshake in `src/background/`, and that statement stays true after changes.)

## 4. Automating uploads

The workflow uses [`chrome-webstore-upload-cli`](https://github.com/fregante/chrome-webstore-upload-cli)
pinned at an exact version, which calls the Chrome Web Store API.

### Create OAuth credentials and the refresh token

1. Google Cloud Console, create a project, enable **Chrome Web Store API**.
2. **OAuth consent screen**: user type External, add yourself as a test user, then publish the
   app to "In production" (otherwise refresh tokens expire after 7 days).
3. **Credentials**, create an **OAuth client ID** of type **Desktop app**. Copy the client ID and
   secret.
4. Get a refresh token (scope `https://www.googleapis.com/auth/chromewebstore`). Easiest is the
   CLI's own helper flow documented in the
   [chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys) guide,
   or manually: open
   `https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&redirect_uri=http://localhost&client_id=<CLIENT_ID>&access_type=offline&prompt=consent`,
   approve, copy the `code` from the redirect URL, then
   `curl -d "client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&code=<CODE>&grant_type=authorization_code&redirect_uri=http://localhost" https://oauth2.googleapis.com/token`
   and keep the `refresh_token`.
5. Use the same Google account that owns the store item.

### Repository settings (GitHub, Settings)

Repository **secrets** (Settings, Secrets and variables, Actions):

| Secret                 | Value                             |
| ---------------------- | --------------------------------- |
| `CHROME_EXTENSION_ID`  | The 32-letter item ID             |
| `CHROME_PUBLISHER_ID`  | Publisher ID from the dashboard   |
| `CHROME_CLIENT_ID`     | OAuth client ID                   |
| `CHROME_CLIENT_SECRET` | OAuth client secret               |
| `CHROME_REFRESH_TOKEN` | Refresh token from step 4         |

Create them as **environment secrets** of the `chrome-web-store` environment, not repository
secrets, so only the upload job can read them.

**Environment:** create an environment named `chrome-web-store`, add yourself under
**Required reviewers**, and under **Deployment branches and tags** allow only the `master`
branch. Every upload then waits for your approval and cannot run for any other branch.

**Variable:** set the repository variable `CWS_UPLOAD_ENABLED` to `true` to enable the upload job
(it is skipped otherwise, and only runs after a release was created on `master`).

### Releasing

Releases are automatic, as in webtty: semantic-release reads the conventional commits that land
on `master`.

1. Merge a pull request whose squash/merge commit message is conventional: `fix:` makes a patch,
   `feat:` a minor, `feat!:` or a `BREAKING CHANGE:` footer a major. `chore:`, `docs:`, `ci:`
   and similar do not release.
2. The **Release** workflow verifies, runs the e2e suite, then semantic-release stamps
   `package.json`, `package-lock.json` and `manifest.json`, builds and zips the extension,
   commits `chore(release): vX.Y.Z [skip ci]`, tags `vX.Y.Z` and creates the GitHub Release with
   the zip.
3. If the repository variable `CWS_UPLOAD_ENABLED` is `true`, the store job then waits for your
   approval and uploads the zip as a **draft** (also submitting for review when `CWS_PUBLISH` is
   `true`). Otherwise open the dashboard, upload the zip from the GitHub Release and press
   **Submit for review**.

The store requires every upload to have a higher version than the last one; semantic-release
only ever increases it.

## 5. Can `<all_urls>` be narrowed? Honest evaluation

**Short answer: probably partly, but not proven, so the manifest is unchanged. Follow-up.**

Where host access is actually used (code audit):

- Injecting `content-page.js` into the active tab and all of its frames
  (`src/background/commands.ts`, `chrome.scripting.executeScript`, plus
  `webNavigation.getAllFrames`). Which site is not known in advance, so a static allow-list is
  impossible.
- Injecting `content-keeweb.js` into the KeeWeb tab and `tabs.query({url})` matching
  (`src/background/transport/transport-browser-tab.ts`). One known origin (the configured URL).

Options:

1. **Move `<all_urls>` to `optional_host_permissions`, rely on `activeTab`.** A keyboard
   shortcut, a context-menu click or a toolbar click grants `activeTab` for the current tab, which
   covers the page being filled. The KeeWeb origin would be requested at runtime; the options page
   already does this for `tabs` plus the KeeWeb URL (`askKeeWebTabPermission`). This would remove
   the scary "read and change all your data on all websites" install warning.
2. **Keep `<all_urls>` required** (current). Simple and robust.

Why it is not applied here:

- **Cross-origin iframes.** Autofill of login forms inside a different-origin iframe injects into
  frames of the active tab. `activeTab` is documented as granting the tab, but whether it covers
  cross-origin subframes for `scripting.executeScript({allFrames: true})` is not something this
  session could confirm, and it is exactly the case the e2e suite covers.
- **Not provable in e2e.** Runtime permission prompts (`permissions.request`) need a real user
  gesture and a browser dialog, which Playwright cannot drive on the extension, so the suite
  cannot demonstrate that autofill still works after the change. The rule for this repo is to
  change `manifest.json` only with that proof.
- **UX regression risk.** Without `activeTab` on a given tab (for example a navigation after the
  shortcut) injection fails silently, and the web-mode connection depends on the KeeWeb origin
  grant being present before any shortcut is used.
- **Review.** The store reviewer accepts `<all_urls>` for password-manager style autofill with the
  justification above; broad host permissions can lengthen review but are a known pattern.

`activeTab` and `tabs` are redundant or minimal while `<all_urls>` is required: `activeTab` was
dropped from the manifest; `tabs` stays because the code checks it in `permissions.contains`.
If `<all_urls>` is narrowed, revisit `tabs` first.

Recommended follow-up, as its own change: switch to option 1 behind a manual test on Chrome with
cross-origin iframes (a real user gesture), add an e2e that grants the optional origin through
`context.grantPermissions`/`chrome.permissions` where possible, and only then edit
`manifest.json`.

## 6. Checklist before each submission

- [ ] `npm run verify` and `npm run test:e2e` pass.
- [ ] The released version (GitHub Release tag) is higher than the one in the store.
- [ ] Listing text, screenshots and privacy policy still match the behaviour.
