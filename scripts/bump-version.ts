import * as fs from 'fs';

const releaseNotes = fs.readFileSync('release-notes.md', 'utf8');
const match = /^#####\s+v(\d+\.\d+\.\d+)\s/m.exec(releaseNotes);

if (!match) {
    throw new Error('Cannot find version in release notes');
}
const version = match[1];

console.log('Version:', version);

replaceInJson('package.json');
replaceInJson('package-lock.json');
replaceInJson('manifest.json');

console.log('Done');

function replaceInJson(fileName: string) {
    replaceInText(fileName, (json) => {
        const data = JSON.parse(json) as { version: string };
        data.version = version;
        return JSON.stringify(data, null, 2);
    });
}

function replaceInText(fileName: string, replace: (data: string) => string) {
    const data = fs.readFileSync(fileName, 'utf8');
    fs.writeFileSync(fileName, replace(data));
}
