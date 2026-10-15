# Keyboard shortcuts

Suggested defaults (Chrome applies them on a fresh install or when a command is new, and leaves a
key unbound if it conflicts with another extension or a browser shortcut):

| Command                    | Windows / Linux | macOS             |
| -------------------------- | --------------- | ----------------- |
| Submit the form (auto)     | Ctrl+Shift+U    | Command+Shift+U   |
| Submit username+password   | Ctrl+Shift+Y    | Command+Shift+Y   |
| Submit password            | Ctrl+Shift+K    | Command+Shift+K   |
| One-time codes (OTP)       | Ctrl+Shift+L    | Command+Shift+L   |

All other commands are unbound by default. Bind them at `chrome://extensions/shortcuts`, or use
the button on the extension options page, which also lists every command with its current key.

Notes:

- Chrome honors at most 4 suggested keys per extension, so only the four most useful are set.
- Option+Shift+letter is avoided on macOS because it types dead-key characters.
- No command uses the `global` scope. Chrome limits suggested global keys to Ctrl+Shift+[0-9],
  and autofill acts on the focused page, so OS-wide shortcuts add little. Shortcuts work while a
  browser window is focused.
- Failures are never silent: the toolbar icon shows a "!" badge with a tooltip reason for a few
  seconds, and the reason is logged in the service worker console with the `[KeeWeb Connect]` prefix.
- Unverified: Edge may already use Ctrl+Shift+U (Read aloud) and Ctrl+Shift+Y (Collections), and
  on Linux Ctrl+Shift+U is the IME unicode-entry combo. Where a suggested key conflicts, Chrome
  leaves it unbound; the options page lists such commands as "not set", so bind another key there.
