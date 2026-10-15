import { vi } from 'vitest';

export interface FakeChrome {
    scripting: { executeScript: ReturnType<typeof vi.fn> };
    tabs: {
        sendMessage: ReturnType<typeof vi.fn>;
        query: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    webNavigation: { getAllFrames: ReturnType<typeof vi.fn> };
    action: {
        setBadgeText: ReturnType<typeof vi.fn>;
        setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
        setTitle: ReturnType<typeof vi.fn>;
    };
    runtime: { openOptionsPage: ReturnType<typeof vi.fn>; id: string };
    i18n: { getMessage: (k: string) => string };
}

export function installFakeChrome(): FakeChrome {
    const fake: FakeChrome = {
        scripting: { executeScript: vi.fn().mockResolvedValue([]) },
        tabs: {
            sendMessage: vi.fn().mockResolvedValue(undefined),
            query: vi.fn().mockResolvedValue([]),
            update: vi.fn((_id: number, _props: unknown, cb?: () => void) => cb?.())
        },
        webNavigation: { getAllFrames: vi.fn().mockResolvedValue([]) },
        action: {
            setBadgeText: vi.fn().mockResolvedValue(undefined),
            setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
            setTitle: vi.fn().mockResolvedValue(undefined)
        },
        runtime: { openOptionsPage: vi.fn(), id: 'test-id' },
        i18n: { getMessage: (k) => k }
    };
    (globalThis as unknown as { chrome: unknown }).chrome = fake;
    return fake;
}
