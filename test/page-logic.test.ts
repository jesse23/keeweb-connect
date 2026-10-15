// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
    autoFill,
    getFocusedElement,
    getNextAutoFillCommand,
    sameDocument
} from 'content/page-logic';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('page-logic', () => {
    it('compares urls by origin and path', () => {
        expect(sameDocument('https://a.b/x?q=1#h', 'https://a.b/x')).toBe(true);
        expect(sameDocument('https://a.b/x', 'https://a.b/y')).toBe(false);
        expect(sameDocument('https://a.b/x', 'http://a.b/x')).toBe(false);
    });

    it('finds the focused element inside an open shadow root', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const input = document.createElement('input');
        root.appendChild(input);
        input.focus();
        expect(getFocusedElement()).toBe(input);
        expect(getNextAutoFillCommand()).toEqual({ nextCommand: 'submit-username' });
    });

    it('picks submit-username-password when a password field follows', () => {
        document.body.innerHTML = '<form><input id="u"><input id="p" type="password"></form>';
        document.getElementById('u')!.focus();
        expect(getNextAutoFillCommand()).toEqual({ nextCommand: 'submit-username-password' });
        document.getElementById('p')!.focus();
        expect(getNextAutoFillCommand()).toEqual({ nextCommand: 'submit-password' });
    });

    it('fills a textarea and reports when nothing is focused', () => {
        document.body.innerHTML = '<textarea id="t"></textarea>';
        expect(autoFill({ action: 'auto-fill', url: '', text: 'x', submit: false }).filled).toBe(
            false
        );
        const t = document.getElementById('t') as HTMLTextAreaElement;
        t.focus();
        expect(getNextAutoFillCommand()).toEqual({ nextCommand: 'insert-other' });
        expect(autoFill({ action: 'auto-fill', url: '', text: 'hello', submit: false })).toEqual({
            filled: true
        });
        expect(t.value).toBe('hello');
    });

    it('fills username and password of a form', () => {
        document.body.innerHTML = '<form><input id="u"><input id="p" type="password"></form>';
        document.getElementById('u')!.focus();
        autoFill({ action: 'auto-fill', url: '', text: 'me', password: 'pw', submit: false });
        expect((document.getElementById('u') as HTMLInputElement).value).toBe('me');
        expect((document.getElementById('p') as HTMLInputElement).value).toBe('pw');
    });
});
