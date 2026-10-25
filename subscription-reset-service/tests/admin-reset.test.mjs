import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { installAdminResetRoute } from "../admin-reset.mjs";

async function serve(t, options) {
  const app = express(); app.use(express.json());
  installAdminResetRoute(app, { upstreamBaseUrl: "http://upstream.invalid", dailyFixedGroupIds: [10,15], ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const path="/api/v1/admin/subscriptions/57/reset-quota";
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
const post=(base,body={daily:true},token="admin-token",route=path)=>fetch(base+route,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
const fail=()=>{throw new Error("Dependency must not be called");};

test("invalid ID, missing token and nonboolean windows cannot authorize or queue a reset",async t=>{
  const base=await serve(t,{store:{enqueue:fail},fetchImpl:fail});
  assert.equal((await post(base,{},"")).status,401);
  assert.equal((await post(base,{daily:true},"admin-token",path.replace("57","57junk"))).status,400);
  assert.equal((await post(base,{daily:"true"})).status,400);
  assert.equal((await post(base,{})).status,400);
});
for(const status of [401,403,404,500]) test(`upstream authorization ${status} cannot queue or mutate`,async t=>{
  const base=await serve(t,{store:{enqueue:fail},fetchImpl:async(url,options)=>{
    assert.equal(url,"http://upstream.invalid/api/v1/admin/subscriptions/57");
    assert.equal(options.method,undefined);
    assert.equal(options.headers.Authorization,"Bearer user-token");
    return response({code:status,message:"denied"},status);
  }});
  assert.equal((await post(base,{daily:true},"user-token")).status,status);
});
test("upstream business failure cannot queue a reset",async t=>{
  const base=await serve(t,{store:{enqueue:fail},fetchImpl:async()=>response({code:403,message:"denied"})});
  assert.equal((await(await post(base)).json()).code,403);
});
test("managed reset authorizes by GET and returns the atomic result without a native POST",async t=>{
  const calls=[];
  const store={async enqueue(id,selected){calls.push([id,selected]);return{operation_id:"test-reset"};},async run(){},async get(){return{state:"completed",result:{id:57,daily_window_start:"2026-10-25T19:00:00+08:00"}};}};
  const base=await serve(t,{store,fetchImpl:async(url,options)=>{assert.equal(options.method,undefined);return response({code:0,data:{id:57,group_id:10,user:{id:18}}});}});
  const result=await post(base,{daily:true},"admin-token",path.replace("/api/v1","/v1"));
  assert.equal(result.status,200);assert.equal(result.headers.get("x-quota-reset-id"),"test-reset");
  assert.equal((await result.json()).data.daily_window_start,"2026-10-25T19:00:00+08:00");
  assert.deepEqual(calls,[[57,{daily:true,weekly:false,monthly:false}]]);
});
test("a durable failure returns its operation ID for automatic recovery",async t=>{
  const base=await serve(t,{store:{async enqueue(){return{operation_id:"durable-reset"};},async run(){throw new Error("outage");}},fetchImpl:async()=>response({code:0,data:{id:57,group_id:10}})});
  const result=await post(base);assert.equal(result.status,503);
  const body=await result.json();assert.equal(body.reset_id,"durable-reset");assert.equal(body.recovery_pending,true);
});
test("queue failure cannot call the native mutation or claim a queued operation",async t=>{
  let calls=0;
  const base=await serve(t,{store:{enqueue:fail},fetchImpl:async()=>{calls++;return response({code:0,data:{id:57,group_id:10}});}});
  const result=await post(base);assert.equal(result.status,503);
  assert.equal((await result.json()).recovery_pending,undefined);assert.equal(calls,1);
});
test("unmanaged cumulative plans retain the upstream mutation behavior",async t=>{
  const methods=[];
  const base=await serve(t,{store:{enqueue:fail},fetchImpl:async(url,options)=>{
    methods.push(options.method||"GET");
    return response({code:0,data:{id:57,group_id:24,daily_usage_usd:0}});
  }});
  assert.equal((await post(base)).status,200);assert.deepEqual(methods,["GET","POST"]);
});
