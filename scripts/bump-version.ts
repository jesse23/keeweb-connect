/**
 * Usage: npm run bump -- <patch|minor|major>
 *
 * Updates package.json, package-lock.json and manifest.json to the next version and rolls the
 * "Unreleased" section of CHANGELOG.md into a dated release section. Offline, touches no git state.
 */
import * as fs from 'fs';
import { bumpSemver, isBumpKind, releaseChangelog } from './release-lib';

const kind = process.argv[2];
if (!isBumpKind(kind)) {
    console.error('Usage: npm run bump -- <patch|minor|major>');
    process.exit(1);
}

const manifest = readJson('manifest.json');
const next = bumpSemver(String(manifest.version), kind);
const date = new Date().toISOString().slice(0, 10);

// Compute everything first so a failure (e.g. a malformed changelog) leaves the tree untouched.
const changelog = releaseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'), next, date);

setVersion('package.json', next);
setVersion('manifest.json', next);
// package-lock.json carries the version twice: top level and packages[""]
setVersion('package-lock.json', next, 2);
fs.writeFileSync('CHANGELOG.md', changelog);

console.log(`Version: ${String(manifest.version)} -> ${next}`);
console.log('Next: review the diff, commit, then `git tag v' + next + '` and push the tag.');

function readJson(fileName: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(fileName, 'utf8')) as Record<string, unknown>;
}

/** Textual replace of the first `count` "version" keys, so the file's formatting is untouched. */
function setVersion(fileName: string, version: string, count = 1): void {
    let replaced = 0;
    const text = fs
        .readFileSync(fileName, 'utf8')
        .replace(/^( *"version": ")[^"]*(")/gm, (m, a, b) =>
            replaced++ < count ? `${a}${version}${b}` : m
        );
    if (replaced < count) {
        throw new Error(`${fileName}: expected ${count} "version" keys, found ${replaced}`);
    }
    fs.writeFileSync(fileName, text);
}
