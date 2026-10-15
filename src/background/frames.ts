import { log } from './feedback';

export interface ActiveFrame {
    frameId: number;
    url?: string;
}

interface FocusProbe {
    focused: boolean;
    url: string;
}

/** Runs in every frame of the page. Must be self-contained (it is serialized). */
function probeFocus(): FocusProbe {
    let el: Element | null = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    const tag = el?.tagName;
    const focused =
        !!el &&
        tag !== 'BODY' &&
        tag !== 'HTML' &&
        tag !== 'IFRAME' && // focus is inside that child frame, which reports for itself
        tag !== 'FRAME' &&
        document.hasFocus();
    return { focused, url: location.href };
}

function isFrameId(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Finds the frame that holds the focused element, using Chrome's own frameId
 * (not a DOM index). Falls back to the top frame.
 */
export async function getActiveFrame(tab: chrome.tabs.Tab): Promise<ActiveFrame> {
    const fallback: ActiveFrame = { frameId: 0, url: tab.url };
    if (!isFrameId(tab.id)) {
        return fallback;
    }
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: probeFocus
        });
        for (const r of results ?? []) {
            const probe = r?.result as FocusProbe | undefined;
            if (probe?.focused && isFrameId(r.frameId)) {
                return { frameId: r.frameId, url: probe.url || tab.url };
            }
        }
    } catch (e) {
        log('cannot detect the focused frame, using the top frame', e);
    }
    return fallback;
}
