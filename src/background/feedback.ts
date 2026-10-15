export const LOG_PREFIX = '[KeeWeb Connect]';
const BADGE_TIMEOUT_MS = 5000;

export function log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.warn(LOG_PREFIX, ...args);
}

const clearTimers = new Map<number, ReturnType<typeof setTimeout>>();
const GLOBAL_KEY = -1;

/**
 * Never fail silently: log the reason and show a "!" badge with a tooltip for a few seconds.
 * Needs no extra permission (chrome.action is always available).
 */
export function reportFailure(tabId: number | undefined, reason: string): void {
    log(reason);
    const validTabId = typeof tabId === 'number' && Number.isInteger(tabId) ? tabId : undefined;
    const target: { tabId?: number } = validTabId === undefined ? {} : { tabId: validTabId };
    const key = validTabId ?? GLOBAL_KEY;
    const defaultTitle = chrome.i18n?.getMessage?.('cmdSubmitAuto') || 'KeeWeb Connect';
    try {
        void Promise.resolve(chrome.action.setBadgeText({ text: '!', ...target })).catch(() => {});
        void Promise.resolve(
            chrome.action.setBadgeBackgroundColor({ color: '#c0392b', ...target })
        ).catch(() => {});
        void Promise.resolve(
            chrome.action.setTitle({ title: `KeeWeb Connect: ${reason}`, ...target })
        ).catch(() => {});
    } catch (e) {
        log('cannot set badge', e);
        return;
    }
    const prev = clearTimers.get(key);
    if (prev) {
        clearTimeout(prev);
    }
    clearTimers.set(
        key,
        setTimeout(() => {
            clearTimers.delete(key);
            try {
                void Promise.resolve(chrome.action.setBadgeText({ text: '', ...target })).catch(
                    () => {}
                );
                void Promise.resolve(
                    chrome.action.setTitle({ title: defaultTitle, ...target })
                ).catch(() => {});
            } catch {
                // the tab may be gone
            }
        }, BADGE_TIMEOUT_MS)
    );
}
