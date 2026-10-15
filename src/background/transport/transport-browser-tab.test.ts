import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from '../../testing/fake-chrome';
import { TransportBrowserTab, originMatchPattern } from './transport-browser-tab';

const APP = 'https://app.keeweb.info/';
const BETA = 'https://beta.keeweb.info/';

let browser: FakeBrowser;

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browser = new FakeBrowser();
    browser.install();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** run connect() while moving the fake clock, report how it settled */
async function settle(promise: Promise<void>, millis = 60000) {
    const result = promise.then(
        () => 'connected',
        (e: Error) => e.message
    );
    await vi.advanceTimersByTimeAsync(millis);
    return result;
}

describe('originMatchPattern', () => {
    it('turns any KeeWeb url into an origin pattern', () => {
        expect(originMatchPattern(APP)).toBe('https://app.keeweb.info/*');
        expect(originMatchPattern('https://beta.keeweb.info/?x=1#/open')).toBe(
            'https://beta.keeweb.info/*'
        );
        expect(originMatchPattern('http://localhost:8085/')).toBe('http://localhost:8085/*');
    });

    it('rejects urls that cannot be matched', () => {
        expect(originMatchPattern('not a url')).toBeUndefined();
        expect(originMatchPattern('file:///tmp/x')).toBeUndefined();
    });
});

describe('TransportBrowserTab.connect', () => {
    it('connects to an open, loaded tab without opening another one', async () => {
        const tabId = browser.addTab(APP);
        const transport = new TransportBrowserTab(APP);

        expect(await settle(transport.connect())).toBe('connected');
        expect(browser.tabCount()).toBe(1);
        expect(browser.scriptInstalled(tabId)).toBe(true);
        expect(browser.created).toEqual([]);
        expect(browser.reloaded).toEqual([]);
    });

    it.each([APP, BETA])('opens and connects a new tab for %s on a late page load', async (url) => {
        browser.timing = { commitMillis: 1500, loadMillis: 6000, listenerDelayMillis: 500 };
        const transport = new TransportBrowserTab(url);

        expect(await settle(transport.connect())).toBe('connected');
        expect(browser.created).toHaveLength(1);
        expect(browser.tabCount()).toBe(1);
        expect(browser.reloaded).toEqual([]);
    });

    it('does not inject into the initial about:blank document of a new tab', async () => {
        browser.timing = { commitMillis: 1000, loadMillis: 2000, listenerDelayMillis: 0 };
        const transport = new TransportBrowserTab(APP);

        expect(await settle(transport.connect())).toBe('connected');
        const [tabId] = browser.created;
        const injected = browser.injections.filter((i) => i.tabId === tabId);
        expect(injected.length).toBeGreaterThan(0);
        // every injection that is still alive landed in the committed document
        expect(browser.scriptInstalled(tabId)).toBe(true);
    });

    it('re-injects after a navigation destroyed the already injected script', async () => {
        // the script lands in the current document, then the page navigates (redirect, SW reload)
        browser.timing = { commitMillis: 300, loadMillis: 900, listenerDelayMillis: 100 };
        const tabId = browser.addTab(APP, { listenerReady: false });
        const transport = new TransportBrowserTab(APP);
        const result = settle(transport.connect());

        await vi.advanceTimersByTimeAsync(100);
        expect(browser.scriptInstalled(tabId)).toBe(true);
        const api = (globalThis as unknown as { chrome: typeof chrome }).chrome;
        api.tabs.reload(tabId, {}, () => undefined);

        expect(await result).toBe('connected');
        const docIds = new Set(browser.injections.filter((i) => i.ok).map((i) => i.docId));
        expect(docIds.size).toBeGreaterThan(1);
        // the final document has the script and the connection is made to it
        expect(browser.scriptInstalled(tabId)).toBe(true);
    });

    it('reloads a discarded tab before injecting', async () => {
        const tabId = browser.addTab(APP, { discarded: true });
        const transport = new TransportBrowserTab(APP);

        expect(await settle(transport.connect())).toBe('connected');
        expect(browser.reloaded).toContain(tabId);
        expect(browser.tabs.get(tabId)!.discarded).toBe(false);
        expect(browser.tabCount()).toBe(1);
    });

    it('recovers when the tab gets discarded in the middle of the handshake', async () => {
        const tabId = browser.addTab(APP, { listenerReady: false });
        const transport = new TransportBrowserTab(APP);
        const result = settle(transport.connect());

        await vi.advanceTimersByTimeAsync(300);
        browser.discard(tabId);

        expect(await result).toBe('connected');
        expect(browser.reloaded).toContain(tabId);
    });

    it('ignores stale replies instead of disconnecting', async () => {
        const tabId = browser.addTab(APP, { listenerReady: false });
        const transport = new TransportBrowserTab(APP);
        const result = settle(transport.connect());

        await vi.advanceTimersByTimeAsync(100);
        // a late answer to a ping of some earlier attempt, and unrelated garbage
        browser.emitFromPage(tabId, { action: 'ping', data: 'keeweb-connect-previous-attempt' });
        browser.emitFromPage(tabId, { action: 'database-locked' });
        await vi.advanceTimersByTimeAsync(300);
        browser.tabs.get(tabId)!.doc.appReadyAt = Date.now();

        expect(await result).toBe('connected');
        expect(browser.reloaded).toEqual([]);
    });

    it('survives an app that registers its listener after more than 5 seconds', async () => {
        browser.timing = { commitMillis: 200, loadMillis: 800, listenerDelayMillis: 9000 };
        const transport = new TransportBrowserTab(APP);

        expect(await settle(transport.connect())).toBe('connected');
        expect(browser.reloaded).toEqual([]);
        // pings sent before the listener existed were lost, later ones answered
        expect(browser.pageRequests.some((r) => !r.answered)).toBe(true);
        expect(browser.pageRequests.some((r) => r.answered)).toBe(true);
    });

    it('reloads the tab once and succeeds when the first page load never answers', async () => {
        const tabId = browser.addTab(APP, { listenerReady: false });
        const transport = new TransportBrowserTab(APP, {
            handshakeBudgetMillis: 5000,
            retryBudgetMillis: 10000
        });
        const result = settle(transport.connect());
        // the reload gives a healthy page
        browser.timing = { commitMillis: 100, loadMillis: 500, listenerDelayMillis: 100 };

        expect(await result).toBe('connected');
        expect(browser.reloaded).toEqual([tabId]);
    });

    it('fails with the connection error after one reload only', async () => {
        const tabId = browser.addTab(APP, { listenerReady: false });
        browser.timing = { commitMillis: 100, loadMillis: 500, listenerDelayMillis: 10 ** 9 };
        const transport = new TransportBrowserTab(APP, {
            handshakeBudgetMillis: 3000,
            retryBudgetMillis: 3000
        });

        expect(await settle(transport.connect())).toBe('errorConnectionErrorWeb');
        expect(browser.reloaded).toEqual([tabId]);
    });

    it('does not match a tab of another KeeWeb origin', async () => {
        browser.addTab(BETA);
        const transport = new TransportBrowserTab(APP);

        expect(await settle(transport.connect())).toBe('connected');
        expect(browser.created).toHaveLength(1);
        expect(browser.tabCount()).toBe(2);
    });

    it('matches an existing tab with a query string or hash', async () => {
        browser.addTab(`${BETA}?config=x#/open`);
        const transport = new TransportBrowserTab(BETA);

        expect(await settle(transport.connect())).toBe('connected');
        expect(browser.created).toEqual([]);
    });

    it('rejects an unusable url with the permissions error', async () => {
        const transport = new TransportBrowserTab('not a url');
        expect(await settle(transport.connect(), 10)).toBe('errorBrowserTabNoPermissions');
    });

    it('can connect again after the service worker restarted', async () => {
        browser.addTab(APP);
        const first = new TransportBrowserTab(APP);
        expect(await settle(first.connect())).toBe('connected');

        // the worker dies: its ports are gone, the page keeps the old script
        browser.killWorkerPorts();

        const second = new TransportBrowserTab(APP);
        expect(await settle(second.connect())).toBe('connected');
        expect(browser.tabCount()).toBe(1);
        expect(browser.reloaded).toEqual([]);
    });

    it('emits disconnected when the page goes away after connecting', async () => {
        const tabId = browser.addTab(APP);
        const transport = new TransportBrowserTab(APP);
        expect(await settle(transport.connect())).toBe('connected');

        const onDisconnected = vi.fn();
        transport.on('disconnected', onDisconnected);
        browser.discard(tabId);

        expect(onDisconnected).toHaveBeenCalledTimes(1);
    });
});
