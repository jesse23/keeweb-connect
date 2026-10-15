import { runCommand } from './commands';
import { reportFailure } from './feedback';

export function bindContextMenuClick(): void {
    chrome.contextMenus.onClicked.addListener(async (e, tab) => {
        if (!e.editable || !tab || !e.menuItemId) {
            return;
        }

        const command = e.menuItemId as string;
        if (command === 'settings') {
            void chrome.runtime.openOptionsPage();
            return;
        }

        const url = e.frameId ? e.frameUrl : e.pageUrl;
        const frameId = e.frameId ?? 0;

        await runCommand({ command, tab, url, frameId });
    });
}

/** menus outlive the service worker, so they are created once, on install and update */
export function createContextMenus(): void {
    // drop old ones first: after an update titles may differ, and duplicate ids fail
    chrome.contextMenus.removeAll(createMenuItems);
}

function createMenuItems(): void {
    const submitSuffix = ' ⏎';
    const ellipsis = '…';

    chrome.contextMenus.create(
        {
            id: 'keeweb-options',
            title: 'KeeWeb',
            contexts: ['editable']
        },
        () => {
            chrome.contextMenus.create({
                id: 'submit-username-password',
                parentId: 'keeweb-options',
                title: `${chrome.i18n.getMessage('cmdSubmitUsernamePassword')}${submitSuffix}`,
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'insert-username-password',
                parentId: 'keeweb-options',
                title: chrome.i18n.getMessage('cmdInsertUsernamePassword'),
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'submit-username',
                parentId: 'keeweb-options',
                title: `${chrome.i18n.getMessage('cmdSubmitUsername')}${submitSuffix}`,
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'insert-username',
                parentId: 'keeweb-options',
                title: chrome.i18n.getMessage('cmdInsertUsername'),
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'submit-password',
                parentId: 'keeweb-options',
                title: `${chrome.i18n.getMessage('cmdSubmitPassword')}${submitSuffix}`,
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'insert-password',
                parentId: 'keeweb-options',
                title: chrome.i18n.getMessage('cmdInsertPassword'),
                contexts: ['editable']
            });

            chrome.contextMenus.create({
                id: 'sep-bottom',
                type: 'separator',
                parentId: 'keeweb-options',
                contexts: ['editable']
            });

            chrome.contextMenus.create({
                id: 'insert-otp',
                parentId: 'keeweb-options',
                title: chrome.i18n.getMessage('cmdInsertOtp'),
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'insert-other',
                parentId: 'keeweb-options',
                title: `${chrome.i18n.getMessage('menuOtherOptions')}${ellipsis}`,
                contexts: ['editable']
            });
            chrome.contextMenus.create({
                id: 'settings',
                parentId: 'keeweb-options',
                title: chrome.i18n.getMessage('menuSettings'),
                contexts: ['editable']
            });
        }
    );
}

export function bindExtensionButtonClick(): void {
    chrome.action.onClicked.addListener(async (tab) => {
        if (!tab?.id) {
            reportFailure(undefined, 'No active tab');
            return;
        }
        await runCommand({ command: 'submit-auto', tab, url: tab.url });
    });
}
