import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function injectQuotaBridge(html) {
  if (html.includes('src="/quota-ui/bridge.js"')) return html;
  if (!html.includes('</head>')) throw new Error('SPA entry has no closing head tag');
  return html.replace('</head>','<script defer src="/quota-ui/bridge.js"></script>\n</head>');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entry = process.argv[2];
  if (!entry || !path.isAbsolute(entry) || path.basename(entry)!=='index.html') throw new Error('Pass an absolute deployed index.html path');
  const original=fs.readFileSync(entry,'utf8');
  const updated=injectQuotaBridge(original);
  if(updated!==original){
    fs.copyFileSync(entry,`${entry}.before-quota-ui-${Date.now()}`);
    fs.writeFileSync(`${entry}.quota-ui-next`,updated,{mode:fs.statSync(entry).mode});
    fs.renameSync(`${entry}.quota-ui-next`,entry);
  }
  console.log('Quota UI bridge installed; upstream source and hashed JS bundles unchanged');
}
