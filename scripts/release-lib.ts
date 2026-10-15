export type BumpKind = 'patch' | 'minor' | 'major';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isBumpKind(value: string | undefined): value is BumpKind {
    return value === 'patch' || value === 'minor' || value === 'major';
}

export function bumpSemver(version: string, kind: BumpKind): string {
    const match = SEMVER.exec(version);
    if (!match) {
        throw new Error(`Not a plain x.y.z version: ${version}`);
    }
    const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (kind === 'major') {
        return `${major + 1}.0.0`;
    }
    if (kind === 'minor') {
        return `${major}.${minor + 1}.0`;
    }
    return `${major}.${minor}.${patch + 1}`;
}

/**
 * Turn the "Unreleased" section into a dated release section and open a fresh, empty
 * "Unreleased" section above it.
 */
export function releaseChangelog(changelog: string, version: string, date: string): string {
    const heading = /^## \[Unreleased\][ \t]*$/m;
    if (!heading.test(changelog)) {
        throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
    }
    if (changelog.includes(`## [${version}]`)) {
        throw new Error(`CHANGELOG.md already has a section for ${version}`);
    }
    return changelog.replace(heading, `## [Unreleased]\n\n## [${version}] - ${date}`);
}

/** Tags look like v1.2.3 and must equal the manifest version. */
export function checkTagMatchesVersion(tag: string, manifestVersion: string): void {
    const expected = `v${manifestVersion}`;
    if (tag !== expected) {
        throw new Error(
            `Tag ${tag} does not match manifest.json version ${manifestVersion} (expected ${expected})`
        );
    }
}
