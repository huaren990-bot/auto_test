import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { models, mountKinds, modelClassification, modelMountRole, mountKindAcceptsModel, deployedEntities, mountedEntities, mountedWeaponEntities, createPlan, createEntity, createEntityBatch, createMountedEntityBatch, setMountGroupCount, createAction, copyPlan, entityId, validate, generate, makeZip, pairNames } from '../frontend/core.js';

function fixture(){const p=createPlan('字段一致性验证');p.entities=[createEntity(models[0],'Blue'),createEntity(models[1],'Red')];p.actions=[createAction(p.entities[0].id,p.entities[1].id)];return p;}

test('built-in models retain the four-level classifications from the entity-state example',()=>{
  assert.deepEqual(modelClassification(models[0]),['设施','陆上','机场','无']);
  assert.deepEqual(modelClassification(models[1]),['物资','空中','飞机','无']);
  assert.deepEqual(mountKinds.map(item=>item.name),['武器','机库','武器库']);
  assert.equal(models.length,3);
  assert.ok(models.every(model=>!['HANG01','AMDP01'].includes(model.id)));
  assert.equal(modelMountRole(models[1]),'aircraft');
  assert.equal(modelMountRole(models[2]),'weapon');
});

test('batch creation builds unique same-model entities and applies formation only when selected',()=>{
  const ordinary=createEntityBatch(models[0],'Blue',3,120,30,4,false);
  assert.equal(ordinary.length,4);
  assert.equal(new Set(ordinary.map(e=>e.id)).size,4);
  assert.equal(new Set(ordinary.map(entityId)).size,4);
  assert.ok(ordinary.every(e=>e.model.id===models[0].id&&e.bzlx===null&&entityId(e)===e.zyId));
  assert.ok(new Set(ordinary.map(e=>`${e.lon},${e.lat}`)).size>1);
  assert.deepEqual(ordinary.map(e=>e.name),['蓝方平台 03','蓝方平台 04','蓝方平台 05','蓝方平台 06']);
  const formations=createEntityBatch(models[1],'Red',1,121,31,3,true);
  assert.ok(formations.every(e=>e.bzlx===models[1].bzlx&&entityId(e)===e.llbznm));
});

test('generated inputs share title and reference exact scenario instance IDs',()=>{
  const p=fixture(),f=generate(p),a=f.commands.rules[0].ruledata[0].action[0];
  assert.equal(f.scenario.ybnm,f.commands.rules[0].ybnm);
  assert.equal(a.executor[0].executor_id,f.scenario.yb[0].data.resource.trooplist[0].llbznm);
  assert.equal(a.target[0].target_id,f.scenario.yb[1].data.resource.trooplist[0].llbznm);
  assert.equal(f.scenario.yb[0].data.resource.trooplist[0].lstEquip[0].mxlx,'MX01');
  assert.equal(f.scenario.yb[0].data.resource.trooplist[0].lstEquip[0].mxnm,'CMRM0300000000001');
  assert.ok(Array.isArray(f.commands.rules[0].ruledata[0].ruleconfig));
});
test('empty bzlx uses zyId for executor and target without renaming the sample key',()=>{
  const p=fixture();p.entities.forEach(e=>e.bzlx=null);const f=generate(p),a=f.commands.rules[0].ruledata[0].action[0];
  assert.equal(a.executor[0].executor_id,p.entities[0].zyId);assert.equal(a.target[0].target_id,p.entities[1].zyId);
  assert.equal(f.scenario.yb[0].data.resource.trooplist[0].bzlx,null);
  assert.equal(f.scenario.yb[0].data.resource.trooplist[0].lstEquip[0].zyid,undefined);
});
test('copy rewrites all instance references while keeping original plan unchanged',()=>{
  const p=fixture();p.entities.push(...createMountedEntityBatch(models[2],p.entities[0],1,2,'ammo'));
  const before=structuredClone(p),copy=copyPlan(p);assert.notEqual(p.id,copy.id);
  assert.notEqual(entityId(p.entities[0]),entityId(copy.entities[0]));
  assert.equal(copy.actions[0].executor,copy.entities[0].id);assert.equal(copy.actions[0].targets[0],copy.entities[1].id);
  assert.equal(mountedEntities(copy,copy.entities[0].id,'ammo').length,2);
  assert.ok(mountedEntities(copy,copy.entities[0].id,'ammo').every(entity=>entity.parentId!==p.entities[0].id));
  assert.deepEqual(p,before);assert.equal(validate(copy).errors.length,0);
});
test('cumulative inventory is checked, not merely each action in isolation',()=>{
  const p=fixture();p.entities.push(...createMountedEntityBatch(models[2],p.entities[0],1,4,'ammo'));
  p.actions[0].weapon=true;p.actions[0].weaponModelId=models[2].id;p.actions[0].count=2;
  p.actions.push({...createAction(p.entities[0].id,p.entities[1].id),weapon:true,weaponModelId:models[2].id,count:3});
  assert.ok(validate(p).errors.some(e=>e.message.includes('计划使用 5')));
  assert.throws(()=>generate(p));p.actions[1].count=2;assert.equal(validate(p).errors.length,0);
  const f=generate(p);assert.equal(f.commands.rules[0].ruledata[0].action[0].launch[0].weapon_type,'AMMO01');
});
test('mounted items are entities and aggregate into their parent export branches',()=>{
  const p=fixture(),parent=p.entities[0];parent.height=320;
  p.entities.push(...createMountedEntityBatch(models[2],parent,1,2,'ammo'));
  p.entities.push(...createMountedEntityBatch(models[1],parent,1,1,'Hang'));
  p.entities.push(...createMountedEntityBatch(models[2],parent,1,2,'AmDp'));
  p.actions[0].weapon=true;p.actions[0].weaponModelId=models[2].id;p.actions[0].count=2;
  assert.equal(p.entities.length,7);assert.equal(deployedEntities(p).length,2);
  assert.equal(mountedEntities(p,parent.id).length,5);
  assert.ok(mountedEntities(p,parent.id).every(entity=>entity.side===parent.side&&entity.lon===parent.lon&&entity.lat===parent.lat&&entity.height===parent.height));
  const f=generate(p),equip=f.scenario.yb[0].data.resource.trooplist[0].lstEquip[0],action=f.commands.rules[0].ruledata[0].action[0];
  assert.equal(f.scenario.yb[0].data.resource.trooplist.length,1);
  assert.deepEqual([equip.ammo[0].sl,equip.Hang[0].count,equip.AmDp[0].count],[2,1,2]);
  assert.equal(equip.ammo[0].mxmc,models[2].mxmc);
  assert.equal(equip.Hang[0].ModelType,models[1].mxlx);
  assert.equal(equip.AmDp[0].ModelType,models[2].mxlx);
  assert.equal(action.executor[0].mount[0].num,4);
  assert.equal(action.launch[0].weapon_type,models[2].mxlx);
});
test('mount relations accept actual aircraft or weapon models and weapon library requires a hangar',()=>{
  const p=fixture(),parent=p.entities[0];
  assert.equal(mountKindAcceptsModel('Hang',models[1]),true);
  assert.equal(mountKindAcceptsModel('AmDp',models[2]),true);
  assert.throws(()=>createMountedEntityBatch(models[2],parent,1,1,'Hang'));
  assert.throws(()=>createMountedEntityBatch(models[1],parent,1,1,'AmDp'));
  p.entities.push(...createMountedEntityBatch(models[2],parent,1,2,'AmDp'));
  assert.ok(validate(p).errors.some(error=>error.message.includes('需先挂载机库')));
  p.entities.push(...createMountedEntityBatch(models[1],parent,1,1,'Hang'));
  assert.equal(validate(p).errors.length,0);
});
test('weapons in a weapon library are available to actions after a hangar is mounted',()=>{
  const p=fixture(),parent=p.entities[0];
  p.entities.push(...createMountedEntityBatch(models[1],parent,1,1,'Hang'));
  p.entities.push(...createMountedEntityBatch(models[2],parent,1,2,'AmDp'));
  p.actions[0].weapon=true;p.actions[0].weaponModelId=models[2].id;p.actions[0].count=2;
  assert.equal(mountedWeaponEntities(p,parent.id).length,2);
  assert.equal(validate(p).errors.length,0);
  const action=generate(p).commands.rules[0].ruledata[0].action[0];
  assert.equal(action.executor[0].mount[0].num,2);
  assert.equal(action.launch[0].weapon_type,models[2].mxlx);
});
test('mounted entities cannot execute actions or become targets',()=>{
  const p=fixture(),mounted=createMountedEntityBatch(models[2],p.entities[0],1,1,'ammo')[0];p.entities.push(mounted);
  p.actions[0].executor=mounted.id;assert.ok(validate(p).errors.some(error=>error.message.includes('不能作为行动执行者')));
  p.actions[0].executor=p.entities[0].id;p.actions[0].targets=[mounted.id];assert.ok(validate(p).errors.some(error=>error.message.includes('不能作为行动目标')));
});
test('invalid targets, duplicate IDs and time bounds cannot be exported',()=>{
  const p=fixture();p.actions[0].targets=[p.entities[0].id];assert.throws(()=>generate(p));
  p.actions[0].targets=['deleted-id'];assert.throws(()=>generate(p));
  p.actions[0].targets=[p.entities[1].id];p.actions[0].end=12601;assert.throws(()=>generate(p));
  p.actions[0].end=600;p.entities[1].llbznm=p.entities[0].llbznm;assert.throws(()=>generate(p));
});
test('two executors with three actions each form two ruledata groups and six unique action IDs',()=>{
  const p=fixture();p.entities.push(createEntity(models[0],'Blue',2));
  p.actions=[p.entities[0],p.entities[2]].flatMap(e=>Array.from({length:3},()=>createAction(e.id,p.entities[1].id)));
  const f=generate(p),groups=f.commands.rules[0].ruledata;assert.equal(groups.length,2);
  assert.deepEqual(groups.map(g=>g.action.length),[3,3]);
  assert.equal(new Set(groups.flatMap(g=>g.action.map(a=>a.action_id))).size,6);
});
test('ZIP preserves Chinese filenames and separate same-name inputs with valid CRC',async()=>{
  const p=fixture(),f=generate(p),name='中文方案.json',tmp=await mkdtemp(join(tmpdir(),'simtest-zip-'));
  try{const file=join(tmp,'pair.zip');await writeFile(file,makeZip({['scenario/'+name]:JSON.stringify(f.scenario),['command/'+name]:JSON.stringify(f.commands)}));
    const output=execFileSync('python3',['-c','import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; names=z.namelist(); assert len(names)==2; a=json.loads(z.read(names[0])); b=json.loads(z.read(names[1])); assert a["ybnm"]==b["rules"][0]["ybnm"]; print("OK")',file],{encoding:'utf8'});
    assert.equal(output.trim(),'OK');
  }finally{await rm(tmp,{recursive:true,force:true});}
});
test('custom names are kept for single entities and sequenced for batches',()=>{
  assert.deepEqual(createEntityBatch(models[0],'Blue',4,120,30,1,false,'雷达站').map(e=>e.name),['雷达站']);
  assert.deepEqual(createEntityBatch(models[0],'Blue',4,120,30,3,false,'雷达站').map(e=>e.name),['雷达站 01','雷达站 02','雷达站 03']);
  assert.deepEqual(createEntityBatch(models[0],'Blue',4,120,30,2).map(e=>e.name),['蓝方平台 04','蓝方平台 05']);
  const p=fixture();
  assert.deepEqual(createMountedEntityBatch(models[2],p.entities[0],3,1,'ammo','弹药').map(e=>e.name),['弹药']);
  assert.deepEqual(createMountedEntityBatch(models[2],p.entities[0],3,2,'ammo','弹药').map(e=>e.name),['弹药 01','弹药 02']);
  assert.deepEqual(createMountedEntityBatch(models[2],p.entities[0],3,2,'ammo').map(e=>e.name),['某型弹药 03','某型弹药 04']);
});
test('mount group count adjusts in place and keeps the hangar guard',()=>{
  const p=fixture(),parent=p.entities[0];
  p.entities.push(...createMountedEntityBatch(models[2],parent,1,2,'ammo'));
  assert.equal(setMountGroupCount(p,parent.id,'ammo',models[2],4),true);
  assert.equal(mountedEntities(p,parent.id,'ammo').length,4);
  assert.equal(setMountGroupCount(p,parent.id,'ammo',models[2],4),false);
  assert.equal(setMountGroupCount(p,parent.id,'ammo',models[2],1),true);
  assert.equal(mountedEntities(p,parent.id,'ammo').length,1);
  p.entities.push(...createMountedEntityBatch(models[1],parent,1,1,'Hang'));
  p.entities.push(...createMountedEntityBatch(models[2],parent,1,1,'AmDp'));
  assert.throws(()=>setMountGroupCount(p,parent.id,'Hang',models[1],0),/机库/);
  assert.throws(()=>setMountGroupCount(p,parent.id,'ammo',models[2],1000),/999/);
  assert.equal(setMountGroupCount(p,parent.id,'AmDp',models[2],0),true);
  assert.equal(setMountGroupCount(p,parent.id,'Hang',models[1],0),true);
  assert.equal(validate(p).errors.length,0);
});
test('command file carries the _xdzl suffix so the generated pair never collides',()=>{
  const f=generate(fixture()),names=pairNames(f);
  assert.deepEqual(names,{scenario:f.ybnm+'.json',commands:f.ybnm+'_xdzl.json'});
  assert.notEqual(names.scenario,names.commands);
});
