import type { Frame } from '@playwright/test';
import { expect, test, VAULT, type Extension, type FrameMode } from './fixtures';

/**
 * Every manifest command, driven through chrome.commands.onCommand, on a login form in the
 * top frame, in a same-origin iframe and in a cross-origin iframe (another site and origin).
 * The expected effect is asserted on the form fields themselves.
 */

interface Expectation {
    /** field to focus before the shortcut */
    focus: '#user' | '#pass' | '#other';
    user?: string;
    pass?: string;
    other?: string;
    /** the form is submitted */
    submit: boolean;
}

const EXPECTED: Record<string, Expectation> = {
    'submit-auto': { focus: '#user', user: VAULT.login, pass: VAULT.password, submit: true },
    'submit-username-password': {
        focus: '#user',
        user: VAULT.login,
        pass: VAULT.password,
        submit: true
    },
    'insert-username-password': {
        focus: '#user',
        user: VAULT.login,
        pass: VAULT.password,
        submit: false
    },
    'submit-username': { focus: '#user', user: VAULT.login, submit: true },
    'insert-username': { focus: '#user', user: VAULT.login, submit: false },
    'submit-password': { focus: '#pass', pass: VAULT.password, submit: true },
    'insert-password': { focus: '#pass', pass: VAULT.password, submit: false },
    'insert-otp': { focus: '#user', user: VAULT.totp, submit: false },
    'insert-other': { focus: '#other', other: VAULT.other, submit: false }
};

const MODES: FrameMode[] = ['top', 'same-origin', 'cross-origin'];

const submitCount = (frame: Frame) =>
    frame.evaluate(() => (window as unknown as { __submits: unknown[] }).__submits.length);

test('the table covers every command in the manifest', ({ ext }: { ext: Extension }) => {
    expect(ext.manifestCommands().sort()).toEqual(Object.keys(EXPECTED).sort());
});

for (const mode of MODES) {
    test.describe(`${mode} frame`, () => {
        for (const [command, want] of Object.entries(EXPECTED)) {
            test(command, async ({ ext }) => {
                // a warm KeeWeb tab keeps these tests about the shortcut, not the connection
                await ext.openKeeWeb();
                const { page, frame } = await ext.openLogin(mode);
                await frame.locator(want.focus).focus();

                await ext.fireCommand(command, page);

                const field = (id: string) => frame.locator(id);
                if (want.user !== undefined) {
                    await expect(field('#user')).toHaveValue(want.user);
                }
                if (want.pass !== undefined) {
                    await expect(field('#pass')).toHaveValue(want.pass);
                }
                if (want.other !== undefined) {
                    await expect(field('#other')).toHaveValue(want.other);
                }
                if (want.user === undefined) {
                    await expect(field('#user')).toHaveValue('');
                }
                if (want.pass === undefined) {
                    await expect(field('#pass')).toHaveValue('');
                }
                if (want.submit) {
                    await expect.poll(() => submitCount(frame)).toBe(1);
                } else {
                    expect(await submitCount(frame)).toBe(0);
                }
                // the worker must have reported nothing (afterwards the fixture also fails on
                // any error or unhandled rejection, e.g. frameId NaN)
                expect(ext.unexpectedLogs()).toEqual([]);
            });
        }
    });
}
