declare global {
    interface Window {
        // distinct from the flag of content-page.ts, so that one script never blocks the other
        kwKeeWebScriptInstalled: boolean;
    }
}

interface KeeWebConnectTabMessage {
    kwConnect?: string;
}

if (!window.kwKeeWebScriptInstalled) {
    window.kwKeeWebScriptInstalled = true;

    chrome.runtime.onConnect.addListener((port) => {
        if (port.sender?.id !== chrome.runtime.id) {
            return;
        }
        if (!port.name) {
            return;
        }

        const onWindowMessage = (e: MessageEvent) => {
            if (e.origin !== location.origin) {
                return;
            }
            if (e.source !== window) {
                return;
            }
            const data = e?.data as KeeWebConnectTabMessage;
            if (data?.kwConnect === 'response') {
                delete data.kwConnect;
                try {
                    port.postMessage(e.data);
                } catch {
                    window.removeEventListener('message', onWindowMessage);
                }
            }
        };

        window.addEventListener('message', onWindowMessage);
        port.onDisconnect.addListener(() => {
            window.removeEventListener('message', onWindowMessage);
        });
        port.onMessage.addListener((msg: KeeWebConnectTabMessage) => {
            if (!msg || typeof msg !== 'object') {
                return;
            }
            msg.kwConnect = 'request';
            window.postMessage(msg, window.location.origin);
        });
    });
}

export {};
