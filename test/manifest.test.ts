import * as fs from 'fs';
import { describe, expect, it } from 'vitest';

describe('manifest.json', () => {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8')) as {
        manifest_version: number;
        background: unknown;
        key?: string;
        commands: Record<string, { suggested_key?: { default?: string } }>;
    };

    it('is a Manifest V3 service-worker extension', () => {
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.background).toEqual({ service_worker: 'js/background.js' });
    });

    it('does not hard-code a store key', () => {
        expect(manifest.key).toBeUndefined();
    });

    it('declares a default shortcut for submit-auto', () => {
        expect(manifest.commands['submit-auto'].suggested_key?.default).toBeTruthy();
    });
});
