import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: the production build (dist/chrome) in a real Chromium, against a local
 * mock of the KeeWeb web app. Run `npm run build` first (the npm script does it).
 */
export default defineConfig({
    testDir: 'e2e',
    testMatch: '**/*.spec.ts',
    outputDir: 'e2e/.results',
    timeout: 120_000,
    expect: { timeout: 45_000 },
    // each test launches its own browser profile; keep a flake visible instead of retrying it
    retries: 0,
    workers: process.env.CI ? 2 : 3,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? [['list'], ['github']] : [['list']]
});
