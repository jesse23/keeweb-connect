import { activateTab, randomBase64 } from 'background/utils';
import {
    KeeWebConnectRequest,
    KeeWebConnectResponse,
    KeeWebConnectPingRequest,
    KeeWebConnectPingResponse
} from 'background/protocol/types';
import { noop } from 'common/utils';
import { TransportBase } from './transport-base';

interface TransportBrowserTabTiming {
    /** how long to wait for the tab to reach status "complete" before trying anyway */
    tabLoadTimeoutMillis: number;
    /** handshake budget after the tab is loaded */
    handshakeBudgetMillis: number;
    /** handshake budget after the single reload of the KeeWeb tab */
    retryBudgetMillis: number;
    /** how often the same ping is re-sent through an open port */
    pingIntervalMillis: number;
    /** the first per-attempt window; grows with backoff up to maxAttemptWindowMillis */
    attemptWindowMillis: number;
    maxAttemptWindowMillis: number;
    /** minimum duration of one attempt, so a failing connect cannot spin */
    minAttemptMillis: number;
}

const defaultTiming: TransportBrowserTabTiming = {
    tabLoadTimeoutMillis: 15000,
    handshakeBudgetMillis: 20000,
    retryBudgetMillis: 15000,
    pingIntervalMillis: 500,
    attemptWindowMillis: 1500,
    maxAttemptWindowMillis: 4000,
    minAttemptMillis: 500
};

/** the directory part of a pathname with a trailing slash: /keeweb/index.html -> /keeweb/ */
function pathDirectory(pathname: string): string {
    return pathname.slice(0, pathname.lastIndexOf('/') + 1) || '/';
}

/**
 * Match pattern for the pages of the configured KeeWeb: origin plus the directory of its path,
 * e.g. https://app.keeweb.info/* or https://host/keeweb/*.
 * Returns undefined for URLs that cannot be matched.
 */
function originMatchPattern(url: string): string | undefined {
    try {
        const { origin, protocol, pathname } = new URL(url);
        if (protocol !== 'https:' && protocol !== 'http:') {
            return undefined;
        }
        return `${origin}${pathDirectory(pathname)}*`;
    } catch {
        return undefined;
    }
}

/** true when the tab address is on the configured KeeWeb origin and under its path directory */
function isKeeWebTabUrl(tabUrl: string | undefined, keeWebUrl: string): boolean {
    try {
        const tab = new URL(tabUrl ?? '');
        const config = new URL(keeWebUrl);
        return (
            tab.origin === config.origin && tab.pathname.startsWith(pathDirectory(config.pathname))
        );
    } catch {
        return false;
    }
}

function sleep(millis: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, millis));
}

class TransportBrowserTab extends TransportBase {
    private readonly _keeWebUrl: string;
    private readonly _timing: TransportBrowserTabTiming;
    private _tab: chrome.tabs.Tab | undefined;
    private _port: chrome.runtime.Port | undefined;
    private _closed = false;
    private _lastInjectionError: string | undefined;

    constructor(keeWebUrl: string, timing: Partial<TransportBrowserTabTiming> = {}) {
        super();
        this._keeWebUrl = keeWebUrl;
        this._timing = { ...defaultTiming, ...timing };
    }

    async connect(): Promise<void> {
        this._closed = false;
        this._lastInjectionError = undefined;

        const pattern = originMatchPattern(this._keeWebUrl);
        const hasPermissions = pattern ? await this.checkPermissions(pattern) : false;
        if (!hasPermissions) {
            const msg = chrome.i18n.getMessage('errorBrowserTabNoPermissions', this._keeWebUrl);
            throw new Error(msg);
        }

        this._tab = await this.findOrCreateTab(pattern!);
        await this.waitForTabReady(this._tab.id!, !!this._tab.discarded);

        let port = await this.handshake(this._timing.handshakeBudgetMillis);

        if (!port && !this._closed) {
            // last resort: the page may be stuck, reload it once and try again
            // eslint-disable-next-line no-console
            console.warn('KeeWeb tab did not answer, reloading it once');
            await this.reloadTab(pattern!);
            port = await this.handshake(this._timing.retryBudgetMillis);
        }

        if (!port || this._closed) {
            if (this._lastInjectionError) {
                throw new Error(`Content script injection error: ${this._lastInjectionError}`);
            }
            throw new Error(chrome.i18n.getMessage('errorConnectionErrorWeb'));
        }

        this._port = port;
        port.onDisconnect.addListener(() => this.portDisconnected());
        port.onMessage.addListener((msg) => this.portMessage(msg)); // eslint-disable-line @typescript-eslint/no-unsafe-argument
    }

    disconnect(): Promise<void> {
        return new Promise((resolve) => {
            this._closed = true;
            this._tab = undefined;
            this._port?.disconnect();
            if (this._port) {
                this.portDisconnected();
            }
            resolve();
        });
    }

    request(message: KeeWebConnectRequest): void {
        if (this._port) {
            this._port.postMessage(message);
        }
    }

    focusKeeWeb(): void {
        if (this._tab?.id) {
            activateTab(this._tab.id).catch(noop);
        }
    }

    private checkPermissions(pattern: string): Promise<boolean> {
        return new Promise((resolve) => {
            chrome.permissions.contains({ permissions: ['tabs'], origins: [pattern] }, resolve);
        });
    }

    private findOrCreateTab(pattern: string): Promise<chrome.tabs.Tab> {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ url: pattern }, (tabs) => {
                void chrome.runtime.lastError;
                const candidates = (tabs ?? []).filter(
                    (t) =>
                        t.id !== undefined &&
                        // a tab that is still navigating has the target only in pendingUrl
                        (isKeeWebTabUrl(t.url, this._keeWebUrl) ||
                            isKeeWebTabUrl(t.pendingUrl, this._keeWebUrl))
                );
                const tab = candidates.find((t) => !t.discarded) ?? candidates[0];
                if (tab) {
                    resolve(tab);
                    return;
                }
                chrome.tabs.create({ url: this._keeWebUrl, active: true }, (created) => {
                    void chrome.runtime.lastError;
                    if (created?.id !== undefined) {
                        resolve(created);
                    } else {
                        reject(new Error(chrome.i18n.getMessage('errorBrowserCannotCreateTab')));
                    }
                });
            });
        });
    }

    private getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
        return new Promise((resolve) => {
            chrome.tabs.get(tabId, (tab) => {
                void chrome.runtime.lastError;
                resolve(tab);
            });
        });
    }

    /**
     * Resolves when the tab has finished loading, was removed, or the timeout expired.
     * Never rejects: the handshake loop decides what to do with a tab that is not ready.
     */
    private waitForTabReady(tabId: number, reload: boolean): Promise<void> {
        return new Promise((resolve) => {
            let finished = false;
            const finish = () => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(onUpdated);
                chrome.tabs.onRemoved.removeListener(onRemoved);
                resolve();
            };
            const onUpdated: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (
                id,
                changeInfo,
                tab
            ) => {
                if (id === tabId && changeInfo.status === 'complete' && !isBlank(tab)) {
                    finish();
                }
            };
            const onRemoved = (id: number) => {
                if (id === tabId) {
                    finish();
                }
            };
            const timer = setTimeout(finish, this._timing.tabLoadTimeoutMillis);
            chrome.tabs.onUpdated.addListener(onUpdated);
            chrome.tabs.onRemoved.addListener(onRemoved);

            if (reload) {
                chrome.tabs.reload(tabId, {}, () => void chrome.runtime.lastError);
                return;
            }
            this.getTab(tabId)
                .then((tab) => {
                    if (!tab || (tab.status === 'complete' && !tab.discarded && !isBlank(tab))) {
                        finish();
                    }
                })
                .catch(noop);
        });
    }

    /** reload the existing tab (or open a new one if it is gone) and wait for it */
    private async reloadTab(pattern: string): Promise<void> {
        const existing = this._tab?.id !== undefined ? await this.getTab(this._tab.id) : undefined;
        if (existing?.id !== undefined) {
            this._tab = existing;
            await this.waitForTabReady(existing.id, true);
        } else {
            this._tab = await this.findOrCreateTab(pattern);
            await this.waitForTabReady(this._tab.id!, !!this._tab.discarded);
        }
    }

    /** make sure the tab we know about still exists and is not discarded */
    private async recoverTab(): Promise<void> {
        const pattern = originMatchPattern(this._keeWebUrl);
        if (!pattern) {
            return;
        }
        const tab = this._tab?.id !== undefined ? await this.getTab(this._tab.id) : undefined;
        if (!tab) {
            this._tab = await this.findOrCreateTab(pattern);
            await this.waitForTabReady(this._tab.id!, !!this._tab.discarded);
        } else if (tab.discarded) {
            this._tab = tab;
            await this.waitForTabReady(tab.id!, true);
        }
    }

    private portDisconnected() {
        this._tab = undefined;
        if (this._port) {
            this._port = undefined;
            this.emit('disconnected');
        }
    }

    private injectContentScript(tabId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            chrome.scripting.executeScript(
                { files: ['js/content-keeweb.js'], target: { tabId } },
                () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * Inject the content script and ping the page until it answers or the budget is over.
     * The injection is repeated in every attempt: it is idempotent (guard flag in the script),
     * and the page may have navigated since the previous attempt, which destroys the script.
     */
    private async handshake(budgetMillis: number): Promise<chrome.runtime.Port | undefined> {
        const deadline = Date.now() + budgetMillis;
        let windowMillis = this._timing.attemptWindowMillis;

        while (!this._closed && Date.now() < deadline) {
            const startedAt = Date.now();
            const tabId = this._tab?.id;
            if (tabId === undefined) {
                return undefined;
            }

            let port: chrome.runtime.Port | undefined;
            try {
                await this.injectContentScript(tabId);
                this._lastInjectionError = undefined;
                const remaining = Math.max(deadline - Date.now(), this._timing.pingIntervalMillis);
                port = await this.pingTab(tabId, Math.min(windowMillis, remaining));
            } catch (e) {
                this._lastInjectionError = (<Error>e).message;
                if (this._closed) {
                    return undefined;
                }
                try {
                    await this.recoverTab();
                } catch (recoverError) {
                    this._lastInjectionError = (<Error>recoverError).message;
                }
            }
            if (port) {
                return port;
            }

            const elapsed = Date.now() - startedAt;
            if (elapsed < this._timing.minAttemptMillis) {
                await sleep(this._timing.minAttemptMillis - elapsed);
            }
            windowMillis = Math.min(windowMillis * 1.5, this._timing.maxAttemptWindowMillis);
        }
        return undefined;
    }

    /**
     * Open a port and re-send the ping until the page echoes this port's unique name.
     * Replies carrying anything else (stale answers to previous attempts) are ignored.
     */
    private pingTab(tabId: number, windowMillis: number): Promise<chrome.runtime.Port | undefined> {
        return new Promise((resolve) => {
            const name = TransportBrowserTab.getRandomPortName();
            const port = chrome.tabs.connect(tabId, { name });
            const pingRequest: KeeWebConnectPingRequest = { action: 'ping', data: name };

            let finished = false;
            const finish = (result: chrome.runtime.Port | undefined) => {
                if (finished) {
                    return;
                }
                finished = true;
                clearTimeout(windowTimer);
                clearInterval(pingTimer);
                port.onDisconnect.removeListener(onDisconnect);
                port.onMessage.removeListener(onMessage);
                if (!result) {
                    try {
                        port.disconnect();
                    } catch {
                        // already gone
                    }
                }
                resolve(result);
            };

            const onDisconnect = () => {
                if (chrome.runtime.lastError) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        'KeeWeb tab disconnected with error',
                        chrome.runtime.lastError.message
                    );
                }
                finish(undefined);
            };

            const onMessage = (msg: KeeWebConnectPingResponse) => {
                if (msg?.data === name) {
                    finish(port);
                }
            };

            const sendPing = () => {
                try {
                    port.postMessage(pingRequest);
                } catch {
                    finish(undefined);
                }
            };

            const windowTimer = setTimeout(() => finish(undefined), windowMillis);
            const pingTimer = setInterval(sendPing, this._timing.pingIntervalMillis);
            port.onDisconnect.addListener(onDisconnect);
            port.onMessage.addListener(onMessage);
            sendPing();
        });
    }

    private static getRandomPortName(): string {
        return `keeweb-connect-${randomBase64(32)}`;
    }

    private portMessage(msg: KeeWebConnectResponse) {
        // the page answers every ping it received: replies to pings that were re-sent during
        // the handshake can still arrive afterwards, and must not be taken for a response
        if (this._port && (msg as { data?: unknown } | undefined)?.data === this._port.name) {
            return;
        }
        this.emit('message', msg);
    }
}

function isBlank(tab: chrome.tabs.Tab | undefined): boolean {
    const url = tab?.url;
    return url === 'about:blank' || url === '';
}

export { TransportBrowserTab, originMatchPattern, isKeeWebTabUrl };
export type { TransportBrowserTabTiming };
