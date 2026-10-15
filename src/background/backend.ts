import { TypedEmitter } from 'tiny-typed-emitter';
import { BackendConnectionState } from 'common/backend-connection-state';
import { noop } from 'common/utils';
import { TransportBase } from './transport/transport-base';
import { TransportNativeMessaging } from './transport/transport-native-messaging';
import { TransportBrowserTab } from './transport/transport-browser-tab';
import {
    KeeWebConnectGetLoginsResponseEntry,
    KeeWebConnectRequest,
    KeeWebConnectResponse
} from './protocol/types';
import { ProtocolImpl } from './protocol/protocol-impl';
import { KeepAlive } from './keepalive';

interface RequestQueueItem {
    request: KeeWebConnectRequest;
    resolve: (response: KeeWebConnectResponse) => void;
    reject: (error: Error) => void;
    timeout: number;
}

interface BackendEvents {
    'state-changed': () => void;
    'connect-finished': (error?: Error) => void;
}

class Backend extends TypedEmitter<BackendEvents> {
    private readonly _defaultKeeWebUrl = 'https://app.keeweb.info/';
    private readonly _requestTimeoutMillis = 60000;
    private readonly _consoleLogStyle =
        'background: {}; color: #000; padding: 2px 4px 0; border-radius: 2px;';
    private readonly _consoleLogStyleIn = this._consoleLogStyle.replace('{}', '#825fe3');
    private readonly _consoleLogStyleOut = this._consoleLogStyle.replace('{}', '#15be5c');

    private _useNativeApp = true;
    private _keeWebUrl = this._defaultKeeWebUrl;

    private _state = BackendConnectionState.Initializing;
    private _connectionError: string | undefined;
    private _transport: TransportBase | undefined;
    private _requestQueue: RequestQueueItem[] = [];
    private _currentRequest: RequestQueueItem | undefined;
    private _protocol: ProtocolImpl | undefined;
    private _keepAlive = new KeepAlive();
    private _initPromise: Promise<void> | undefined;
    private _resolveReady!: () => void;
    private _ready = new Promise<void>((resolve) => {
        this._resolveReady = resolve;
    });

    /** resolves once the stored configuration is loaded; connect() waits for it */
    get ready(): Promise<void> {
        return this._ready;
    }

    get state(): BackendConnectionState {
        return this._state;
    }
    private setState(state: BackendConnectionState) {
        if (this._state !== state) {
            this._state = state;
            this.emit('state-changed');
        }
    }

    get connectionError(): string | undefined {
        return this._connectionError;
    }

    get keeWebUrl() {
        return this._keeWebUrl || this._defaultKeeWebUrl;
    }

    init(): Promise<void> {
        this._initPromise ??= new Promise((resolve) => {
            chrome.storage.onChanged.addListener((changes) => this.storageChanged(changes));
            chrome.storage.local.get(['useNativeApp', 'keeWebUrl'], (storageData) => {
                this._useNativeApp = <boolean>(storageData?.useNativeApp ?? true);
                this._keeWebUrl = <string>storageData?.keeWebUrl;
                this.resetStateByConfig();
                this._resolveReady();
                resolve();
            });
        });
        return this._initPromise;
    }

    private async storageChanged(changes: { [prop: string]: chrome.storage.StorageChange }) {
        if (!changes.useNativeApp && !changes.keeWebUrl) {
            return;
        }
        if (changes.useNativeApp) {
            this._useNativeApp = <boolean>(changes.useNativeApp.newValue ?? true);
        }
        if (changes.keeWebUrl) {
            this._keeWebUrl = <string>changes.keeWebUrl.newValue;
        }

        await this.dropTransport();

        this.resetStateByConfig();
        this.rejectPendingRequests('Config changed');
    }

    async connect(): Promise<void> {
        await this._ready;

        if (this.state === BackendConnectionState.Connected) {
            return Promise.resolve();
        }
        if (this.state === BackendConnectionState.Connecting) {
            return new Promise((resolve, reject) =>
                this.once('connect-finished', (e) => {
                    if (e) {
                        reject(e);
                    } else {
                        resolve();
                    }
                })
            );
        }

        // eslint-disable-next-line no-console
        console.log('Connecting to KeeWeb');

        this.rejectPendingRequests('Reconnecting');

        this._connectionError = undefined;
        this.setState(BackendConnectionState.Connecting);
        this.refreshKeepAlive();

        try {
            await this.dropTransport();
            this.initTransport();

            if (!this._transport) {
                throw new Error('Transport not initialized');
            }
            if (!this._protocol) {
                throw new Error('Protocol not initialized');
            }

            await this._transport.connect();
            await this._protocol.changePublicKeys();

            this.setState(BackendConnectionState.Connected);

            // eslint-disable-next-line no-console
            console.log('Connected to KeeWeb');

            this.emit('connect-finished');
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Connect error', e);

            this._connectionError = (<Error>e).message;
            this.setState(BackendConnectionState.Error);

            this.emit('connect-finished', <Error>e);
        } finally {
            this.refreshKeepAlive();
        }
    }

    private async dropTransport() {
        if (this._transport) {
            this._transport.removeAllListeners();
            await this._transport.disconnect().catch(noop);
            this._transport = undefined;
        }
    }

    /** the worker is kept alive only while connecting or while requests are pending */
    private refreshKeepAlive() {
        this._keepAlive.active =
            this._state === BackendConnectionState.Connecting ||
            !!this._currentRequest ||
            this._requestQueue.length > 0;
    }

    private resetStateByConfig() {
        this._connectionError = undefined;

        if (this._state !== undefined) {
            // eslint-disable-next-line no-console
            console.log('Config changed');
        }

        this.setState(BackendConnectionState.ReadyToConnect);
    }

    private initTransport() {
        if (this._useNativeApp) {
            this._transport = new TransportNativeMessaging();
        } else {
            this._transport = new TransportBrowserTab(this._keeWebUrl || this._defaultKeeWebUrl);
        }

        this._transport.on('disconnected', () => {
            // eslint-disable-next-line no-console
            console.log('KeeWeb disconnected');

            if (this.state === BackendConnectionState.Connecting) {
                const msgName = this._useNativeApp
                    ? 'errorConnectionErrorApp'
                    : 'errorConnectionErrorWeb';
                this._connectionError = chrome.i18n.getMessage(msgName);
            } else {
                this._connectionError = chrome.i18n.getMessage('errorKeeWebDisconnected');
            }

            this.setState(BackendConnectionState.Error);

            this.rejectPendingRequests(this._connectionError);
        });

        this._transport.on('message', (msg) => this.transportMessage(msg));

        this._protocol = new ProtocolImpl({ request: (r) => this.request(r) });
    }

    private request(request: KeeWebConnectRequest): Promise<KeeWebConnectResponse> {
        return new Promise((resolve, reject) => {
            const item: RequestQueueItem = {
                request,
                resolve,
                reject,
                timeout: self.setTimeout(() => {
                    // drop exactly this item, whether it is in flight or still queued
                    if (this._currentRequest === item) {
                        this._currentRequest = undefined;
                    } else {
                        const ix = this._requestQueue.indexOf(item);
                        if (ix >= 0) {
                            this._requestQueue.splice(ix, 1);
                        }
                    }
                    const errStr = chrome.i18n.getMessage('errorRequestTimeout');
                    reject(new Error(errStr));
                    this.processRequestQueue();
                }, this._requestTimeoutMillis)
            };

            this._requestQueue.push(item);
            this.processRequestQueue();
        });
    }

    private processRequestQueue() {
        this.processNextRequest();
        this.refreshKeepAlive();
    }

    private processNextRequest() {
        if (this._currentRequest || !this._requestQueue.length) {
            return;
        }
        if (this._state === BackendConnectionState.Connecting) {
            const { request } = this._requestQueue[0];
            const allowedWhileConnecting = request.action === 'change-public-keys';
            if (!allowedWhileConnecting) {
                return;
            }
        } else if (this._state !== BackendConnectionState.Connected) {
            return;
        }
        this._currentRequest = this._requestQueue.shift();
        if (this._currentRequest) {
            this.sendTransportRequest(this._currentRequest.request);
        }
    }

    private sendTransportRequest(request: KeeWebConnectRequest) {
        // eslint-disable-next-line no-console
        console.log('%c-> KW', this._consoleLogStyleOut, request);
        this._transport?.request(request);
    }

    private transportMessage(msg: KeeWebConnectResponse) {
        // eslint-disable-next-line no-console
        console.log('%c<- KW', this._consoleLogStyleIn, msg);

        switch (msg.action) {
            case 'database-locked':
                return;
            case 'database-unlocked':
                return;
            case 'attention-required':
                this.focusKeeWebTab();
                return;
        }

        if (this._currentRequest) {
            clearTimeout(this._currentRequest.timeout);
            this._currentRequest.resolve(msg);
            this._currentRequest = undefined;
        }

        this.processRequestQueue();
    }

    private rejectPendingRequests(error: string) {
        const err = new Error(error);
        if (this._currentRequest) {
            clearTimeout(this._currentRequest.timeout);
            this._currentRequest.reject(err);
            this._currentRequest = undefined;
        }
        for (const req of this._requestQueue) {
            req.reject(err);
        }
        this._requestQueue.length = 0;
        this.refreshKeepAlive();
    }

    private focusKeeWebTab() {
        this._transport?.focusKeeWeb();
    }

    checkConnection() {
        if (this.state === BackendConnectionState.Connected) {
            this._protocol?.ping().catch(noop);
        }
    }

    async getLogins(url: string): Promise<KeeWebConnectGetLoginsResponseEntry[]> {
        this.checkConnection();
        if (!this._protocol) {
            throw new Error('Not connected');
        }
        return this._protocol.getLogins(url);
    }

    async getTotp(url: string, title: string): Promise<string> {
        if (!this._protocol) {
            throw new Error('Not connected');
        }
        return this._protocol.getTotp(url, title);
    }

    async getAnyField(url: string, title: string): Promise<string> {
        if (!this._protocol) {
            throw new Error('Not connected');
        }
        return this._protocol.getAnyField(url, title);
    }
}

const backend = new Backend();

export { backend };
