# Contributing

- Use Node 22 (`nvm use`), then `npm ci`.
- Before opening a PR run `npm run verify`; it must pass.
- Use conventional commit messages (`fix:`, `feat:`, `chore:`, `docs:`, `test:`).
- Keep changes small and focused, and add a unit test (`test/*.test.ts`, Vitest) for logic you touch.
- Formatting is enforced by Prettier (`npm run format`), style by ESLint (`npm run lint:fix`).
- Never commit secrets (for example `keys/onesky.json` used by `download-translations`).
- Only Chromium is supported; do not add Safari or Firefox code paths.

## Commits and releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). Releases are
automatic: when a commit lands on `master`, semantic-release picks the next version from the
messages (`fix:` patch, `feat:` minor, `feat!:` / `BREAKING CHANGE:` major; `chore:`, `docs:`,
`ci:`, `test:` do not release), tags it `vX.Y.Z` and publishes the zip as a GitHub Release. Do
not edit the version fields by hand.
