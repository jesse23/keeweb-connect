import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendConnectionState } from 'common/backend-connection-state';
import { FakeBrowser } from '../testing/fake-chrome';

type BackendModule = typeof import('./backend');

let browser: FakeBrowser;

beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    browser = new FakeBrowser();
    browser.install();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** a fresh module instance is what a restarted service worker gets */
async function freshBackend(): Promise<BackendModule['backend']> {
    vi.resetModules();
    const mod = await import('./backend');
    return mod.backend;
}

async function init(backend: BackendModule['backend']) {
    const done = backend.init();
    await vi.advanceTimersByTimeAsync(10);
    await done;
}

describe('Backend', () => {
    it('connects in web mode to app.keeweb.info by default', async () => {
        browser.storage = { useNativeApp: false };
        browser.addTab('https://app.keeweb.info/');
        const backend = await freshBackend();
        await init(backend);
        expect(backend.keeWebUrl).toBe('https://app.keeweb.info/');

        const done = backend.connect();
        await vi.advanceTimersByTimeAsync(5000);
        await done;

        expect(backend.state).toBe(BackendConnectionState.Connected);
        expect(browser.tabCount()).toBe(1);
    });

    it('connects to beta.keeweb.info when it is configured in the options', async () => {
        browser.storage = { useNativeApp: false, keeWebUrl: 'https://beta.keeweb.info/' };
        const backend = await freshBackend();
        await init(backend);

        const done = backend.connect();
        await vi.advanceTimersByTimeAsync(10000);
        await done;

        expect(backend.state).toBe(BackendConnectionState.Connected);
        const [tabId] = browser.created;
        expect(browser.tabs.get(tabId)!.url).toBe('https://beta.keeweb.info/');
    });

    it('waits for init when connect() is called before the config is loaded', async () => {
        browser.storage = { useNativeApp: false, keeWebUrl: 'https://beta.keeweb.info/' };
        browser.addTab('https://beta.keeweb.info/');
        const backend = await freshBackend();

        const done = backend.connect();
        await vi.advanceTimersByTimeAsync(50);
        expect(backend.state).toBe(BackendConnectionState.Initializing);

        await init(backend);
        await vi.advanceTimersByTimeAsync(5000);
        await done;

        expect(backend.state).toBe(BackendConnectionState.Connected);
        expect(browser.created).toEqual([]);
    });

    it('reconnects cleanly in a restarted service worker between commands', async () => {
        browser.storage = { useNativeApp: false };
        browser.addTab('https://app.keeweb.info/');

        const first = await freshBackend();
        await init(first);
        const firstDone = first.connect();
        await vi.advanceTimersByTimeAsync(5000);
        await firstDone;
        expect(first.state).toBe(BackendConnectionState.Connected);

        browser.killWorkerPorts();

        const second = await freshBackend();
        expect(second).not.toBe(first);
        expect(second.state).toBe(BackendConnectionState.Initializing);
        await init(second);
        const secondDone = second.connect();
        await vi.advanceTimersByTimeAsync(5000);
        await secondDone;

        expect(second.state).toBe(BackendConnectionState.Connected);
        expect(browser.tabCount()).toBe(1);
        expect(browser.reloaded).toEqual([]);
    });

    it('keeps the worker alive only while connecting', async () => {
        browser.storage = { useNativeApp: false };
        browser.timing = { commitMillis: 100, loadMillis: 500, listenerDelayMillis: 50000 };
        const backend = await freshBackend();
        await init(backend);

        const done = backend.connect().catch(() => undefined);
        await vi.advanceTimersByTimeAsync(5000);
        expect(browser.platformInfoCalls).toBe(0);
        await vi.advanceTimersByTimeAsync(25000);
        const whileConnecting = browser.platformInfoCalls;
        expect(whileConnecting).toBeGreaterThan(0);

        // the app never answers: the attempt ends with an error after the whole budget
        await vi.advanceTimersByTimeAsync(60000);
        await done;
        expect(backend.state).toBe(BackendConnectionState.Error);

        const afterConnect = browser.platformInfoCalls;
        await vi.advanceTimersByTimeAsync(120000);
        expect(browser.platformInfoCalls).toBe(afterConnect);
    });
});
