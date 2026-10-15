import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

const distDir = path.resolve('dist', 'chrome');
const manifestPath = path.join(distDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
    throw new Error('dist/chrome/manifest.json not found, run "npm run build" first');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { version: string };
const zipName = `keeweb-connect-chrome-${manifest.version}.zip`;
const zipPath = path.resolve('dist', zipName);

fs.rmSync(zipPath, { force: true });
const zip = new AdmZip();
zip.addLocalFolder(distDir);
zip.writeZip(zipPath);

console.log(`Created ${path.relative(process.cwd(), zipPath)}`);
