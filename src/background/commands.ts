import { ContentScriptMessage, ContentScriptReturn } from 'common/content-script-interface';
import { BackendConnectionState } from 'common/backend-connection-state';
import { backend } from './backend';
import { activateTab } from './utils';
import { AUTO_COMMAND, COMMAND_OPTIONS } from './command-registry';
import { getActiveFrame } from './frames';
import { log, reportFailure } from './feedback';

interface CommandArgs {
    command: string;
    tab: chrome.tabs.Tab;
    url?: string;
    frameId?: number;
}

interface Frame {
    id: number;
    url: string;
}

const KNOWN_KEEWEB_ORIGINS = ['https://app.keeweb.info', 'https://beta.keeweb.info'];

function startCommandListener(): void {
    chrome.commands.onCommand.addListener(async (command, tab) => {
        try {
            if (!tab?.id) {
                [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            }
            if (!tab?.id) {
                reportFailure(undefined, 'No active tab');
                return;
            }
            const frame = await getActiveFrame(tab);
            await runCommand({ command, tab, frameId: frame.frameId, url: frame.url ?? tab.url });
        } catch (e) {
            reportFailure(tab?.id, `Unexpected error: ${errorMessage(e)}`);
        }
    });
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

async function runCommand(args: CommandArgs): Promise<void> {
    try {
        await runCommandUnsafe(args);
    } catch (e) {
        reportFailure(args.tab?.id, `Unexpected error: ${errorMessage(e)}`);
    }
}

async function runCommandUnsafe(args: CommandArgs): Promise<void> {
    const options = COMMAND_OPTIONS[args.command];
    if (!options) {
        reportFailure(args.tab?.id, `Unknown command: ${args.command}`);
        return;
    }
    const tabId = args.tab?.id;

    if (args.command === AUTO_COMMAND) {
        const unsupported = unsupportedUrlReason(args.url ?? args.tab.url);
        if (unsupported) {
            reportFailure(tabId, unsupported);
            return;
        }
        const nextCommand = await getNextAutoFillCommand(args);
        if (!nextCommand) {
            reportFailure(tabId, 'Click into a login field first');
            return;
        }
        await runCommandUnsafe(nextCommand);
        return;
    }

    const unsupported = unsupportedUrlReason(args.url);
    if (unsupported || !args.url) {
        reportFailure(tabId, unsupported ?? 'Unknown page address');
        return;
    }
    const frameId = Number.isInteger(args.frameId) && args.frameId! >= 0 ? args.frameId! : 0;

    await backend.connect();
    if (backend.state !== BackendConnectionState.Connected) {
        reportFailure(tabId, 'Not connected to KeeWeb, see the options page');
        void chrome.runtime.openOptionsPage();
        return;
    }

    let text: string | undefined;
    let password: string | undefined;

    try {
        if (options.username || options.password) {
            const [entry] = await backend.getLogins(args.url);

            if (!entry) {
                reportFailure(tabId, 'No KeeWeb entry matches this site');
                return;
            }

            const user = entry.login;
            const pass = entry.password;

            text = options.username ? user : options.password ? pass : undefined;
            password = options.username ? (options.password ? pass : undefined) : undefined;
        } else if (options.otp) {
            text = await backend.getTotp(args.url, args.tab.title || '');
        } else {
            text = await backend.getAnyField(args.url, args.tab.title || '');
        }
    } finally {
        if (tabId) {
            await activateTab(tabId);
        }
    }

    if (!text) {
        reportFailure(tabId, 'KeeWeb returned no value');
        return;
    }

    const resp = await autoFill(args.url, args.tab, frameId, {
        text,
        password,
        submit: options.submit
    });
    if (!resp) {
        reportFailure(tabId, 'Cannot reach the page, check the extension site access');
    } else if (resp.error) {
        reportFailure(tabId, resp.error);
    }
}

/** Returns why the page cannot be filled, or undefined when it can. */
function unsupportedUrlReason(url: string | undefined): string | undefined {
    if (!url || !/^https?:/i.test(url)) {
        return 'Autofill is not available on this page';
    }
    if (isKeeWebUrl(url)) {
        return 'Switch to the page you want to fill, not KeeWeb';
    }
    return undefined;
}

function isKeeWebUrl(url: string): boolean {
    let origin: string;
    try {
        origin = new URL(url).origin;
    } catch {
        return false;
    }
    if (KNOWN_KEEWEB_ORIGINS.includes(origin)) {
        return true;
    }
    try {
        return new URL(backend.keeWebUrl).origin === origin;
    } catch {
        return url.startsWith(backend.keeWebUrl);
    }
}

function isValidUrl(url: string): boolean {
    return unsupportedUrlReason(url) === undefined;
}

async function getNextAutoFillCommand(args: CommandArgs): Promise<CommandArgs | undefined> {
    const frameCount = await injectPageContentScript(args.tab);
    let allFrames: Frame[];
    if (frameCount > 1) {
        allFrames = await getAllFrames(args.tab);
    } else if (args.tab.url) {
        allFrames = [{ id: 0, url: args.tab.url }];
    } else {
        allFrames = [];
    }
    for (const frame of allFrames) {
        if (!isValidUrl(frame.url)) {
            continue;
        }
        const resp = await sendMessageToTab(args.tab, frame.id, {
            action: 'get-next-auto-fill-command',
            url: frame.url
        });
        if (resp?.nextCommand) {
            return {
                command: resp.nextCommand,
                tab: args.tab,
                frameId: frame.id,
                url: frame.url
            };
        }
    }
}

async function getAllFrames(tab: chrome.tabs.Tab): Promise<Frame[]> {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id || 0 });
    if (!frames) {
        throw new Error('Cannot get tab frames: empty frames');
    }
    return frames.map((f) => ({ id: f.frameId, url: f.url }));
}

function autoFill(
    url: string,
    tab: chrome.tabs.Tab,
    frameId: number,
    options: { text?: string; password?: string; submit: boolean }
): Promise<ContentScriptReturn | undefined> {
    return sendMessageToTab(tab, frameId, { action: 'auto-fill', url, ...options });
}

async function sendMessageToTab(
    tab: chrome.tabs.Tab,
    frameId: number,
    message: ContentScriptMessage
): Promise<ContentScriptReturn | undefined> {
    await injectPageContentScript(tab);
    try {
        return (await chrome.tabs.sendMessage(tab.id || 0, message, {
            frameId
        })) as ContentScriptReturn | undefined;
    } catch (e) {
        log(`cannot message frame ${frameId}`, errorMessage(e));
        return undefined;
    }
}

async function injectPageContentScript(tab: chrome.tabs.Tab): Promise<number> {
    try {
        const results = await chrome.scripting.executeScript({
            files: ['js/content-page.js'],
            target: { allFrames: true, tabId: tab.id || 0 }
        });
        return results.length;
    } catch (e) {
        log('cannot inject the page script', errorMessage(e));
        return 0;
    }
}

export { startCommandListener, runCommand };
