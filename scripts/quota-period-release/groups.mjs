import fs from 'node:fs';
const mode=process.argv[2];
if(!['preflight','apply','verify','rollback'].includes(mode))throw new Error('Invalid mode');
const file='/release/backup/cumulative-groups.json';
const base=process.env.SUB2API_BASE_URL||'http://sub2api:8080';
const res=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SUB2API_ADMIN_EMAIL,password:process.env.SUB2API_ADMIN_PASSWORD}),signal:AbortSignal.timeout(15000)});
const login=await res.json(); const token=login.data?.access_token||login.access_token;
if(!res.ok||!token)throw new Error('Admin authentication failed');
async function group(id,body){
  const r=await fetch(base+'/api/v1/admin/groups/'+id,{method:body?'PUT':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  const j=await r.json();if(!r.ok||j.code!==0)throw new Error(`Group ${id} HTTP ${r.status}`);return j.data;
}
if(mode==='preflight'){
  const entries=[];
  for(const [id,amount] of [[23,100],[24,100],[25,84000],[26,12000]]){
    const g=await group(id);
    if(Number(g.daily_limit_usd||0)!==0||Number(g.weekly_limit_usd||0)!==0||Number(g.monthly_limit_usd)!==amount)throw new Error('Unexpected native quota configuration');
    entries.push(g);
  }
  if(fs.existsSync(file))throw new Error('Backup exists');
  fs.writeFileSync(file,JSON.stringify(entries,null,2),{mode:0o600});
  console.log(JSON.stringify({saved:entries.map(g=>g.id)}));
}else{
  const entries=JSON.parse(fs.readFileSync(file));
  for(const before of entries){
    const amount=mode==='rollback'?before.monthly_limit_usd:0;
    if(mode!=='verify')await group(before.id,{daily_limit_usd:before.daily_limit_usd,weekly_limit_usd:before.weekly_limit_usd,monthly_limit_usd:amount});
    const after=await group(before.id);
    if(Number(after.monthly_limit_usd||0)!==Number(amount))throw new Error('Quota verification failed');
    for(const key of ['id','name','status','platform','rate_multiplier','subscription_type','daily_limit_usd','weekly_limit_usd','is_exclusive','model_routing','model_routing_enabled'])if(JSON.stringify(after[key])!==JSON.stringify(before[key]))throw new Error(`Unrelated property changed: ${key}`);
  }
  console.log(JSON.stringify({mode,verified:entries.map(g=>g.id)}));
}
