import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {injectQuotaBridge} from '../scripts/install-ui-bridge.mjs';

test('entry injection is idempotent and preserves the upstream bundle',()=>{
  const html='<html><head><script type="module" src="/assets/original.js"></script></head><body></body></html>';
  const patched=injectQuotaBridge(html);
  assert.equal(injectQuotaBridge(patched),patched);
  assert.ok(patched.includes('src="/assets/original.js"'));
  assert.ok(patched.includes('src="/quota-ui/bridge.js"'));
});

test('mixed subscription grid keeps daily reset visible and expiry styling matches reset hint', async t=>{
  const dom=new JSDOM(`<div class="grid"><div class="card card-hover" id="total"><h3>coding-plan-monthly-12000</h3><span>剩余30天 (2026/10/05 22:50:23)</span><span>每月</span><div><button>重置今日额度</button></div></div>
    <div class="card card-hover" id="daily"><h3>coding-plan-daily-400</h3><span>剩余328天 (2027/07/30 13:06:57)</span><p class="text-xs text-gray-500 dark:text-dark-400">订阅额度将在0h 55m后重置</p><div><button>重置今日额度</button></div></div></div>`,{runScripts:'outside-only'});
  t.after(()=>{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();});
  dom.window.fetch=async()=>({ok:true,json:async()=>({groups:[{code:'coding-plan-monthly-12000'}]})});
  dom.window.eval(fs.readFileSync(new URL('../ui/bridge.js',import.meta.url),'utf8'));
  await new Promise(r=>setTimeout(r,20));
  const d=dom.window.document;
  assert.equal(d.querySelector('#daily button').hidden,false);
  assert.equal(d.querySelector('#daily button').style.display,'');
  assert.equal(d.querySelector('#daily .quota-expiry-note'),null);
  assert.equal(d.querySelector('#total button').style.display,'none');
  const note=d.querySelector('#total .quota-expiry-note');
  assert.equal(note.textContent,'订阅额度将在2026/10/05 22:50:23过期');
  assert.equal(note.className.replace('quota-expiry-note ','').trim(),d.querySelector('#daily p').className);
  // Reproduce the old cross-card contamination, then simulate an SPA update.
  d.querySelector('#daily button').hidden=true;
  d.querySelector('#daily button').style.display='none';
  d.querySelector('#daily button').insertAdjacentHTML('beforebegin','<div class="quota-expiry-note">错误的过期提示</div>');
  await new Promise(r=>setTimeout(r,20));
  assert.equal(d.querySelector('#daily button').hidden,false);
  assert.equal(d.querySelector('#daily .quota-expiry-note'),null);
  assert.equal(d.querySelectorAll('.quota-expiry-note').length,1);
});

test('extension relabels cumulative rows, hides reset countdown, and handles SPA rerenders', async t=>{
  const row=(code,label)=>`<tr><td>${code}</td><td><div class="usage-row"><span class="usage-label">${label}</span><div class="reset-info">4天后重置</div></div></td></tr>`;
  const dom=new JSDOM(`<table><tbody>${row('coding-plan-daily-100-v2','每月')}${row('coding-plan-daily-400','每日')}</tbody></table>`,{runScripts:'outside-only'});
  t.after(()=>{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();});
  dom.window.fetch=async()=>({ok:true,json:async()=>({groups:[{code:'coding-plan-daily-100-v2'}]})});
  dom.window.eval(fs.readFileSync(new URL('../ui/bridge.js',import.meta.url),'utf8'));
  await new Promise(r=>setTimeout(r,20));
  const labels=dom.window.document.querySelectorAll('.usage-label');
  assert.equal(labels[0].textContent,'累计');
  assert.equal(labels[1].textContent,'每日');
  assert.equal(dom.window.document.querySelector('.reset-info').hidden,true);
  dom.window.document.querySelector('tbody').insertAdjacentHTML('beforeend',row('coding-plan-daily-100-v2','Monthly'));
  await new Promise(r=>setTimeout(r,20));
  assert.equal(dom.window.document.querySelectorAll('.usage-label')[2].textContent,'Cumulative');
  dom.window.document.body.insertAdjacentHTML('beforeend',`<div class="card card-hover">coding-plan-daily-100-v2<span class="user-label">每月</span><div>到期时间 2026/10/05 22:50:23</div><button class="btn-warning">重置今日额度</button></div>
    <div class="max-h-64"><div class="border-b">coding-plan-daily-100-v2<span class="mini-label">每月</span></div></div>
    <article>coding-plan-daily-100-v2<span class="dashboard-limit">月 $100</span><div class="viewport-label">每月</div></article>
    <article>coding-plan-daily-400<span class="fixed-limit">每日 $400</span></article>`);
  await new Promise(r=>setTimeout(r,20));
  assert.equal(dom.window.document.querySelector('.user-label').textContent,'累计');
  assert.equal(dom.window.document.querySelector('.mini-label').textContent,'累计');
  assert.equal(dom.window.document.querySelector('.dashboard-limit').textContent,'累计 $100');
  assert.equal(dom.window.document.querySelector('.viewport-label').textContent,'累计');
  assert.equal(dom.window.document.querySelector('.fixed-limit').textContent,'每日 $400');
  assert.equal(dom.window.document.querySelector('button.btn-warning').hidden,true);
  assert.equal(dom.window.document.querySelector('.quota-expiry-note').textContent,'订阅额度将在2026/10/05 22:50:23过期');
});
