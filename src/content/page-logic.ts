import { ContentScriptMessageAutoFill, ContentScriptReturn } from 'common/content-script-interface';

type TextField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit'
]);

/** document.activeElement, descending into open shadow roots. Null for frames and body. */
export function getFocusedElement(root: Document = document): HTMLElement | null {
    let el: Element | null = root.activeElement;
    while (el?.shadowRoot?.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    if (!el || el === root.body || el === root.documentElement) {
        return null;
    }
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
        return null;
    }
    return el as HTMLElement;
}

export function isFillable(el: Element | null): el is TextField {
    if (!el) {
        return false;
    }
    if (el.tagName === 'INPUT') {
        return !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
    }
    if (el.tagName === 'TEXTAREA') {
        return !(el as HTMLTextAreaElement).readOnly;
    }
    return (el as HTMLElement).isContentEditable === true;
}

/** Same page when origin and path match; query string and hash may differ (SPAs, redirects). */
export function sameDocument(a: string, b: string): boolean {
    try {
        const ua = new URL(a);
        const ub = new URL(b);
        return ua.origin === ub.origin && ua.pathname === ub.pathname;
    } catch {
        return a === b;
    }
}

export function getNextAutoFillCommand(): ContentScriptReturn | undefined {
    const el = getFocusedElement();
    if (!isFillable(el)) {
        return undefined;
    }
    if (el.tagName !== 'INPUT') {
        // a textarea or an editable region is rarely a login field: let the user pick a field
        return { nextCommand: 'insert-other' };
    }
    const input = el as HTMLInputElement;
    if (input.type === 'password') {
        return { nextCommand: 'submit-password' };
    }
    return {
        nextCommand: getNextFormPasswordInput(input)
            ? 'submit-username-password'
            : 'submit-username'
    };
}

export function autoFill(arg: ContentScriptMessageAutoFill): ContentScriptReturn {
    const { text, password, submit } = arg;
    if (!text) {
        return { filled: false, error: 'Nothing to fill' };
    }
    const el = getFocusedElement();
    if (!isFillable(el)) {
        return { filled: false, error: 'Click into a text field first' };
    }

    setFieldText(el, text);

    const form = (el as HTMLInputElement).form ?? null;

    if (password) {
        const passInput =
            el.tagName === 'INPUT' ? getNextFormPasswordInput(el as HTMLInputElement) : undefined;
        if (!passInput) {
            return { filled: true, error: 'No password field found after this field' };
        }
        passInput.focus();
        setFieldText(passInput, password);
    }

    if (form && submit) {
        submitForm(form);
    }
    return { filled: true };
}

function setFieldText(el: TextField, text: string): void {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const input = el as HTMLInputElement;
        input.value = text;
    } else {
        el.focus();
        const selection = el.ownerDocument.getSelection();
        selection?.selectAllChildren(el);
        if (!el.ownerDocument.execCommand?.('insertText', false, text)) {
            el.textContent = text;
        }
    }
    el.dispatchEvent(
        new InputEvent('input', { inputType: 'insertFromPaste', data: text, bubbles: true })
    );
    el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function getNextFormPasswordInput(input: HTMLInputElement): HTMLInputElement | undefined {
    if (!input.form) {
        const root = input.getRootNode() as Document | ShadowRoot;
        const inputs = [...root.querySelectorAll('input')];
        if (!inputs.includes(input)) {
            return undefined;
        }
        for (let ix = inputs.indexOf(input) + 1; ix < inputs.length; ix++) {
            const nextInput = inputs[ix];
            if (nextInput.form) {
                return undefined;
            }
            switch (nextInput.type) {
                case 'password':
                    return nextInput;
                case 'checkbox':
                case 'hidden':
                    continue;
                default:
                    return undefined;
            }
        }
        return undefined;
    }
    let found = false;
    for (const element of input.form.elements) {
        if (
            found &&
            element.tagName === 'INPUT' &&
            (element as HTMLInputElement).type === 'password'
        ) {
            return element as HTMLInputElement;
        }
        if (element === input) {
            found = true;
        }
    }
    return undefined;
}

function submitForm(form: HTMLFormElement): void {
    const submitButton = form.querySelector<HTMLInputElement>(
        'input[type=submit],button[type=submit]'
    );
    if (typeof form.requestSubmit === 'function') {
        form.requestSubmit(submitButton);
    } else if (submitButton) {
        submitButton.click();
    } else {
        const btn = document.createElement('input');
        btn.type = 'submit';
        btn.hidden = true;
        form.appendChild(btn);
        btn.click();
        form.removeChild(btn);
    }
}
