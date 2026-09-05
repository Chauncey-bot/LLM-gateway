// Run inside the release image with the existing production env-file.
// Secrets remain in the process; only SKU/group metadata is printed.
import fs from 'node:fs';
import path from 'node:path';
import { nativeGroupQuota } from '../zhisales-pay-service/subscription-policy.mjs';

const root = process.env.RELEASE_ROOT || '/release';
const backup = path.join(root, 'backup');
const mode = process.argv[2];
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
const desiredPath = path.join(root, 'zhisales-pay-service/catalog.json');

if (mode === 'catalog') {
  const desired = read(desiredPath);
  const current = read(path.join(backup, 'catalog.json'));
  for (const section of ['subscriptions', 'traffic_packs', 'balance_packs']) {
    const a = (desired[section] || []).map(s=>s.code).sort();
    const b = (current[section] || []).map(s=>s.code).sort();
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`SKU set changed: ${section}`);
  }
  const policies = new Map(desired.subscriptions.map(s=>[s.code,s]));
  for (const sku of current.subscriptions) {
    const target = policies.get(sku.code);
    for (const field of ['group_id','amount_cents','validity_days','enabled']) {
      if (sku[field] !== target[field]) throw new Error(`Unexpected property change: ${sku.code}.${field}`);
    }
    sku.quota_mode = target.quota_mode;
    sku.daily_limit_usd = target.daily_limit_usd;
    delete sku.quota_duration_type;
    if (sku.quota_mode === 'cumulative') {
      sku.total_quota_usd = target.total_quota_usd;
      sku.description = target.description;
      delete sku.monthly_limit_usd;
      delete sku.topup_balance_amount;
    }
  }
  save(desiredPath, current);
  console.log(JSON.stringify({subscriptions:current.subscriptions.length, trafficEnabled:current.traffic_packs.filter(s=>s.enabled).length, preserved:'SKU, group, price, validity, enabled, title'}));
} else if (['preflight','apply-groups','verify-groups','rollback-groups'].includes(mode)) {
  const base = (process.env.SUB2API_BASE_URL || 'http://sub2api:8080').replace(/\/$/,'');
  const login = await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SUB2API_ADMIN_EMAIL,password:process.env.SUB2API_ADMIN_PASSWORD}),signal:AbortSignal.timeout(15000)});
  const body = await login.json();
  const token = body?.data?.access_token || body?.access_token;
  if (!login.ok || !token) throw new Error(`Admin authentication failed (HTTP ${login.status})`);
  const request = async (id, update) => {
    const res = await fetch(`${base}/api/v1/admin/groups/${id}`, {method:update?'PUT':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:update?JSON.stringify(update):undefined,signal:AbortSignal.timeout(15000)});
    const json = await res.json();
    if (!res.ok || (json.code !== undefined && json.code !== 0)) throw new Error(`Group ${id} HTTP ${res.status}`);
    return json.data ?? json;
  };
  const catalog = read(desiredPath);
  const snapshotsPath = path.join(backup,'groups.json');
  if (mode === 'preflight') {
    const snapshots=[];
    for (const sku of catalog.subscriptions) {
      const group=await request(sku.group_id);
      if (Number(group.id)!==sku.group_id || group.name!==sku.code) throw new Error(`Group identity mismatch: ${sku.code}`);
      const patch=nativeGroupQuota(sku);
      const changed=Object.entries(patch).some(([key,value])=>Number(group[key]||0)!==value);
      if(changed && ![23,24].includes(sku.group_id)) throw new Error(`Unexpected group migration ${sku.group_id}`);
      snapshots.push({sku:sku.code,group,patch,changed});
    }
    save(snapshotsPath,snapshots);
    console.log(JSON.stringify({verified:snapshots.length,updates:snapshots.filter(s=>s.changed).map(s=>({id:s.group.id,patch:s.patch}))}));
  } else {
    const snapshots=read(snapshotsPath);
    for (const entry of snapshots) {
      const id=Number(entry.group.id);
      const expected=mode==='rollback-groups'?Object.fromEntries(Object.keys(entry.patch).map(k=>[k,entry.group[k]])):entry.patch;
      if (entry.changed && mode !== 'verify-groups') await request(id,expected);
      const result=await request(id);
      for(const [key,value] of Object.entries(expected)) if(Number(result[key]||0)!==Number(value||0)) throw new Error(`Group quota verification failed: ${id}.${key}`);
      for(const key of ['id','name','status','platform','rate_multiplier','subscription_type','is_exclusive','model_routing','model_routing_enabled','supported_model_scopes','fallback_group_id']) {
        if(JSON.stringify(entry.group[key])!==JSON.stringify(result[key])) throw new Error(`Unexpected group property change: ${id}.${key}`);
      }
    }
    console.log(JSON.stringify({mode,verified:snapshots.length,changed:snapshots.filter(s=>s.changed).map(s=>s.group.id)}));
  }
} else throw new Error('Expected catalog, preflight, apply-groups, verify-groups or rollback-groups');
