/**
 * Keeps the MV3 service worker alive while there is pending work.
 *
 * Any extension API call resets the worker's idle timer, so a cheap call on an interval is
 * enough. It runs only while at least one request or connection attempt is pending and is
 * stopped as soon as the work is done, so an idle worker can be suspended as usual.
 * Nothing is persisted: keys and session stay in memory and are re-negotiated after a wake.
 */
class KeepAlive {
    private _timer: ReturnType<typeof setInterval> | undefined;

    constructor(private readonly _intervalMillis = 20000) {}

    get running(): boolean {
        return this._timer !== undefined;
    }

    set active(active: boolean) {
        if (active && this._timer === undefined) {
            this._timer = setInterval(() => KeepAlive.touch(), this._intervalMillis);
        } else if (!active && this._timer !== undefined) {
            clearInterval(this._timer);
            this._timer = undefined;
        }
    }

    private static touch() {
        try {
            chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
        } catch {
            // the worker is going away anyway
        }
    }
}

export { KeepAlive };
