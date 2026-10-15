/* eslint-disable import-x/first, import-x/order */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeChrome, FakeChrome } from './chrome-fake';

const backendMock = vi.hoisted(() => ({
    keeWebUrl: 'https://app.keeweb.info/',
    state: 'connected',
    connect: vi.fn().mockResolvedValue(undefined),
    getLogins: vi.fn().mockResolvedValue([] as { login: string; password: string }[]),
    getTotp: vi.fn().mockResolvedValue(''),
    getAnyField: vi.fn().mockResolvedValue('')
}));
vi.mock('background/backend', () => ({ backend: backendMock }));
vi.mock('common/backend-connection-state', () => ({
    BackendConnectionState: { Connected: 'connected' }
}));

import { runCommand } from 'background/commands';

describe('runCommand early returns', () => {
    let fake: FakeChrome;
    beforeEach(() => {
        vi.useFakeTimers();
        fake = installFakeChrome();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        backendMock.state = 'connected';
        backendMock.getLogins.mockReset().mockResolvedValue([]);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    const mkTab = (url: string) => ({ id: 3, url, title: 't' }) as chrome.tabs.Tab;

    it('shows a badge on non-http pages and clears it after a few seconds', async () => {
        await runCommand({
            command: 'insert-password',
            tab: mkTab('chrome://extensions'),
            url: 'chrome://extensions',
            frameId: 0
        });
        expect(fake.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 3 });
        const title = fake.action.setTitle.mock.calls[0][0] as { title: string };
        expect(title.title).toMatch(/not available/i);
        await vi.advanceTimersByTimeAsync(5001);
        expect(fake.action.setBadgeText).toHaveBeenLastCalledWith({ text: '', tabId: 3 });
        expect(backendMock.connect).not.toHaveBeenCalled();
    });

    it('refuses the KeeWeb tab itself and does not inject into it', async () => {
        const url = 'https://beta.keeweb.info/#x';
        await runCommand({ command: 'submit-auto', tab: mkTab(url), url });
        expect(fake.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 3 });
        expect(fake.scripting.executeScript).not.toHaveBeenCalled();
    });

    it('reports when auto-fill finds no focused field', async () => {
        const url = 'https://example.com/login';
        fake.scripting.executeScript.mockResolvedValue([{ frameId: 0 }]);
        await runCommand({ command: 'submit-auto', tab: mkTab(url), url });
        expect(fake.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 3 });
    });

    it('reports an unknown command', async () => {
        await runCommand({ command: 'nope', tab: mkTab('https://a.b/'), url: 'https://a.b/' });
        expect(fake.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 3 });
    });

    it('reports when there is no matching entry', async () => {
        const url = 'https://example.com/login';
        await runCommand({ command: 'insert-username', tab: mkTab(url), url, frameId: 0 });
        const title = fake.action.setTitle.mock.calls[0][0] as { title: string };
        expect(title.title).toMatch(/no keeweb entry/i);
    });

    it('sends a real integer frameId, falling back to 0 for NaN', async () => {
        const url = 'https://example.com/login';
        backendMock.getLogins.mockResolvedValue([{ login: 'u', password: 'p' }]);
        fake.tabs.sendMessage.mockResolvedValue({ filled: true });
        await runCommand({ command: 'insert-username', tab: mkTab(url), url, frameId: NaN });
        const opts = fake.tabs.sendMessage.mock.calls[0][2] as { frameId: number };
        expect(opts.frameId).toBe(0);
        await runCommand({ command: 'insert-username', tab: mkTab(url), url, frameId: 5 });
        expect((fake.tabs.sendMessage.mock.calls[1][2] as { frameId: number }).frameId).toBe(5);
        expect(fake.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('reports when the page cannot be reached', async () => {
        const url = 'https://example.com/login';
        backendMock.getLogins.mockResolvedValue([{ login: 'u', password: 'p' }]);
        fake.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));
        await runCommand({ command: 'insert-username', tab: mkTab(url), url, frameId: 0 });
        expect(fake.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 3 });
    });

    it('reports and opens options when not connected', async () => {
        backendMock.state = 'error';
        const url = 'https://example.com/login';
        await runCommand({ command: 'insert-username', tab: mkTab(url), url, frameId: 0 });
        expect(fake.runtime.openOptionsPage).toHaveBeenCalled();
        expect(fake.action.setBadgeText).toHaveBeenCalledWith({ text: '!', tabId: 3 });
    });
});
