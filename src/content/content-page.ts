import { ContentScriptMessage, ContentScriptReturn } from 'common/content-script-interface';
import { autoFill, getNextAutoFillCommand, sameDocument } from './page-logic';

declare global {
    interface Window {
        // not shared with content-keeweb.ts, which uses kwExtensionInstalled
        kwPageScriptInstalled: boolean;
    }
}

if (!window.kwPageScriptInstalled) {
    window.kwPageScriptInstalled = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id) {
            return;
        }
        const msg = message as ContentScriptMessage;
        if (!sameDocument(location.href, msg.url)) {
            return;
        }
        let response: ContentScriptReturn | undefined;
        switch (msg.action) {
            case 'auto-fill':
                response = autoFill(msg);
                break;
            case 'get-next-auto-fill-command':
                response = getNextAutoFillCommand();
                break;
        }
        if (response) {
            sendResponse(response);
        }
    });
}

export {};
