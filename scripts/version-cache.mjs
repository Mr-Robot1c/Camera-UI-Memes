import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const hash = createHash('sha256').update(await readFile('dist/index.html')).update(await readFile('dist/sw.js')).digest('hex').slice(0,12);
const sw = (await readFile('dist/sw.js','utf8')).replace('itsgiving-static-v1', `itsgiving-static-${hash}`);
await writeFile('dist/sw.js',sw);
