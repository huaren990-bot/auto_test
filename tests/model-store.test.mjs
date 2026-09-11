import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { ModelStore, ModelValidationError } from '../backend/model-store.mjs';
import { createSimTestServer } from '../scripts/serve.mjs';

const model=(mxlx='AIRCRAFT-001',overrides={})=>({
  id:mxlx,FirstCfn:'物资',SecondCfn:'空中',ThirdCfn:'飞机',ForthCfn:'固定翼',
  mxmc:'测试飞机',mxlx,mxnm:`CODE-${mxlx}`,lxzymc:'测试飞机',lxzynm:`RESOURCE-${mxlx}`,
  bzlx:mxlx,commandType:mxlx,description:'数据库持久化测试',...overrides
});

test('SQLite model table uses the concrete model type as its identity and persists classifications',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'simtest-model-store-')),file=join(directory,'models.sqlite');
  try{
    let store=new ModelStore(file);const initial=store.count(),created=store.create(model());
    const sameName=store.create(model('AIRCRAFT-002'));
    const minimal=store.create({FirstCfn:'物资',SecondCfn:'海上',ThirdCfn:'舰船',ForthCfn:'驱逐舰',mxmc:'00驱逐舰',mxlx:'00qzj'});
    assert.equal(created.id,'AIRCRAFT-001');assert.equal(created.mxlx,'AIRCRAFT-001');
    assert.equal(sameName.mxmc,created.mxmc);assert.notEqual(sameName.mxlx,created.mxlx);
    assert.equal(minimal.mxnm,'00qzj');assert.equal(minimal.lxzymc,'00驱逐舰');assert.ok(minimal.lxzynm);
    assert.deepEqual([created.FirstCfn,created.SecondCfn,created.ThirdCfn,created.ForthCfn],['物资','空中','飞机','固定翼']);
    assert.equal(store.count(),initial+3);store.close();
    store=new ModelStore(file);
    assert.equal(store.get('AIRCRAFT-001').mxmc,'测试飞机');
    assert.equal(store.list({ThirdCfn:'飞机'}).some(item=>item.mxlx==='AIRCRAFT-001'),true);
    store.close();
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('batch model insertion is validated and atomic',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'simtest-model-batch-')),file=join(directory,'models.sqlite');
  try{
    const store=new ModelStore(file),initial=store.count();
    assert.throws(()=>store.createMany([model('TYPE-A'),model('TYPE-B',{mxnm:'CODE-TYPE-A'})]),ModelValidationError);
    assert.equal(store.count(),initial);
    assert.throws(()=>store.createMany([model('TYPE-A'),model('MX01')]),/UNIQUE|constraint/i);
    assert.equal(store.get('TYPE-A'),null);assert.equal(store.count(),initial);
    store.close();
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('model HTTP API reads and creates concrete types from the SQLite table',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'simtest-model-api-')),file=join(directory,'models.sqlite');
  const server=createSimTestServer({databasePath:file});server.listen(0,'127.0.0.1');await once(server,'listening');
  const {port}=server.address(),base=`http://127.0.0.1:${port}`;
  try{
    let response=await fetch(`${base}/api/models`),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.items.length,3);
    response=await fetch(`${base}/api/models`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model('AIRCRAFT-API'))});body=await response.json();
    assert.equal(response.status,201);assert.equal(body.item.mxlx,'AIRCRAFT-API');
    response=await fetch(`${base}/api/models?ThirdCfn=${encodeURIComponent('飞机')}`);body=await response.json();
    assert.equal(body.items.some(item=>item.mxlx==='AIRCRAFT-API'),true);
    response=await fetch(`${base}/api/models?q=${encodeURIComponent('测试飞机')}&page=1&pageSize=1`);body=await response.json();
    assert.equal(body.total,1);assert.equal(body.items.length,1);assert.equal(body.pageSize,1);
    response=await fetch(`${base}/api/models`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(model('AIRCRAFT-API'))});
    assert.equal(response.status,409);
    const health=await (await fetch(`${base}/api/health`)).json();assert.equal(health.database,'sqlite');assert.equal(health.modelCount,4);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});
