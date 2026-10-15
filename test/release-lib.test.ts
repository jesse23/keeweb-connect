import { describe, expect, it } from 'vitest';
import { assertProductionBuild } from '../scripts/release-lib';

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
