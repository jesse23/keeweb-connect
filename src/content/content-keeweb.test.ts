import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEvent } from '../testing/fake-chrome';

type AnyFn = (...args: any[]) => void; // eslint-disable-line @typescript-eslint/no-explicit-any

interface TestPort {
    name: string;
    sender: { id: string };
    postMessage: ReturnType<typeof vi.fn>;
    onMessage: FakeEvent<AnyFn>;
    onDisconnect: FakeEvent<AnyFn>;
}

const ORIGIN = 'https://app.keeweb.info';

let windowListeners: Map<string, Set<AnyFn>>;
let onConnect: FakeEvent<(port: TestPort) => void>;
let fakeWindow: Record<string, unknown>;
let postMessage: ReturnType<typeof vi.fn>;

function makePort(name = 'p1'): TestPort {
    return {
        name,
        sender: { id: 'ext' },
        postMessage: vi.fn(),
        onMessage: new FakeEvent<AnyFn>(),
        onDisconnect: new FakeEvent<AnyFn>()
    };
}

function windowMessage(data: unknown, origin = ORIGIN, source: unknown = fakeWindow) {
    for (const fn of windowListeners.get('message') ?? []) {
        fn({ data, origin, source });
    }
}

async function loadScript() {
    vi.resetModules();
    await import('./content-keeweb');
}

beforeEach(() => {
    windowListeners = new Map();
    onConnect = new FakeEvent();
    postMessage = vi.fn();
    fakeWindow = {
        location: { origin: ORIGIN },
        addEventListener: (type: string, fn: AnyFn) => {
            if (!windowListeners.has(type)) {
                windowListeners.set(type, new Set());
            }
            windowListeners.get(type)!.add(fn);
        },
        removeEventListener: (type: string, fn: AnyFn) => windowListeners.get(type)?.delete(fn),
        postMessage
    };
    const g = globalThis as Record<string, unknown>;
    g.window = fakeWindow;
    g.location = fakeWindow.location;
    g.chrome = { runtime: { id: 'ext', onConnect } };
});

afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.window;
    delete g.location;
    delete g.chrome;
    vi.restoreAllMocks();
});

describe('content-keeweb', () => {
    it('is not blocked by the flag of the content-page script', async () => {
        fakeWindow.kwExtensionInstalled = true;
        fakeWindow.kwPageScriptInstalled = true;
        await loadScript();
        expect(onConnect.listeners.size).toBe(1);
        expect(fakeWindow.kwKeeWebScriptInstalled).toBe(true);
    });

    it('is idempotent: a second injection does not add a second listener', async () => {
        await loadScript();
        await loadScript();
        expect(onConnect.listeners.size).toBe(1);
    });

    it('forwards port messages to the page as requests', async () => {
        await loadScript();
        const port = makePort();
        onConnect.fire(port);

        port.onMessage.fire({ action: 'ping', data: 'p1' });

        expect(postMessage).toHaveBeenCalledWith(
            { action: 'ping', data: 'p1', kwConnect: 'request' },
            ORIGIN
        );
    });

    it('forwards page responses to the port and strips the marker', async () => {
        await loadScript();
        const port = makePort();
        onConnect.fire(port);

        windowMessage({ kwConnect: 'response', action: 'ping', data: 'p1' });

        expect(port.postMessage).toHaveBeenCalledWith({ action: 'ping', data: 'p1' });
    });

    it('ignores messages from other origins, other sources and requests', async () => {
        await loadScript();
        const port = makePort();
        onConnect.fire(port);

        windowMessage({ kwConnect: 'response' }, 'https://evil.example');
        windowMessage({ kwConnect: 'response' }, ORIGIN, {});
        windowMessage({ kwConnect: 'request' });

        expect(port.postMessage).not.toHaveBeenCalled();
    });

    it('rejects ports from other extensions and unnamed ports', async () => {
        await loadScript();
        const foreign = makePort();
        foreign.sender = { id: 'other' };
        const unnamed = makePort('');
        onConnect.fire(foreign);
        onConnect.fire(unnamed);

        windowMessage({ kwConnect: 'response' });

        expect(foreign.postMessage).not.toHaveBeenCalled();
        expect(unnamed.postMessage).not.toHaveBeenCalled();
    });

    it('stops forwarding after the port disconnected', async () => {
        await loadScript();
        const port = makePort();
        onConnect.fire(port);
        port.onDisconnect.fire();

        windowMessage({ kwConnect: 'response' });

        expect(port.postMessage).not.toHaveBeenCalled();
    });
});
