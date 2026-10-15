/**
 * Throws when a built manifest or its scripts are not a production build: the development
 * build relaxes the CSP with 'unsafe-eval' and embeds inline source maps, and the Web Store
 * rejects both.
 */
export function assertProductionBuild(
    manifest: { content_security_policy?: { extension_pages?: string } },
    scripts: Record<string, string>
): void {
    const csp = manifest.content_security_policy?.extension_pages ?? '';
    if (csp.includes('unsafe-eval')) {
        throw new Error(
            `dist manifest CSP contains 'unsafe-eval' (${csp}), run "npm run build" first`
        );
    }
    for (const [name, content] of Object.entries(scripts)) {
        if (/^\/\/# sourceMappingURL=data:/m.test(content)) {
            throw new Error(`${name} has an inline source map, run "npm run build" first`);
        }
    }
}
