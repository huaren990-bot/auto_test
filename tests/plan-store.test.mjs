import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {ModelStore} from '../backend/model-store.mjs';
import {PlanStore,PlanValidationError} from '../backend/plan-store.mjs';
import {createSimTestServer} from '../scripts/serve.mjs';
import {createPlan} from '../frontend/core.js';

test('SQLite persists complete plans and imports only missing IDs atomically',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'simtest-plans-')),file=join(directory,'db.sqlite');let models;
  try{
    models=new ModelStore(file);const store=new PlanStore(models.database),first=createPlan('后端方案');
    first.entities.push({id:'entity-1'});store.save(first);first.name='已修改';store.save(first);
    assert.equal(store.get(first.id).name,'已修改');assert.equal(store.get(first.id).entities[0].id,'entity-1');
    const second=createPlan('导入方案'),inserted=store.importMissing([first,second]);assert.deepEqual(inserted.map(plan=>plan.id),[second.id]);assert.equal(store.count(),2);
    assert.throws(()=>store.importMissing([second,second]),PlanValidationError);
  }finally{models?.close();await rm(directory,{recursive:true,force:true});}
});

test('plan HTTP API lists, imports, reads and updates plans',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'simtest-plans-api-')),server=createSimTestServer({databasePath:join(directory,'db.sqlite')});server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`,plan=createPlan('接口方案');
  const request=(path,body,method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    let response=await request('/api/plans/import',[plan]);assert.equal(response.status,201);assert.equal((await response.json()).items.length,1);
    response=await fetch(base+'/api/plans');assert.equal((await response.json()).items[0].id,plan.id);
    plan.description='数据库更新';response=await request('/api/plans/'+plan.id,plan,'PUT');assert.equal(response.status,200);assert.equal((await response.json()).item.description,'数据库更新');
    response=await fetch(base+'/api/plans/'+plan.id);assert.equal((await response.json()).item.description,'数据库更新');
    response=await request('/api/plans/not-the-id',plan,'PUT');assert.equal(response.status,400);
    const health=await (await fetch(base+'/api/health')).json();assert.equal(health.planCount,1);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
