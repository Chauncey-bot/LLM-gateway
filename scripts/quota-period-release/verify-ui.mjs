const base=process.env.SUB2API_BASE_URL||'http://sub2api:8080';
const r=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.SUB2API_ADMIN_EMAIL,password:process.env.SUB2API_ADMIN_PASSWORD})});
const login=await r.json();
const token=login.data?.access_token;
if(!r.ok||!token)throw new Error('Authentication failed');
for(const path of ['/api/v1/admin/subscriptions/96','/api/v1/admin/subscriptions/97','/api/v1/subscriptions/active']){
 const response=await fetch('https://ai.zhisales.com'+path,{headers:{Authorization:`Bearer ${token}`}});
 const body=await response.json();
 if(!response.ok||body.code!==0)throw new Error(`Read failed: ${path} ${response.status}`);
 const s=body.data;
 if(path.includes('/admin/')){
  if(s.quota_mode!=='cumulative'||s.monthly_window_start!==null||s.total_quota_usd!==100)throw new Error('Projection mismatch');
  if(!s.group?.description?.includes('累计总额度 $100')||!s.group.description.includes('不按日或按月重置'))throw new Error('Description mismatch');
  console.log(JSON.stringify({description:s.group.description}));
  console.log(JSON.stringify({path,status:response.status,mode:s.quota_mode,used:s.cumulative_usage_usd,limit:s.total_quota_usd,start:s.quota_period_starts_at,end:s.quota_period_expires_at}));
 }else console.log(JSON.stringify({path,status:response.status}));
}
