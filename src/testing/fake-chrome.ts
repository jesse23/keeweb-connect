/**
 * A small in-memory simulation of the parts of the chrome.* API (and of a KeeWeb web app)
 * that the browser-tab transport depends on. It runs on the global timers, so tests use
 * vitest fake timers to move time. Callback style only, like the code under test.
 */

type Listener = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

export class FakeEvent<F extends Listener = Listener> {
    readonly listeners = new Set<F>();
    addListener(fn: F) {
        this.listeners.add(fn);
    }
    removeListener(fn: F) {
        this.listeners.delete(fn);
    }
    hasListener(fn: F) {
        return this.listeners.has(fn);
    }
    fire(...args: Parameters<F>) {
        for (const fn of [...this.listeners]) {
            fn(...args);
        }
    }
}

export interface PageTiming {
    /** time until the navigation commits and the previous document (and its scripts) is gone */
    commitMillis: number;
    /** time until the tab reports status "complete" */
    loadMillis: number;
    /** time after the commit until the app registers its window message listener */
    listenerDelayMillis: number;
}

interface FakeDocument {
    id: number;
    url: string;
    scriptInstalled: boolean;
    appReadyAt: number | undefined;
    ports: Set<FakePort>;
}

interface FakeTabState {
    id: number;
    url: string;
    status: 'loading' | 'complete' | 'unloaded';
    discarded: boolean;
    doc: FakeDocument;
    pendingTimers: ReturnType<typeof setTimeout>[];
}

export class FakePort {
    readonly onMessage = new FakeEvent<(msg: unknown) => void>();
    readonly onDisconnect = new FakeEvent<() => void>();
    connected = true;
    sender = undefined;
    constructor(
        readonly name: string,
        private readonly browser: FakeBrowser,
        readonly tabId: number,
        readonly doc: FakeDocument | undefined
    ) {}

    postMessage(msg: unknown) {
        if (!this.connected) {
            throw new Error('Attempting to use a disconnected port object');
        }
        this.browser.deliverToPage(this, msg);
    }

    disconnect() {
        // closing our own end does not fire our own onDisconnect, like in Chrome
        this.connected = false;
        this.doc?.ports.delete(this);
    }

    /** the other side went away */
    remoteDisconnect(error?: string) {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this.doc?.ports.delete(this);
        this.browser.withLastError(error, () => this.onDisconnect.fire());
    }
}

export class FakeBrowser {
    timing: PageTiming = { commitMillis: 200, loadMillis: 800, listenerDelayMillis: 300 };

    readonly tabs = new Map<number, FakeTabState>();
    readonly onUpdated = new FakeEvent<
        (tabId: number, changeInfo: { status?: string }, tab: chrome.tabs.Tab) => void
    >();
    readonly onRemoved = new FakeEvent<(tabId: number) => void>();

    injections: { tabId: number; docId: number; ok: boolean }[] = [];
    created: number[] = [];
    reloaded: number[] = [];
    platformInfoCalls = 0;
    /** every request the app received, in order, with whether it was able to answer */
    pageRequests: { action: string; answered: boolean }[] = [];

    lastError: { message: string } | undefined;
    storage: Record<string, unknown> = {};

    private nextTabId = 1;
    private nextDocId = 1;
    private now = () => Date.now();

    /** adds an already loaded tab */
    addTab(url: string, options: { discarded?: boolean; listenerReady?: boolean } = {}): number {
        const id = this.nextTabId++;
        const doc = this.newDocument(url);
        doc.appReadyAt = options.listenerReady === false ? undefined : this.now();
        this.tabs.set(id, {
            id,
            url,
            status: options.discarded ? 'unloaded' : 'complete',
            discarded: !!options.discarded,
            doc,
            pendingTimers: []
        });
        return id;
    }

    /** simulates a discard (Memory Saver): the document and its scripts are gone */
    discard(tabId: number) {
        const tab = this.tabs.get(tabId)!;
        this.destroyDocument(tab.doc);
        tab.discarded = true;
        tab.status = 'unloaded';
        tab.doc = this.newDocument('about:blank');
    }

    /** simulates a service worker restart: every port opened by the worker is closed */
    killWorkerPorts() {
        for (const tab of this.tabs.values()) {
            for (const port of [...tab.doc.ports]) {
                port.connected = false;
                tab.doc.ports.delete(port);
            }
        }
    }

    /** sends an arbitrary message from the page to every port of the tab's current document */
    emitFromPage(tabId: number, msg: unknown) {
        const doc = this.tabs.get(tabId)!.doc;
        for (const port of [...doc.ports]) {
            port.onMessage.fire(msg);
        }
    }

    scriptInstalled(tabId: number): boolean {
        return this.tabs.get(tabId)!.doc.scriptInstalled;
    }

    tabCount(): number {
        return this.tabs.size;
    }

    snapshot(tab: FakeTabState): chrome.tabs.Tab {
        return {
            id: tab.id,
            url: tab.url,
            status: tab.status,
            discarded: tab.discarded,
            windowId: 1,
            active: true
        } as chrome.tabs.Tab;
    }

    withLastError(message: string | undefined, fn: () => void) {
        this.lastError = message ? { message } : undefined;
        try {
            fn();
        } finally {
            this.lastError = undefined;
        }
    }

    deliverToPage(port: FakePort, msg: unknown) {
        setTimeout(() => {
            const tab = this.tabs.get(port.tabId);
            if (!tab || !port.connected || !port.doc || tab.doc !== port.doc) {
                return;
            }
            const { action, data } = msg as { action: string; data?: string };
            const ready = port.doc.appReadyAt !== undefined && this.now() >= port.doc.appReadyAt;
            this.pageRequests.push({ action, answered: ready });
            if (!ready) {
                // the app has not registered its listener yet: the message is lost
                return;
            }
            let response: Record<string, unknown> | undefined;
            if (action === 'ping') {
                response = { action: 'ping', data };
            } else if (action === 'change-public-keys') {
                response = {
                    action: 'change-public-keys',
                    appName: 'KeeWeb',
                    publicKey: btoa('k'.repeat(32)),
                    nonce: (msg as { nonce: string }).nonce,
                    success: 'true'
                };
            }
            if (response) {
                // the content script forwards every response to every open port
                for (const p of [...port.doc.ports]) {
                    p.onMessage.fire(response);
                }
            }
        }, 0);
    }

    private newDocument(url: string): FakeDocument {
        return {
            id: this.nextDocId++,
            url,
            scriptInstalled: false,
            appReadyAt: undefined,
            ports: new Set()
        };
    }

    private destroyDocument(doc: FakeDocument) {
        for (const port of [...doc.ports]) {
            port.remoteDisconnect();
        }
        doc.scriptInstalled = false;
    }

    /** starts a navigation of the tab to the url: commit, then load, then the app listener */
    private navigate(tab: FakeTabState, url: string) {
        tab.discarded = false;
        tab.status = 'loading';
        this.onUpdated.fire(tab.id, { status: 'loading' }, this.snapshot(tab));
        const { commitMillis, loadMillis, listenerDelayMillis } = this.timing;
        tab.pendingTimers.push(
            setTimeout(() => {
                if (!this.tabs.has(tab.id)) {
                    return;
                }
                this.destroyDocument(tab.doc);
                tab.doc = this.newDocument(url);
                tab.url = url;
                tab.doc.appReadyAt = this.now() + listenerDelayMillis;
            }, commitMillis),
            setTimeout(
                () => {
                    if (!this.tabs.has(tab.id)) {
                        return;
                    }
                    tab.status = 'complete';
                    this.onUpdated.fire(tab.id, { status: 'complete' }, this.snapshot(tab));
                },
                Math.max(loadMillis, commitMillis)
            )
        );
    }

    private matches(tab: FakeTabState, pattern: string): boolean {
        if (pattern === '<all_urls>') {
            return true;
        }
        if (pattern.endsWith('/*')) {
            return tab.url.startsWith(pattern.slice(0, -1));
        }
        return tab.url === pattern;
    }

    private async(fn: () => void) {
        setTimeout(fn, 0);
    }

    install(): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const browser = this;
        const api = {
            runtime: {
                id: 'fake-extension-id',
                get lastError() {
                    return browser.lastError;
                },
                getManifest: () => ({ version: '1.0.0' }),
                getPlatformInfo: (cb: () => void) => {
                    browser.platformInfoCalls++;
                    browser.async(cb);
                },
                onConnect: new FakeEvent()
            },
            i18n: {
                getMessage: (key: string) => key
            },
            permissions: {
                contains: (_: unknown, cb: (r: boolean) => void) => browser.async(() => cb(true))
            },
            storage: {
                onChanged: new FakeEvent(),
                local: {
                    get: (keys: string[], cb: (data: Record<string, unknown>) => void) => {
                        const data: Record<string, unknown> = {};
                        for (const k of keys) {
                            if (k in browser.storage) {
                                data[k] = browser.storage[k];
                            }
                        }
                        browser.async(() => cb(data));
                    }
                }
            },
            tabs: {
                onUpdated: browser.onUpdated,
                onRemoved: browser.onRemoved,
                query: (info: { url?: string }, cb: (tabs: chrome.tabs.Tab[]) => void) => {
                    browser.async(() => {
                        const found = [...browser.tabs.values()]
                            .filter((t) => !info.url || browser.matches(t, info.url))
                            .map((t) => browser.snapshot(t));
                        cb(found);
                    });
                },
                get: (tabId: number, cb: (tab?: chrome.tabs.Tab) => void) => {
                    browser.async(() => {
                        const tab = browser.tabs.get(tabId);
                        if (!tab) {
                            browser.withLastError(`No tab with id: ${tabId}.`, () => cb(undefined));
                        } else {
                            cb(browser.snapshot(tab));
                        }
                    });
                },
                create: (info: { url: string }, cb: (tab?: chrome.tabs.Tab) => void) => {
                    const id = browser.nextTabId++;
                    const tab: FakeTabState = {
                        id,
                        url: '',
                        status: 'loading',
                        discarded: false,
                        doc: browser.newDocument('about:blank'),
                        pendingTimers: []
                    };
                    browser.tabs.set(id, tab);
                    browser.created.push(id);
                    browser.navigate(tab, info.url);
                    browser.async(() => cb(browser.snapshot(tab)));
                },
                reload: (tabId: number, _: unknown, cb?: () => void) => {
                    browser.async(() => {
                        const tab = browser.tabs.get(tabId);
                        if (!tab) {
                            browser.withLastError(`No tab with id: ${tabId}.`, () => cb?.());
                            return;
                        }
                        browser.reloaded.push(tabId);
                        const url = tab.url || tab.doc.url;
                        browser.navigate(tab, url);
                        cb?.();
                    });
                },
                update: (tabId: number, _: unknown, cb?: () => void) => {
                    browser.async(() => cb?.());
                },
                connect: (tabId: number, info: { name: string }) => {
                    const tab = browser.tabs.get(tabId);
                    const doc = tab && !tab.discarded ? tab.doc : undefined;
                    const port = new FakePort(info.name, browser, tabId, doc);
                    if (doc?.scriptInstalled) {
                        doc.ports.add(port);
                    } else {
                        browser.async(() =>
                            port.remoteDisconnect(
                                'Could not establish connection. Receiving end does not exist.'
                            )
                        );
                    }
                    return port as unknown as chrome.runtime.Port;
                }
            },
            scripting: {
                executeScript: (
                    inj: { files: string[]; target: { tabId: number } },
                    cb: (r?: unknown[]) => void
                ) => {
                    browser.async(() => {
                        const tab = browser.tabs.get(inj.target.tabId);
                        if (!tab) {
                            browser.withLastError(`No tab with id: ${inj.target.tabId}.`, () =>
                                cb(undefined)
                            );
                            return;
                        }
                        if (tab.discarded) {
                            browser.injections.push({
                                tabId: tab.id,
                                docId: tab.doc.id,
                                ok: false
                            });
                            browser.withLastError(
                                'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
                                () => cb(undefined)
                            );
                            return;
                        }
                        // idempotent, like the guard flag of the real content script
                        tab.doc.scriptInstalled = true;
                        browser.injections.push({ tabId: tab.id, docId: tab.doc.id, ok: true });
                        cb([{ frameId: 0 }]);
                    });
                }
            }
        };
        (globalThis as { chrome?: unknown }).chrome = api;
        (globalThis as { self?: unknown }).self = globalThis;
    }
}
