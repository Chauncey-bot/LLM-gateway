import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { createClient } from "redis";
import { ResetStore, lockSubscription } from "../reset-store.mjs";
import { installAdminResetRoute } from "../admin-reset.mjs";
import { subscriptionInvalidator } from "../subscription-cache.mjs";

const integration={skip:!process.env.ADMIN_RESET_TEST_DSN};
const selected={daily:true,weekly:false,monthly:false};
function barrier(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
async function listen(t,app){const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));return `http://127.0.0.1:${server.address().port}`;}
async function fixture(t){
  const dsn=process.env.ADMIN_RESET_TEST_DSN;
  assert.match(dsn,/^postgres:\/\/postgres@127\.0\.0\.1:\d+\/postgres/);
  const schema="reset_test_"+randomUUID().replaceAll("-","");
  const admin=new pg.Pool({connectionString:dsn});await admin.query(`CREATE SCHEMA ${schema}`);
  const db=new pg.Pool({connectionString:dsn,options:`-c search_path=${schema}`,max:8});
  t.after(async()=>{await db.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  await db.query(`CREATE TABLE user_subscriptions(
    id bigint PRIMARY KEY,user_id bigint,group_id bigint,status text,deleted_at timestamptz,
    starts_at timestamptz,expires_at timestamptz,daily_window_start timestamptz,weekly_window_start timestamptz,monthly_window_start timestamptz,
    daily_usage_usd numeric,weekly_usage_usd numeric,monthly_usage_usd numeric,updated_at timestamptz);
    CREATE TABLE usage_logs(subscription_id bigint,user_id bigint,created_at timestamptz,actual_cost numeric);
    INSERT INTO user_subscriptions VALUES
    (57,18,10,'active',NULL,now()-interval '1 day',now()+interval '20 days',now()-interval '1 hour',now()-interval '2 days',now()-interval '3 days',80.09,90,100,now()),
    (126,18,15,'active',NULL,now()-interval '1 day',now()+interval '20 days',now()-interval '1 hour',now()-interval '2 days',now()-interval '3 days',10.28,20,30,now());
    INSERT INTO usage_logs VALUES(57,18,now()-interval '1 second',80.09),(126,18,now()-interval '1 second',10.28);`);
  const store=(options={})=>new ResetStore({db,invalidate:async()=>{},dailyFixedGroupIds:[10,15],retryMs:0,...options});
  await store().ensure();
  const snapshot=async(id=57)=>(await db.query('SELECT * FROM user_subscriptions WHERE id=$1',[id])).rows[0];
  const used=async(id=57)=>Number((await db.query(`SELECT COALESCE(SUM(l.actual_cost),0) AS used FROM usage_logs l
    JOIN user_subscriptions s ON s.id=l.subscription_id WHERE s.id=$1 AND l.created_at>=s.daily_window_start`,[id])).rows[0].used);
  const charge=async(cost=.4,id=57)=>{
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE user_subscriptions SET daily_usage_usd=daily_usage_usd+$2 WHERE id=$1',[id,cost]);
      await client.query('INSERT INTO usage_logs VALUES($1,18,clock_timestamp(),$2)',[id,cost]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
  return{db,store,snapshot,used,charge};
}
async function appFor(t,store,db,{authHook}={}){
  const app=express();app.use(express.json());
  let nativePosts=0;
  installAdminResetRoute(app,{store,upstreamBaseUrl:"http://authorized-upstream",dailyFixedGroupIds:[10,15],fetchImpl:async(url,options)=>{
    if(options.method==="POST"){nativePosts++;throw new Error("Managed reset must not use the native two-phase mutation");}
    assert.equal(options.headers.Authorization,"Bearer test-admin");
    const id=Number(url.split('/').at(-1));
    const sub=(await db.query('SELECT * FROM user_subscriptions WHERE id=$1',[id])).rows[0];
    if(authHook)await authHook();
    return new Response(JSON.stringify({code:0,data:sub}),{headers:{"content-type":"application/json","x-request-id":"verified-admin-request"}});
  }});
  const base=await listen(t,app);
  return{post:(id=57,body=selected)=>fetch(`${base}/api/v1/admin/subscriptions/${id}/reset-quota`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer test-admin"},body:JSON.stringify(body)}),nativePosts:()=>nativePosts};
}
function faultyPool(db,hook){return{query:(...args)=>db.query(...args),async connect(){const client=await db.connect();return{release:()=>client.release(),async query(sql,args){return hook(client,sql,args);}};}};}

test("atomic reset excludes old charges, preserves expiry and unselected windows",integration,async t=>{
  const f=await fixture(t);const store=f.store();const api=await appFor(t,store,f.db);
  for(const id of [57,126]){
    const before=await f.snapshot(id);const response=await api.post(id);assert.equal(response.status,200);
    const after=await f.snapshot(id);assert.equal(await f.used(id),0);assert.equal(Number(after.daily_usage_usd),0);
    for(const field of ['expires_at','weekly_window_start','monthly_window_start'])assert.equal(after[field].getTime(),before[field].getTime());
    await f.charge(.4,id);assert.equal(await f.used(id),.4);
  }
  const before=await f.snapshot();assert.equal((await api.post(57,{daily:false,weekly:true,monthly:true})).status,200);
  const after=await f.snapshot();assert.equal(after.daily_window_start.getTime(),before.daily_window_start.getTime());
  assert.equal(Number(after.daily_usage_usd),.4);assert.equal(Number(after.weekly_usage_usd),0);assert.equal(Number(after.monthly_usage_usd),0);
  assert.equal(api.nativePosts(),0);
});

test("delayed request cannot reinstall an older window after another reset",integration,async t=>{
  const f=await fixture(t);const reached=barrier(),release=barrier();let calls=0;
  const api=await appFor(t,f.store(),f.db,{authHook:async()=>{if(++calls===1){reached.resolve();await release.promise;}}});
  const a=api.post(126);await reached.promise;
  assert.equal((await api.post(126)).status,200);const afterB=await f.snapshot(126);
  await f.charge(10.1,126);release.resolve();assert.equal((await a).status,200);
  const afterA=await f.snapshot(126);
  assert.ok(afterA.daily_window_start>=afterB.daily_window_start);assert.equal(Number(afterA.daily_usage_usd),0);assert.equal(await f.used(126),0);
  assert.equal(api.nativePosts(),0);
});

test("two independent replicas serialize before reset and capture time after the lock",integration,async t=>{
  const f=await fixture(t);const entered=barrier(),release=barrier(),secondAuthorized=barrier();let held=false,secondDone=false;
  const wrapped=faultyPool(f.db,async(client,sql,args)=>{
    if(sql.startsWith('UPDATE user_subscriptions SET')&&!held){held=true;entered.resolve();await release.promise;}
    return client.query(sql,args);
  });
  const first=await appFor(t,f.store({db:wrapped}),f.db);
  const second=await appFor(t,f.store(),f.db,{authHook:async()=>secondAuthorized.resolve()});
  const a=first.post();await entered.promise;
  const b=second.post().then(r=>{secondDone=true;return r;});await secondAuthorized.promise;
  // Check PostgreSQL, not an in-process mutex: another connection cannot own it.
  const probe=await f.db.connect();await probe.query('BEGIN');
  const lock=await probe.query("SELECT pg_try_advisory_xact_lock(hashtextextended('zhisales-subscription-reset:57',0)) AS acquired");
  assert.equal(lock.rows[0].acquired,false);await probe.query('ROLLBACK');probe.release();
  assert.equal(secondDone,false);release.resolve();
  assert.deepEqual(await Promise.all([a,b]).then(rs=>rs.map(r=>r.status)),[200,200]);
  const operations=(await f.db.query('SELECT * FROM zhisales_subscription_resets ORDER BY sequence')).rows;
  assert.equal(operations.length,2);assert.ok(operations.every(op=>op.state==='completed'));
  assert.ok(operations[1].reset_at>=operations[0].reset_at);
  assert.equal((await f.snapshot()).daily_window_start.getTime(),operations[1].reset_at.getTime());
});

test("failure after the SQL update rolls back both counters and boundary, then recovers after restart",integration,async t=>{
  const f=await fixture(t);const original=await f.snapshot();let fail=true;
  const broken=faultyPool(f.db,async(client,sql,args)=>{
    const result=await client.query(sql,args);
    if(sql.startsWith('UPDATE user_subscriptions SET')&&fail){fail=false;throw new Error('crash before receipt commit');}
    return result;
  });
  const api=await appFor(t,f.store({db:broken}),f.db);const response=await api.post();assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.recovery_pending,true);
  const uncommitted=await f.snapshot();assert.equal(Number(uncommitted.daily_usage_usd),80.09);
  assert.equal(uncommitted.daily_window_start.getTime(),original.daily_window_start.getTime());
  assert.equal((await f.store().get(body.reset_id)).state,'pending');
  const restarted=f.store();await restarted.reconcile();
  assert.equal((await restarted.get(body.reset_id)).state,'completed');assert.equal(await f.used(),0);
  assert.equal((await f.snapshot()).expires_at.getTime(),original.expires_at.getTime());
});

test("pending operation is durable even if the process stops before applying it",integration,async t=>{
  const f=await fixture(t);const op=await f.store().enqueue(57,selected);
  const restarted=f.store();await restarted.reconcile();assert.equal((await restarted.get(op.operation_id)).state,'completed');assert.equal(await f.used(),0);
});

test("cache outage after commit retries invalidation only and retains new consumption",integration,async t=>{
  const f=await fixture(t);const failing=f.store({invalidate:async()=>{throw new Error('Redis outage');}});
  const api=await appFor(t,failing,f.db);const response=await api.post();assert.equal(response.status,503);
  const body=await response.json();const before=await f.snapshot();assert.equal(await f.used(),0);
  assert.equal((await failing.get(body.reset_id)).state,'applied');await f.charge();
  let deliveries=0;const restarted=f.store({invalidate:async()=>deliveries++});await restarted.reconcile();await restarted.reconcile();
  const after=await f.snapshot();assert.equal(after.daily_window_start.getTime(),before.daily_window_start.getTime());
  assert.equal(Number(after.daily_usage_usd),.4);assert.equal(await f.used(),.4);assert.equal(deliveries,1);
  assert.equal((await restarted.get(body.reset_id)).state,'completed');
});

test("lost cache acknowledgment is safe to deliver again after restart",integration,async t=>{
  const f=await fixture(t);let fail=true,deliveries=0;
  const broken=faultyPool(f.db,async(client,sql,args)=>{
    if(sql.includes("SET state='completed'")&&fail){fail=false;throw new Error('lost acknowledgment');}
    return client.query(sql,args);
  });
  const store=f.store({db:broken,invalidate:async()=>deliveries++});const op=await store.enqueue(57,selected);
  await assert.rejects(store.run(57));assert.equal((await store.get(op.operation_id)).state,'applied');
  const before=await f.snapshot();await f.charge();
  await f.store({invalidate:async()=>deliveries++}).reconcile();const after=await f.snapshot();
  assert.equal(deliveries,2);assert.equal(Number(after.daily_usage_usd),.4);assert.equal(await f.used(),.4);
  assert.equal(after.daily_window_start.getTime(),before.daily_window_start.getTime());
});

test("stale midnight selection cannot overwrite a manual reset",integration,async t=>{
  const f=await fixture(t);await f.db.query("UPDATE user_subscriptions SET daily_window_start=now()-interval '2 days'");
  const store=f.store();const manual=await store.enqueue(57,selected);const daily=await store.enqueue(57,selected,{kind:'daily'});
  await store.run(57);assert.equal((await store.get(manual.operation_id)).state,'completed');assert.equal((await store.get(daily.operation_id)).state,'cancelled');
  const after=await f.snapshot();assert.equal(after.daily_window_start.getTime(),(await store.get(manual.operation_id)).reset_at.getTime());
  const firstDaily=await store.enqueue(126,selected,{kind:'daily'});const laterManual=await store.enqueue(126,selected);await store.run(126);
  assert.equal((await store.get(firstDaily.operation_id)).state,'completed');assert.equal((await store.get(laterManual.operation_id)).state,'completed');
  assert.equal((await f.snapshot(126)).daily_window_start.getTime(),(await store.get(laterManual.operation_id)).reset_at.getTime());
});

test("changed subscription is cancelled rather than resetting a different entitlement",integration,async t=>{
  const f=await fixture(t);const store=f.store();const op=await store.enqueue(57,selected);await f.db.query('UPDATE user_subscriptions SET group_id=24 WHERE id=57');
  await store.run(57);assert.equal((await store.get(op.operation_id)).state,'cancelled');assert.equal(Number((await f.snapshot()).daily_usage_usd),80.09);
});

test("user reset receipt recovery never repeats the validity deduction",integration,async t=>{
  const f=await fixture(t);const store=f.store({invalidate:async()=>{throw new Error('cache outage');}});const client=await f.db.connect();
  await client.query('BEGIN');await lockSubscription(client,57);
  const result=(await client.query("UPDATE user_subscriptions SET daily_usage_usd=0,daily_window_start=clock_timestamp(),expires_at=expires_at-interval '24 hours' WHERE id=57 RETURNING *")).rows[0];
  const receipt=await store.receipt(client,result,selected,result.daily_window_start);await client.query('COMMIT');client.release();
  await assert.rejects(store.deliver(receipt.operation_id));await f.charge();await f.store().reconcile();
  const after=await f.snapshot();assert.equal(after.expires_at.getTime(),result.expires_at.getTime());assert.equal(Number(after.daily_usage_usd),.4);
});

test("real Redis invalidation removes billing cache and publishes to the upstream L1 channel",{skip:!process.env.RESET_REDIS_TEST_URL},async t=>{
  const url=process.env.RESET_REDIS_TEST_URL;const subscriber=createClient({url});const cache=createClient({url});
  subscriber.on('error',()=>{});cache.on('error',()=>{});await subscriber.connect();await cache.connect();
  t.after(async()=>{await subscriber.quit();await cache.quit();});
  const message=barrier();await subscriber.subscribe('subscription:cache:invalidate',m=>message.resolve(m));
  await cache.hSet('billing:sub:18:10',{daily_usage:'80.09'});await subscriptionInvalidator(url)(18,10);
  assert.equal(await message.promise,'sub:18:10');assert.equal(await cache.exists('billing:sub:18:10'),0);
  await subscriber.unsubscribe('subscription:cache:invalidate');
  await assert.rejects(subscriptionInvalidator(url)(18,10),/subscriber is unavailable/);
});
