import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { checkCumulativeQuota } from "../cumulative-quota.mjs";
import { createApp } from "../server.mjs";
import { projectSubscriptionPayload } from "../subscription-presentation.mjs";
import { resetDueDailySubscriptionQuotas } from "../../subscription-reset-service/server.mjs";

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE user_subscriptions (
    id bigint PRIMARY KEY, user_id bigint, group_id bigint, status text,
    starts_at timestamptz, expires_at timestamptz, deleted_at timestamptz,
    daily_window_start timestamptz, monthly_usage_usd numeric DEFAULT 0);
    CREATE TABLE usage_logs (id bigint GENERATED ALWAYS AS IDENTITY, user_id bigint,
      subscription_id bigint, api_key_id bigint, actual_cost numeric, total_cost numeric, created_at timestamptz DEFAULT NOW());
    CREATE TABLE payment_orders (id bigint GENERATED ALWAYS AS IDENTITY, user_id bigint, group_id bigint,
      sku_type text, fulfillment_status text, merchant_order_id text, fulfilled_at timestamptz);
    CREATE TABLE api_keys (id bigint, user_id bigint, group_id bigint, key text, status text, deleted_at timestamptz);`);
  return db;
}

test('latest fulfilled purchase isolates historical usage and is shared by display and enforcement', async t => {
  const db=await database(t);
  await db.exec(`INSERT INTO user_subscriptions(id,user_id,group_id,status,starts_at,expires_at,monthly_usage_usd)
    VALUES(1,53,24,'active','2026-08-01 12:00+08','2026-09-06 12:00+08',607);
    INSERT INTO payment_orders(user_id,group_id,sku_type,fulfillment_status,merchant_order_id,fulfilled_at) VALUES
      (53,24,'subscription','fulfilled','old','2026-08-01 12:00+08'),
      (53,24,'subscription','fulfilled','latest','2026-09-05 12:00+08'),
      (53,24,'subscription','fulfillment_failed','failed','2026-09-05 15:00+08'),
      (53,24,'traffic','fulfilled','traffic','2026-09-05 16:00+08'),
      (53,25,'subscription','fulfilled','other-group','2026-09-05 17:00+08'),
      (54,24,'subscription','fulfilled','other-user','2026-09-05 18:00+08');
    INSERT INTO usage_logs(user_id,subscription_id,api_key_id,actual_cost,created_at) VALUES
      (53,1,10,600,'2026-09-04 12:00+08'),(53,1,10,3,'2026-09-05 12:00+08'),
      (53,1,11,4,'2026-09-05 14:00+08');`);
  const now=new Date('2026-09-06T00:00:00+08:00');
  const state=await checkCumulativeQuota(db,{user_id:53,group_id:24},undefined,now,db);
  assert.equal(state.usedUsd,7);
  assert.equal(state.allowed,true);
  assert.equal(state.periodOrderId,'latest');
  const row=(await db.query('SELECT * FROM user_subscriptions WHERE id=1')).rows[0];
  const payload={code:0,data:{items:[{...row,group:{id:24,monthly_limit_usd:0}}],total:1}};
  const result=await projectSubscriptionPayload(payload,db,db,now);
  const displayed=result.data.items[0];
  assert.equal(displayed.quota_mode,'cumulative');
  assert.equal(displayed.monthly_usage_usd,state.usedUsd);
  assert.equal(displayed.monthly_window_start,null);
  assert.equal(displayed.group.monthly_limit_usd,100);
  assert.equal(Number(payload.data.items[0].monthly_usage_usd),607);
  assert.equal(Number((await db.query('SELECT monthly_usage_usd FROM user_subscriptions WHERE id=1')).rows[0].monthly_usage_usd),607);
  await db.exec(`INSERT INTO payment_orders(user_id,group_id,sku_type,fulfillment_status,merchant_order_id,fulfilled_at)
    VALUES(53,24,'subscription','fulfilled','next','2026-09-06 01:00+08');
    INSERT INTO usage_logs(user_id,subscription_id,actual_cost,created_at) VALUES(53,1,2,'2026-09-06 02:00+08');`);
  assert.equal((await checkCumulativeQuota(db,{user_id:53,group_id:24},undefined,new Date('2026-09-06T03:00:00+08:00'),db)).usedUsd,2);
  // Future purchases do not erase historical views of the previous period.
  assert.equal((await checkCumulativeQuota(db,{user_id:53,group_id:24},undefined,now,db)).usedUsd,7);
});

test('subscription presentation preserves native authorization and never reads data after denial', async t=>{
  let credential;
  const upstream=http.createServer((req,res)=>{credential=req.headers.authorization;res.writeHead(403,{'content-type':'application/json'});res.end('{"code":403,"message":"denied"}');});
  await new Promise((r,j)=>{upstream.once('error',j);upstream.listen(0,'127.0.0.1',r);});
  t.after(()=>new Promise(r=>upstream.close(r)));
  const forbiddenDb={query(){throw new Error('Unauthorized database read');}};
  const gateway=createApp({upstreamDb:forbiddenDb,quotaDb:forbiddenDb,upstreamBaseUrl:`http://127.0.0.1:${upstream.address().port}`}).listen(0,'127.0.0.1');
  await new Promise((r,j)=>{gateway.once('listening',r);gateway.once('error',j);});
  t.after(()=>new Promise(r=>gateway.close(r)));
  const url=`http://127.0.0.1:${gateway.address().port}/api/v1/admin/subscriptions`;
  assert.equal((await fetch(url)).status,401);
  const denied=await fetch(url,{headers:{Authorization:'Bearer caller-token'}});
  assert.equal(denied.status,403);
  assert.equal(credential,'Bearer caller-token');
  assert.equal((await denied.json()).message,'denied');
});

test("PostgreSQL: cumulative usage survives midnight, monthly reset and duration extension; combines keys and respects expiry", async t => {
  const db = await database(t);
  await db.exec(`INSERT INTO user_subscriptions VALUES
    (1, 53, 24, 'active', '2026-09-05 12:00+08', '2026-09-06 12:00+08', NULL, NULL, 0);
    INSERT INTO usage_logs(user_id, subscription_id, api_key_id, actual_cost, total_cost, created_at) VALUES
    (53,1,10,20,200,'2026-09-05 13:00+08'),(53,1,11,30,300,'2026-09-05 23:00+08'),
    (54,1,12,999,999,'2026-09-05 23:00+08'),(53,2,13,999,999,'2026-09-05 23:00+08');`);
  const owner = {user_id: 53, group_id: 24};
  for (const time of ['2026-09-05T23:59:59+08:00', '2026-09-06T00:00:00+08:00']) {
    const state = await checkCumulativeQuota(db, owner, undefined, new Date(time));
    assert.equal(state.usedUsd, 50);
    assert.equal(state.allowed, true);
  }
  const expired = await checkCumulativeQuota(db, owner, undefined, new Date('2026-09-06T12:00:00+08:00'));
  assert.equal(expired.allowed, false);
  assert.equal(expired.code, 'SUBSCRIPTION_EXPIRED');
  await db.exec(`UPDATE user_subscriptions SET expires_at='2026-11-06 12:00+08', monthly_usage_usd=0;
    INSERT INTO usage_logs(user_id,subscription_id,api_key_id,actual_cost,total_cost,created_at) VALUES (53,1,11,50,500,'2026-09-07 12:00+08');`);
  const state = await checkCumulativeQuota(db, owner, undefined, new Date('2026-10-06T00:00:00+08:00'));
  assert.equal(state.usedUsd, 100);
  assert.equal(state.allowed, false);
  assert.equal(state.code, 'TOTAL_QUOTA_EXCEEDED');
  assert.equal(await checkCumulativeQuota(db, {...owner,group_id:16}), null);
});

test("PostgreSQL: fixed daily reset includes one-day and uninitialized windows, excludes every cumulative mode", async t => {
  const db = await database(t);
  await db.exec(`INSERT INTO user_subscriptions(id,user_id,group_id,status,starts_at,expires_at,daily_window_start) VALUES
    (1,1,16,'active',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '23 hours',NULL),
    (2,2,24,'active',NOW()-INTERVAL '1 hour',NOW()+INTERVAL '23 hours',NOW()-INTERVAL '1 day'),
    (3,3,25,'active',NOW()-INTERVAL '10 days',NOW()+INTERVAL '20 days',NOW()-INTERVAL '1 day'),
    (4,4,26,'active',NOW()-INTERVAL '10 days',NOW()+INTERVAL '20 days',NULL),
    (5,5,16,'active',NOW()-INTERVAL '10 days',NOW()-INTERVAL '1 hour',NULL),
    (6,6,16,'active',NOW()+INTERVAL '1 hour',NOW()+INTERVAL '10 days',NULL);`);
  const calls=[];
  const result = await resetDueDailySubscriptionQuotas({db:{connect:async()=>({query:db.query.bind(db),release(){}})},
    resetSubscription: async id => calls.push(Number(id))});
  assert.equal(result.reset, 1);
  assert.deepEqual(calls,[1]);
});

test("HTTP + PostgreSQL: cumulative requests work after midnight, stop at total cap, never fall back to traffic packs", async t => {
  const db = await database(t);
  await db.exec(`INSERT INTO user_subscriptions(id,user_id,group_id,status,starts_at,expires_at)
    VALUES(1,53,24,'active',NOW()-INTERVAL '12 hours',NOW()+INTERVAL '12 hours');
    INSERT INTO api_keys VALUES(10,53,24,'test-key','active',NULL);`);
  let requests=0;
  const upstream=http.createServer((req,res)=>{requests++; req.resume(); res.end('{"ok":true}');});
  await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(r=>upstream.close(r)));
  const app=createApp({upstreamDb:db,quotaDb:db,upstreamBaseUrl:`http://127.0.0.1:${upstream.address().port}`});
  const gateway=app.listen(0,'127.0.0.1');
  await new Promise((r,j)=>{gateway.once('listening',r);gateway.once('error',j);});
  t.after(()=>new Promise(r=>gateway.close(r)));
  const request=()=>fetch(`http://127.0.0.1:${gateway.address().port}/v1/responses`,{method:'POST',headers:{Authorization:'Bearer test-key'},body:'{}'});
  assert.equal((await request()).status,200);
  await db.exec(`INSERT INTO usage_logs(user_id,subscription_id,actual_cost) VALUES(53,1,100)`);
  const blocked=await request();
  assert.equal(blocked.status,429);
  assert.equal((await blocked.json()).error.code,'TOTAL_QUOTA_EXCEEDED');
  assert.equal(requests,1);
  await db.exec(`UPDATE user_subscriptions SET expires_at=NOW()-INTERVAL '1 second'`);
  assert.equal((await request()).status,403);
  assert.equal(requests,1);
});
