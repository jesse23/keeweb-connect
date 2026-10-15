/** Usage: ts-node scripts/set-version.ts <x.y.z> -- stamps manifest.json (package.json is set by npm version). */
import * as fs from 'fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('Usage: ts-node scripts/set-version.ts <x.y.z>');
    process.exit(1);
}
const raw = fs.readFileSync('manifest.json', 'utf8');
const updated = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
if (updated === raw && !raw.includes(`"version": "${version}"`)) {
    throw new Error('manifest.json has no version field to update');
}
fs.writeFileSync('manifest.json', updated);
console.log(`manifest.json version set to ${version}`);
