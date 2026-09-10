import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultActionType,defaultActionValues,makeConfiguredAction,syncActionTargets} from '../frontend/action-schema.js';
import {models,createMountedEntityBatch,generate} from '../frontend/core.js';
let tick;
globalThis.localStorage={getItem(){return null;},setItem(){}};
globalThis.window=new EventTarget();
const realInterval=globalThis.setInterval;
globalThis.setInterval=fn=>{tick=fn;return 1;};
const {api}=await import('../frontend/api.js');
globalThis.setInterval=realInterval;

test('creating from example does not depend on the newest user plan',async()=>{
  await api.createPlan('空白草稿');
  const sample=await api.createPlan('新的示例',true);
  assert.equal(sample.entities.length,2);assert.equal(sample.actions.length,1);
});
test('queue is serial, cancellation is terminal, and snapshots do not change with drafts',async()=>{
  const plan=api.snapshot().plans.find(p=>p.entities.length===2&&p.actions.length&&p.actions[0].count===1);
  const runs=await api.enqueue([plan,plan],'success');
  plan.name='修改草稿';plan.entities[0].height=100;
  tick();let state=api.snapshot();assert.equal(state.runs.filter(r=>r.status==='running').length,1);
  assert.equal(state.runs.find(r=>r.id===runs[1].id).status,'queued');
  await api.cancel(runs[0].id);tick();
  for(let i=0;i<15;i++)tick();state=api.snapshot();
  assert.equal(state.runs.find(r=>r.id===runs[0].id).status,'cancelled');
  const completed=state.runs.find(r=>r.id===runs[1].id);assert.equal(completed.status,'done');assert.equal(completed.verdict,'pass');assert.notEqual(completed.plan.name,'修改草稿');assert.equal(completed.plan.entities[0].height,0);
  assert.notEqual(runs[0].files.ybnm,runs[1].files.ybnm);
});
test('invalid batch is rejected atomically before any runs are queued',async()=>{
  const plans=api.snapshot().plans;const good=plans.find(p=>p.entities.length===2&&p.actions.length&&p.actions[0].count===1);const bad=plans.find(p=>!p.entities.length);
  const count=api.snapshot().runs.length;await assert.rejects(api.enqueue([good,bad]));assert.equal(api.snapshot().runs.length,count);
});
test('model records persist four-level classification and reject incomplete imports atomically',async()=>{
  const model={id:'SHIP01',mxmc:'测试舰船',mxlx:'SHIP01',mxnm:'CMRM0300000000099',lxzymc:'测试舰船',lxzynm:'a1b2c3d4-0000-4000-8000-000000000099',bzlx:'SHIP01',commandType:'SHIP01',FirstCfn:'物资',SecondCfn:'海上',ThirdCfn:'舰船',ForthCfn:'无',description:'分类持久化测试'};
  await api.addModel(model);
  const saved=api.snapshot().models.find(item=>item.id===model.id);
  assert.deepEqual([saved.FirstCfn,saved.SecondCfn,saved.ThirdCfn,saved.ForthCfn],['物资','海上','舰船','无']);
  assert.equal(saved.mxmc,'测试舰船');assert.equal(saved.mxlx,'SHIP01');
  const count=api.snapshot().models.length;
  await assert.rejects(api.importModels([{...model,id:'BAD01',mxlx:'BAD01',mxnm:'CMRM0300000000100',FirstCfn:''}]));
  assert.equal(api.snapshot().models.length,count);
});
test('reload preserves generated configured weapon actions without applying legacy migration',async()=>{
  const p=await api.createPlan('刷新指令测试',true);
  p.entities.push(...createMountedEntityBatch(models[2],p.entities[0],1,3,'ammo'));
  const type={...defaultActionType,launch:true};
  p.actions=[syncActionTargets(makeConfiguredAction(type,defaultActionValues(p,p.entities[0].id),p.entities[0].id),p)];
  p.generated=generate(p);await api.savePlan(p);
  const saved=api.snapshot();globalThis.localStorage.getItem=()=>JSON.stringify(saved);
  globalThis.setInterval=()=>1;
  try{
    const {api:reloaded}=await import('../frontend/api.js?reload-configured-actions');
    const after=reloaded.snapshot().plans.find(plan=>plan.id===p.id);
    assert.equal(after.revision,p.revision);
    assert.equal(after.actions[0].weaponModelId,null);
    assert.deepEqual(after.generated,p.generated);
  }finally{globalThis.setInterval=realInterval;globalThis.localStorage.getItem=()=>null;}
});

test('old action timing flags are removed while entered times survive browser migration',async()=>{
  const p=await api.createPlan('旧时间配置迁移',true);
  const values={...defaultActionValues(p,p.entities[0].id),start_time:120,end_time:300};
  const action=syncActionTargets(makeConfiguredAction(defaultActionType,values,p.entities[0].id),p);
  action.definition.start_time=false;action.definition.end_time=false;action.start=0;action.end=0;
  p.actions=[action];await api.savePlan(p);
  const saved=api.snapshot();globalThis.localStorage.getItem=()=>JSON.stringify(saved);globalThis.setInterval=()=>1;
  try{
    const {api:reloaded}=await import('../frontend/api.js?migrate-timing-flags');
    const after=reloaded.snapshot().plans.find(plan=>plan.id===p.id);
    assert.equal(after.actions[0].start,120);assert.equal(after.actions[0].end,300);
    assert.equal('start_time' in after.actions[0].definition,false);assert.equal('end_time' in after.actions[0].definition,false);
    assert.equal(generate(after).commands.rules[0].ruledata[0].action[0].start_time,120);
  }finally{globalThis.setInterval=realInterval;globalThis.localStorage.getItem=()=>null;}
});
