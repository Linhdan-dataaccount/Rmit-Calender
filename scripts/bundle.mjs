import {readFile, writeFile} from 'node:fs/promises';

const assets = Object.fromEntries(await Promise.all(
  [['index.html','text/html'], ['style.css','text/css'], ['app.js','text/javascript'], ['calendar.js','text/javascript']]
    .map(async ([name,type]) => ['/'+name, {type: type+'; charset=utf-8', body: await readFile(new URL('../web/'+name, import.meta.url),'utf8')}])
));
const worker = await readFile(new URL('../worker/index.js', import.meta.url),'utf8');
await writeFile(new URL('../dist/server/index.js', import.meta.url),'const ASSETS = '+JSON.stringify(assets)+';\n'+worker);
