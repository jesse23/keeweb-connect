import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    chromium,
    expect,
    test as base,
    type BrowserContext,
    type ConsoleMessage,
    type Frame,
    type Page,
    type Worker
} from '@playwright/test';
import { MockKeeWeb } from './mock-keeweb';

export { expect };
export { VAULT } from './mock-keeweb';

// KWC_EXTENSION_DIR lets the suite run against another build (e.g. to prove it catches a bug)
const EXTENSION_DIR = path.resolve(
    process.env.KWC_EXTENSION_DIR ?? path.join(__dirname, '..', 'dist', 'chrome')
);

export type FrameMode = 'top' | 'same-origin' | 'cross-origin';

interface LogEntry {
    type: string;
    text: string;
}

/** Worker log lines that are normal operation and never count as a failure. */
const NOISE = [
    /^%c(->|<-) KW/,
    /^Connecting to KeeWeb/,
    /^Connected to KeeWeb/,
    /^KeeWeb disconnected/
];

export class Extension {
    readonly id: string;
    private readonly _logs: LogEntry[] = [];
    private readonly _errors: string[] = [];
    private _allowed: RegExp[] = [];
    private _wakePage: Page | undefined;

    constructor(
        readonly context: BrowserContext,
        readonly mock: MockKeeWeb,
        private _worker: Worker
    ) {
        this.id = new URL(_worker.url()).host;
        context.on('console', (msg) => this.onConsole(msg));
        context.on('weberror', (e) => this._errors.push(`unhandled: ${e.error().message}`));
    }

    static async launch(mock: MockKeeWeb): Promise<Extension> {
        if (!fs.existsSync(path.join(EXTENSION_DIR, 'manifest.json'))) {
            throw new Error(`No build in ${EXTENSION_DIR}: run "npm run build" first`);
        }
        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwc-e2e-'));
        // channel 'chromium' is the full Chromium in "new headless" mode, which (unlike the
        // old headless shell) can load extensions and needs no display. On a Linux runner
        // without a display server use `xvfb-run -a npm run test:e2e` if headless misbehaves.
        const context = await chromium.launchPersistentContext(userDataDir, {
            channel: 'chromium',
            headless: true,
            args: [
                `--disable-extensions-except=${EXTENSION_DIR}`,
                `--load-extension=${EXTENSION_DIR}`
            ]
        });
        let [worker] = context.serviceWorkers();
        worker ??= await context.waitForEvent('serviceworker');
        const ext = new Extension(context, mock, worker);
        ext._userDataDir = userDataDir;
        await ext.configure();
        await ext.closeStrayPages();
        return ext;
    }

    private _userDataDir = '';

    /** Web mode against the local mock. Production URL handling is untouched: the URL is just
     *  the value of the `keeWebUrl` option, exactly as the options page would store it. */
    private async configure(): Promise<void> {
        const url = this.mock.keeWebUrl;
        await this._worker.evaluate(
            (keeWebUrl) => chrome.storage.local.set({ useNativeApp: false, keeWebUrl }),
            url
        );
        // let backend.storageChanged run to completion before the first connect
        await this._worker.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    }

    /** the onInstalled handler opens the options page; close it so tab order is predictable */
    async closeStrayPages(): Promise<void> {
        const isOptions = (p: Page) => p.url().includes(`${this.id}/pages/options.html`);
        try {
            await expect
                .poll(() => this.context.pages().some(isOptions), { timeout: 5000 })
                .toBe(true);
        } catch {
            // not opened (e.g. a reused profile): nothing to close
        }
        for (const p of this.context.pages().filter(isOptions)) {
            await p.close();
        }
    }

    // ---- logs -------------------------------------------------------------------------

    private onConsole(msg: ConsoleMessage): void {
        const worker = msg.worker();
        if (!worker || new URL(worker.url()).host !== this.id) {
            return;
        }
        this._logs.push({ type: msg.type(), text: msg.text() });
    }

    /** Declare worker log lines that this test expects (they will not fail it). */
    allowLog(...patterns: RegExp[]): void {
        this._allowed.push(...patterns);
    }

    get workerLogs(): readonly LogEntry[] {
        return this._logs;
    }

    /** Unexpected worker output: errors, unhandled rejections, and failure reports. */
    unexpectedLogs(): string[] {
        const bad = this._logs
            .filter((l) => {
                if (NOISE.some((r) => r.test(l.text))) {
                    return false;
                }
                if (this._allowed.some((r) => r.test(l.text))) {
                    return false;
                }
                return l.type === 'error' || l.type === 'warning';
            })
            .map((l) => `[${l.type}] ${l.text}`);
        return [...bad, ...this._errors];
    }

    // ---- worker -----------------------------------------------------------------------

    get worker(): Worker {
        return this._worker;
    }

    /**
     * Stops the service worker for real (CDP ServiceWorker.stopAllWorkers) and returns once a
     * fresh worker, with a new global scope, is running again. A Playwright handle of a stopped
     * worker is dead (evaluate hangs), so the old one is never touched after the stop.
     */
    async stopWorker(): Promise<void> {
        await this._worker.evaluate(() => {
            (globalThis as unknown as { __kwcOldScope: boolean }).__kwcOldScope = true;
        });
        // an extension page that is open already: it wakes the worker later, and opening a
        // page while the worker is stopped is what we avoid
        if (!this._wakePage) {
            this._wakePage = await this.context.newPage();
            await this._wakePage.goto(`chrome-extension://${this.id}/pages/options.html`);
        }
        const host = this.context.pages().find((p) => p.url().startsWith('http')) ?? this._wakePage;

        const cdp = await this.context.newCDPSession(host);
        const stopped = new Promise<void>((resolve) => {
            cdp.on('ServiceWorker.workerVersionUpdated', (e) => {
                // the extension's is the only service worker in this profile
                if (e.versions.some((v) => v.runningStatus === 'stopped')) {
                    resolve();
                }
            });
        });
        await cdp.send('ServiceWorker.enable');
        await cdp.send('ServiceWorker.stopAllWorkers');
        await stopped;
        await cdp.detach().catch(() => undefined);

        // any extension event starts the worker again; runtime.onMessage has a listener
        await this._wakePage.evaluate(() =>
            chrome.runtime.sendMessage({ action: 'e2e-wake' }).catch(() => undefined)
        );
        // the list may still hold the dead handle: take the one that answers with a clean scope
        let fresh: Worker | undefined;
        await expect
            .poll(
                async () => {
                    for (const w of this.context.serviceWorkers()) {
                        const clean = await Promise.race([
                            w
                                .evaluate(
                                    () =>
                                        (globalThis as unknown as { __kwcOldScope?: boolean })
                                            .__kwcOldScope === undefined
                                )
                                .catch(() => false),
                            new Promise<boolean>((resolve) =>
                                setTimeout(() => resolve(false), 1500)
                            )
                        ]);
                        if (clean) {
                            fresh = w;
                            return true;
                        }
                    }
                    return false;
                },
                { timeout: 20000, message: 'service worker did not come back' }
            )
            .toBe(true);
        this._worker = fresh!;
    }

    /**
     * Fires a manifest command through the same listener Chrome calls for a keyboard shortcut:
     * chrome.commands.onCommand, with the active tab. The `page` is made the active tab.
     */
    async fireCommand(command: string, page: Page): Promise<void> {
        await page.bringToFront();
        const url = page.url();
        await this._worker.evaluate(
            async ({ command: cmd, url: tabUrl }) => {
                const tabs = await chrome.tabs.query({ active: true });
                const tab = tabs.find((t) => t.url === tabUrl) ?? tabs[0];
                if (!tab) {
                    throw new Error('no active tab');
                }
                (
                    chrome.commands.onCommand as unknown as {
                        dispatch(command: string, tab: chrome.tabs.Tab): void;
                    }
                ).dispatch(cmd, tab);
            },
            { command, url }
        );
    }

    /** every command in the manifest, so tests cannot silently miss a new one */
    manifestCommands(): string[] {
        const manifest = JSON.parse(
            fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8')
        ) as { commands: Record<string, unknown> };
        return Object.keys(manifest.commands);
    }

    // ---- pages ------------------------------------------------------------------------

    keeWebPages(): Page[] {
        const origin = this.mock.keeWebOrigin;
        return this.context.pages().filter((p) => p.url().startsWith(origin));
    }

    /** opens KeeWeb and waits until its page listens for requests (a "warm" tab) */
    async openKeeWeb(urlPath = '/'): Promise<Page> {
        const page = await this.context.newPage();
        await page.goto(`${this.mock.keeWebOrigin}${urlPath}`);
        await page.waitForFunction(
            () => (window as unknown as { __kw: { listening: boolean } }).__kw.listening
        );
        return page;
    }

    /** a login page of the given shape; returns the page and the frame holding the form */
    async openLogin(mode: FrameMode): Promise<{ page: Page; frame: Frame }> {
        const page = await this.context.newPage();
        const origin = this.mock.siteOrigin;
        if (mode === 'top') {
            await page.goto(`${origin}/login`);
            return { page, frame: page.mainFrame() };
        }
        await page.goto(`${origin}/${mode === 'same-origin' ? 'frame-same' : 'frame-cross'}`);
        const handle = await page.locator('#child').elementHandle();
        const frame = await handle!.contentFrame();
        if (!frame) {
            throw new Error('iframe has no content frame');
        }
        await frame.waitForSelector('#user');
        return { page, frame };
    }

    async dispose(): Promise<void> {
        await this.context.close().catch(() => undefined);
        if (this._userDataDir) {
            fs.rmSync(this._userDataDir, { recursive: true, force: true });
        }
    }
}

interface Fixtures {
    ext: Extension;
}

interface WorkerFixtures {
    mock: MockKeeWeb;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
    mock: [
        async ({}, use) => {
            const mock = new MockKeeWeb();
            await mock.start();
            await use(mock);
            await mock.stop();
        },
        { scope: 'worker' }
    ],
    ext: async ({ mock }, use) => {
        mock.reset();
        const ext = await Extension.launch(mock);
        await use(ext);
        const unexpected = ext.unexpectedLogs();
        await ext.dispose();
        expect(unexpected, 'unexpected service worker errors').toEqual([]);
    }
});
