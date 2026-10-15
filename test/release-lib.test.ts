import { describe, expect, it } from 'vitest';
import {
    assertProductionBuild,
    bumpSemver,
    checkTagMatchesVersion,
    releaseChangelog
} from '../scripts/release-lib';

describe('bumpSemver', () => {
    it('bumps patch, minor and major', () => {
        expect(bumpSemver('1.2.3', 'patch')).toBe('1.2.4');
        expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0');
        expect(bumpSemver('1.2.3', 'major')).toBe('2.0.0');
    });

    it('rejects non x.y.z versions', () => {
        expect(() => bumpSemver('1.2', 'patch')).toThrow();
        expect(() => bumpSemver('1.2.3-beta', 'patch')).toThrow();
    });
});

describe('releaseChangelog', () => {
    const base =
        '# Changelog\n\n## [Unreleased]\n\n### Added\n- thing\n\n## [1.0.0] - 2026-01-01\n';

    it('dates the unreleased section and opens a new one', () => {
        const out = releaseChangelog(base, '1.0.1', '2026-02-02');
        expect(out).toContain('## [Unreleased]\n\n## [1.0.1] - 2026-02-02\n\n### Added\n- thing');
        expect(out).toContain('## [1.0.0] - 2026-01-01');
    });

    it('fails without an Unreleased section or on a duplicate version', () => {
        expect(() => releaseChangelog('# Changelog\n', '1.0.1', '2026-02-02')).toThrow();
        expect(() => releaseChangelog(base, '1.0.0', '2026-02-02')).toThrow();
    });
});

describe('checkTagMatchesVersion', () => {
    it('accepts v<version> and rejects others', () => {
        expect(() => checkTagMatchesVersion('v1.0.0', '1.0.0')).not.toThrow();
        expect(() => checkTagMatchesVersion('v1.0.1', '1.0.0')).toThrow();
        expect(() => checkTagMatchesVersion('1.0.0', '1.0.0')).toThrow();
    });
});

describe('assertProductionBuild', () => {
    const prod = { content_security_policy: { extension_pages: "default-src 'self'" } };

    it('accepts a production manifest and plain scripts', () => {
        expect(() => assertProductionBuild(prod, { 'a.js': 'var a=1;' })).not.toThrow();
    });

    it('rejects a development CSP and inline source maps', () => {
        const dev = {
            content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" }
        };
        expect(() => assertProductionBuild(dev, {})).toThrow(/unsafe-eval/);
        expect(() =>
            assertProductionBuild(prod, { 'a.js': 'x\n//# sourceMappingURL=data:application/json' })
        ).toThrow(/source map/);
        // library files may reference a map file that is not shipped
        expect(() =>
            assertProductionBuild(prod, { 'a.js': 'x\n//# sourceMappingURL=preact.module.js.map' })
        ).not.toThrow();
    });
});
