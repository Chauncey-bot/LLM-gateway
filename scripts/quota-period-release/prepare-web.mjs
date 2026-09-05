import fs from 'node:fs';
import {injectQuotaBridge} from '../../quota-gateway/scripts/install-ui-bridge.mjs';
const root='/release';
const current=fs.readFileSync('/caddy/Caddyfile','utf8');
const index=fs.readFileSync('/site/index.html','utf8');
fs.mkdirSync(root+'/backup',{recursive:true});
if(fs.existsSync(root+'/backup/Caddyfile')) throw new Error('Web backup already exists; inspect before repeating');
fs.writeFileSync(root+'/backup/Caddyfile',current,{mode:0o600});
fs.writeFileSync(root+'/backup/index.html',index,{mode:0o600});
const snippet=fs.readFileSync(root+'/quota-gateway/deploy/caddy-subscription-presentation.caddy','utf8');
const marker='\t# Account daily-quota gateway;';
if(current.split(marker).length!==3) throw new Error('Expected exactly two site insertion points');
let updated=current.replaceAll(marker,snippet.split('\n').map(s=>'\t'+s).join('\n')+'\n'+marker);
const direct='apiv1.aitrack.io {\n\tencode zstd gzip\n\treverse_proxy 127.0.0.1:18080\n}';
if(!updated.includes(direct)) throw new Error('Unexpected direct API site configuration');
updated=updated.replace(direct,`apiv1.aitrack.io {
  encode zstd gzip
  @quota_billed path /v1/* /responses* /models* /api/openai/* /api/anthropic/*
  handle @quota_billed {
    reverse_proxy 127.0.0.1:18193
  }
  handle {
    reverse_proxy 127.0.0.1:18080
  }
}`);
fs.writeFileSync(root+'/Caddyfile.next',updated);
fs.writeFileSync(root+'/index.next.html',injectQuotaBridge(index));
console.log('Prepared two UI sites and the Sub2API API alias; live files unchanged');
