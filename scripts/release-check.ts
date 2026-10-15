/** Usage: ts-node scripts/release-check.ts <tag> -- fails when the tag differs from manifest.json. */
import * as fs from 'fs';
import { checkTagMatchesVersion } from './release-lib';

const tag = process.argv[2];
if (!tag) {
    console.error('Usage: ts-node scripts/release-check.ts <tag>');
    process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8')) as { version: string };
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
if (pkg.version !== manifest.version) {
    throw new Error(
        `package.json (${pkg.version}) and manifest.json (${manifest.version}) versions differ`
    );
}
checkTagMatchesVersion(tag, manifest.version);
console.log(`Tag ${tag} matches manifest.json version ${manifest.version}`);
