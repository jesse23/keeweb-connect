import * as fs from 'fs';
import { describe, expect, it } from 'vitest';
import { COMMAND_IDS, commandLocaleKey } from 'background/command-registry';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8')) as {
    commands: Record<string, { description: string; suggested_key?: Record<string, string> }>;
};
const locales = fs.readdirSync('_locales');

describe('commands', () => {
    it('manifest ids equal handler ids', () => {
        expect(Object.keys(manifest.commands).sort()).toEqual([...COMMAND_IDS].sort());
    });

    it('every command has a locale string referenced by the manifest, in every locale', () => {
        for (const id of COMMAND_IDS) {
            const key = commandLocaleKey(id);
            expect(manifest.commands[id].description).toBe(`__MSG_${key}__`);
        }
        for (const locale of locales) {
            const messages = JSON.parse(
                fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')
            ) as Record<string, unknown>;
            const keys = Object.keys(messages)
                .filter((k) => /^cmd[A-Z]/.test(k))
                .sort();
            expect(keys, locale).toEqual(COMMAND_IDS.map(commandLocaleKey).sort());
        }
    });

    it('declares at most 4 suggested keys, each with a mac value, none global', () => {
        const keyed = Object.values(manifest.commands).filter((c) => c.suggested_key);
        expect(keyed.length).toBeLessThanOrEqual(4);
        for (const c of keyed) {
            expect(c.suggested_key?.default).toBeTruthy();
            expect(c.suggested_key?.mac).toBeTruthy();
            expect(c.suggested_key).not.toHaveProperty('global');
            expect(c).not.toHaveProperty('global');
        }
    });
});
