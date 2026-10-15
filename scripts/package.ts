import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { assertProductionBuild } from './release-lib';

const distDir = path.resolve('dist', 'chrome');
const manifestPath = path.join(distDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
    throw new Error('dist/chrome/manifest.json not found, run "npm run build" first');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    version: string;
    content_security_policy?: { extension_pages?: string };
};

const jsDir = path.join(distDir, 'js');
const scripts: Record<string, string> = {};
for (const name of fs.existsSync(jsDir) ? fs.readdirSync(jsDir) : []) {
    if (name.endsWith('.js')) {
        scripts[name] = fs.readFileSync(path.join(jsDir, name), 'utf8');
    }
}
assertProductionBuild(manifest, scripts);

const zipName = `keeweb-connect-chrome-${manifest.version}.zip`;
const zipPath = path.resolve('dist', zipName);

fs.rmSync(zipPath, { force: true });
const zip = new AdmZip();
zip.addLocalFolder(distDir);
zip.writeZip(zipPath);

console.log(`Created ${path.relative(process.cwd(), zipPath)}`);
