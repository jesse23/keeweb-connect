import { TypedEmitter } from 'tiny-typed-emitter';
import { OptionsPageMessage } from 'common/options-page-interface';
import { BackendConnectionState } from 'common/backend-connection-state';
import {
    BackgroundMessageFromPageConnectToKeeWeb,
    BackgroundMessageFromPageOpenTab
} from 'common/background-interface';
import { noop } from 'common/utils';

interface SettingsModelEvents {
    change: () => void;
}

class SettingsModel extends TypedEmitter<SettingsModelEvents> {
    readonly defaultKeeWebUrl = 'https://app.keeweb.info/';

    private _loaded = false;
    private _canAccessKeeWebTab: boolean | undefined;
    private _keeWebUrl: string | undefined;
    private _useNativeApp: boolean | undefined;
    private _backgroundPagePort: chrome.runtime.Port | undefined;
    private _chromeCommands: chrome.commands.Command[] | undefined;
    private _backendConnectionState = BackendConnectionState.Initializing;
    private _backendConnectionError: string | undefined;

    async init() {
        await this.loadStorageConfig();
        await this.checkPermissions();
        await this.connectToBackgroundPage();
        await this.getShortcuts();
        this.initComplete();
    }

    private loadStorageConfig(): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.get(['useNativeApp', 'keeWebUrl'], (result) => {
                this._useNativeApp = <boolean>(result.useNativeApp ?? false);
                this._keeWebUrl = <string>result.keeWebUrl;
                resolve();
            });
        });
    }

    private checkPermissions(): Promise<void> {
        return new Promise((resolve) => {
            chrome.permissions.contains(
                {
                    permissions: ['tabs'],
                    origins: [this.keeWebUrl]
                },
                (canAccessKeeWebTab) => {
                    this._canAccessKeeWebTab = canAccessKeeWebTab;
                    resolve();
                }
            );
        });
    }

    private connectToBackgroundPage(): Promise<void> {
        return new Promise((resolve) => {
            this._backgroundPagePort = chrome.runtime.connect({ name: 'options' });
            this._backgroundPagePort.onMessage.addListener((message) =>
                this.handleMessageFromBackgroundPage(message as OptionsPageMessage)
            );
            resolve();
        });
    }

    private getShortcuts(): Promise<void> {
        return new Promise((resolve) => {
            chrome.commands.getAll((commands) => {
                if (Array.isArray(commands)) {
                    this._chromeCommands = commands;
                }
                resolve();
            });
        });
    }

    private initComplete() {
        this._loaded = true;
        this.emit('change');
    }

    get loaded(): boolean {
        return this._loaded;
    }

    get useNativeApp(): boolean | undefined {
        return this._useNativeApp;
    }

    setUseNativeApp(useNativeApp: boolean) {
        if (!useNativeApp) {
            this.storeUseNativeApp(false);
            return;
        }
        // desktop mode needs nativeMessaging, which is optional: ask when the user picks it
        chrome.permissions.request({ permissions: ['nativeMessaging'] }, (granted) => {
            void chrome.runtime.lastError;
            if (granted) {
                this.storeUseNativeApp(true);
            } else {
                this.emit('change');
            }
        });
    }

    private storeUseNativeApp(useNativeApp: boolean) {
        this._useNativeApp = useNativeApp;
        chrome.storage.local.set({ useNativeApp }, () => this.emit('change'));
    }

    get useWebApp(): boolean {
        return !this._useNativeApp;
    }

    get keeWebUrl(): string {
        return this._keeWebUrl || this.defaultKeeWebUrl;
    }

    setKeeWebUrl(keeWebUrl: string | undefined) {
        if (keeWebUrl === this.defaultKeeWebUrl) {
            keeWebUrl = undefined;
        }
        this._keeWebUrl = keeWebUrl;
        this._canAccessKeeWebTab = undefined;
        (async () => {
            await new Promise<void>((resolve) => {
                if (keeWebUrl) {
                    chrome.storage.local.set({ keeWebUrl }, () => resolve());
                } else {
                    chrome.storage.local.remove(['keeWebUrl'], () => resolve());
                }
            });
            this.emit('change');
            await this.checkPermissions();
            this.emit('change');
        })().catch(noop);
    }

    get keeWebUrlIsSet(): boolean {
        return !!this._keeWebUrl;
    }

    get canAccessKeeWebTab(): boolean | undefined {
        return this._canAccessKeeWebTab;
    }
    askKeeWebTabPermission(): Promise<boolean> {
        return new Promise((resolve) => {
            chrome.permissions.request(
                {
                    permissions: ['tabs'],
                    origins: [this.keeWebUrl]
                },
                (granted) => {
                    if (granted) {
                        this._canAccessKeeWebTab = true;
                        this.emit('change');
                    }
                    resolve(granted);
                }
            );
        });
    }

    /** All user-facing commands, including the ones that have no shortcut assigned. */
    get allShortcuts(): chrome.commands.Command[] {
        return (this._chromeCommands || []).filter((cmd) => cmd.name && !cmd.name.startsWith('_'));
    }

    get shortcuts(): chrome.commands.Command[] {
        return (this._chromeCommands || []).filter((cmd) => cmd.shortcut);
    }

    private handleMessageFromBackgroundPage(message: OptionsPageMessage) {
        if (message.backendConnectionState) {
            this._backendConnectionState = message.backendConnectionState;
            this._backendConnectionError = message.backendConnectionError;
            this.emit('change');
        }
    }

    get backendConnectionState(): BackendConnectionState {
        return this._backendConnectionState;
    }

    get backendConnectionError(): string | undefined {
        return this._backendConnectionError;
    }

    connectToKeeWeb() {
        chrome.tabs.getCurrent((tab) => {
            if (tab?.id) {
                const message: BackgroundMessageFromPageConnectToKeeWeb = {
                    action: 'connect-to-keeweb',
                    activeTabId: tab.id
                };
                this._backgroundPagePort?.postMessage(message);
            }
        });
    }

    openKeeWebTab() {
        const message: BackgroundMessageFromPageOpenTab = {
            action: 'open-tab',
            url: this.keeWebUrl
        };
        this._backgroundPagePort?.postMessage(message);
    }
}

const model = new SettingsModel();

export { model };
