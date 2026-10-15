import { noop } from 'common/utils';
import { backend } from './backend';
import { bindContextMenuClick, bindExtensionButtonClick, createContextMenus } from './ui';
import { startInternalIpc } from './internal-ipc';
import { startCommandListener } from './commands';

let startPromise: Promise<void>;

chrome.runtime.onStartup.addListener(startAndReportError);
chrome.runtime.onInstalled.addListener((e) => {
    // context menus persist across service worker restarts: (re)create them on install/update only
    createContextMenus();
    startAndReportError()
        .then(() => {
            if ((e.reason as string) === 'install') {
                void chrome.runtime.openOptionsPage();
            }
        })
        .catch(noop);
});

startAndReportError().catch(noop);

function startAndReportError(): Promise<void> {
    if (startPromise !== undefined) {
        return startPromise;
    }
    startPromise = start().catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Startup error', e);
    });
    return startPromise;
}

async function start() {
    startCommandListener();
    bindContextMenuClick();
    bindExtensionButtonClick();
    startInternalIpc();

    await backend.init();
}
