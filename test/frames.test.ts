import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveFrame } from 'background/frames';
import { installFakeChrome, FakeChrome } from './chrome-fake';

describe('getActiveFrame', () => {
    let fake: FakeChrome;
    beforeEach(() => {
        fake = installFakeChrome();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    const tab = { id: 7, url: 'https://example.com/login' } as chrome.tabs.Tab;

    it('returns the real chrome frameId of the focused frame', async () => {
        fake.scripting.executeScript.mockResolvedValue([
            { frameId: 0, result: { focused: false, url: 'https://example.com/login' } },
            { frameId: 42, result: { focused: true, url: 'https://idp.example.org/form' } }
        ]);
        expect(await getActiveFrame(tab)).toEqual({
            frameId: 42,
            url: 'https://idp.example.org/form'
        });
        const call = fake.scripting.executeScript.mock.calls[0][0] as {
            target: { allFrames: boolean; tabId: number };
        };
        expect(call.target).toEqual({ tabId: 7, allFrames: true });
    });

    it('uses the top frame when nothing is focused', async () => {
        fake.scripting.executeScript.mockResolvedValue([
            { frameId: 0, result: { focused: false, url: 'x' } }
        ]);
        expect(await getActiveFrame(tab)).toEqual({ frameId: 0, url: tab.url });
    });

    it('never returns NaN for malformed results', async () => {
        fake.scripting.executeScript.mockResolvedValue([
            { frameId: NaN, result: { focused: true, url: 'x' } },
            { result: { focused: true, url: 'x' } },
            null
        ]);
        const frame = await getActiveFrame(tab);
        expect(frame.frameId).toBe(0);
    });

    it('falls back to the top frame when injection fails', async () => {
        fake.scripting.executeScript.mockRejectedValue(new Error('Cannot access chrome://'));
        expect(await getActiveFrame(tab)).toEqual({ frameId: 0, url: tab.url });
    });

    it('falls back when the tab has no id', async () => {
        expect(await getActiveFrame({ url: 'https://a.b/' } as chrome.tabs.Tab)).toEqual({
            frameId: 0,
            url: 'https://a.b/'
        });
        expect(fake.scripting.executeScript).not.toHaveBeenCalled();
    });
});
