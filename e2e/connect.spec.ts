import { expect, test, VAULT, type Extension } from './fixtures';

/**
 * Connection reliability. Each test presses a real command (the same onCommand listener a
 * keyboard shortcut reaches) on a login page, which forces connect -> handshake -> get-logins.
 * A successful fill proves the whole chain worked.
 */

async function fillOnLogin(ext: Extension, command = 'insert-username-password') {
    const { page, frame } = await ext.openLogin('top');
    await frame.locator('#user').focus();
    await ext.fireCommand(command, page);
    return { page, frame };
}

async function expectFilled(frame: Awaited<ReturnType<typeof fillOnLogin>>['frame']) {
    await expect(frame.locator('#user')).toHaveValue(VAULT.login);
    await expect(frame.locator('#pass')).toHaveValue(VAULT.password);
}

async function expectSingleKeeWebTab(ext: Extension) {
    await expect.poll(() => ext.keeWebPages().length).toBe(1);
}

test.describe('cold connect, no KeeWeb tab', () => {
    for (let i = 1; i <= 10; i++) {
        test(`run ${i} of 10`, async ({ ext }) => {
            expect(ext.keeWebPages()).toHaveLength(0);
            const { frame } = await fillOnLogin(ext);
            await expectFilled(frame);
            await expectSingleKeeWebTab(ext);
            expect(ext.mock.count('change-public-keys')).toBe(1);
            expect(ext.mock.count('get-logins')).toBe(1);
            expect(ext.mock.pageLoads).toBe(1);
        });
    }
});

test('warm tab: loaded KeeWeb tab is reused without reload', async ({ ext }) => {
    await ext.openKeeWeb();
    const { frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    await expectSingleKeeWebTab(ext);
    expect(ext.mock.pageLoads).toBe(1);
});

test('tab still loading: waits for the document, then connects', async ({ ext }) => {
    ext.mock.options.documentDelayMillis = 4000;
    const kw = await ext.context.newPage();
    // do not await: the response is held back, so the tab stays in "loading"
    const navigation = kw.goto(ext.mock.keeWebUrl).catch(() => undefined);
    const { frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    await navigation;
    await expectSingleKeeWebTab(ext);
    expect(ext.mock.pageLoads).toBe(1);
});

test('late listener (7 s): handshake budget outlasts app initialisation', async ({ ext }) => {
    ext.mock.options.startupDelayMillis = 7000;
    const startedAt = Date.now();
    const { frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    const took = Date.now() - startedAt;
    expect(took).toBeGreaterThanOrEqual(6000);
    await expectSingleKeeWebTab(ext);
    // the first document answered in time: no reload retry was needed
    expect(ext.mock.pageLoads).toBe(1);
});

test('tab with a query string is matched, no duplicate tab', async ({ ext }) => {
    await ext.openKeeWeb('/?utm_source=e2e&x=1');
    const { frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    await expectSingleKeeWebTab(ext);
    expect(ext.mock.pageLoads).toBe(1);
});

test('discarded tab is reloaded and connected', async ({ ext }) => {
    await ext.openKeeWeb();
    const { page, frame } = await ext.openLogin('top');
    await frame.locator('#user').focus();
    await page.bringToFront();

    const discarded = await ext.worker.evaluate(async (origin) => {
        const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
        if (tab.id === undefined) {
            return false;
        }
        const result = await chrome.tabs.discard(tab.id);
        return !!result?.discarded;
    }, ext.mock.keeWebOrigin);
    expect(discarded, 'Chromium refused to discard the tab').toBe(true);

    await ext.fireCommand('insert-username-password', page);
    await expectFilled(frame);
    await expect.poll(() => ext.mock.pageLoads).toBe(2);
    await expectSingleKeeWebTab(ext);
});

test('service worker stopped between two commands: reconnects cleanly', async ({ ext }) => {
    const { page, frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    expect(ext.mock.count('change-public-keys')).toBe(1);

    await frame.locator('#user').fill('');
    await frame.locator('#pass').fill('');
    await ext.stopWorker();

    await frame.locator('#user').focus();
    await ext.fireCommand('insert-username-password', page);
    await expectFilled(frame);
    // a fresh worker has no keys: it negotiated again, in the same KeeWeb tab
    expect(ext.mock.count('change-public-keys')).toBe(2);
    await expectSingleKeeWebTab(ext);
    expect(ext.mock.pageLoads).toBe(1);
});

test('KeeWeb tab closed between two commands: reopens and connects', async ({ ext }) => {
    const { page, frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    for (const p of ext.keeWebPages()) {
        await p.close();
    }
    await frame.locator('#user').fill('');
    await frame.locator('#pass').fill('');
    await frame.locator('#user').focus();
    await ext.fireCommand('insert-username-password', page);
    await expectFilled(frame);
    await expectSingleKeeWebTab(ext);
    expect(ext.mock.count('change-public-keys')).toBe(2);
});

test('auto command pressed on the KeeWeb tab does not break a later connection', async ({
    ext
}) => {
    ext.allowLog(/Switch to the page you want to fill/);
    const kw = await ext.openKeeWeb();
    await ext.fireCommand('submit-auto', kw);
    await expect
        .poll(() => ext.workerLogs.some((l) => /Switch to the page you want to fill/.test(l.text)))
        .toBe(true);

    const { frame } = await fillOnLogin(ext);
    await expectFilled(frame);
    await expectSingleKeeWebTab(ext);
});
