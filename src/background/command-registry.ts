export interface CommandOptions {
    username: boolean;
    password: boolean;
    submit: boolean;
    otp: boolean;
    other: boolean;
}

/** Id of the command that picks the concrete command from the focused field. */
export const AUTO_COMMAND = 'submit-auto';

const none: CommandOptions = {
    username: false,
    password: false,
    submit: false,
    otp: false,
    other: false
};

/**
 * Every command that has a handler. The ids must match manifest.json `commands`
 * and the `cmd*` locale keys (enforced by test/commands-consistency.test.ts).
 */
export const COMMAND_OPTIONS: Readonly<Record<string, CommandOptions>> = {
    [AUTO_COMMAND]: { ...none, submit: true },
    'submit-username-password': { ...none, username: true, password: true, submit: true },
    'insert-username-password': { ...none, username: true, password: true },
    'submit-username': { ...none, username: true, submit: true },
    'insert-username': { ...none, username: true },
    'submit-password': { ...none, password: true, submit: true },
    'insert-password': { ...none, password: true },
    'insert-otp': { ...none, otp: true },
    'insert-other': { ...none, other: true }
};

export const COMMAND_IDS = Object.keys(COMMAND_OPTIONS);

/** `submit-username-password` -> `cmdSubmitUsernamePassword` */
export function commandLocaleKey(id: string): string {
    return (
        'cmd' +
        id
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('')
    );
}
