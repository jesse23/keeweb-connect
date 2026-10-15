import * as fs from 'fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
    version: string;
    commands: Record<string, { suggested_key?: { default?: string; mac?: string } }>;
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8')) as Manifest;

describe('versions', () => {
    it('package.json, package-lock.json and manifest.json agree', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
        const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')) as {
            version: string;
            packages: Record<string, { version: string }>;
        };
        expect(pkg.version).toBe(manifest.version);
        expect(lock.version).toBe(manifest.version);
        expect(lock.packages[''].version).toBe(manifest.version);
    });
});

describe('README keyboard shortcuts table', () => {
    const readme = fs.readFileSync('README.md', 'utf8');
    const rows = new Map<string, string>();
    for (const m of readme.matchAll(/^\|\s*`([a-z-]+)`\s*\|[^|]*\|([^|]*)\|/gm)) {
        rows.set(m[1], m[2].trim());
    }

    it('lists every manifest command', () => {
        expect([...rows.keys()].sort()).toEqual(Object.keys(manifest.commands).sort());
    });

    it.each(Object.entries(manifest.commands))('matches the default key of %s', (name, cmd) => {
        const key = cmd.suggested_key?.default;
        const cell = rows.get(name) ?? '';
        if (key) {
            expect(cell).toContain(`\`${key}\``);
        } else {
            expect(cell).toMatch(/unbound/);
        }
    });
});
