import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {ModelStore} from '../backend/model-store.mjs';
import {ActionStore} from '../backend/action-store.mjs';
import {createSimTestServer} from '../scripts/serve.mjs';
import {flagFields,actionFields,configFields,defaultActionType,defaultActionValues,makeConfiguredAction,syncActionTargets,referenceId} from '../frontend/action-schema.js';
import {models,createPlan,createEntity,createMountedEntityBatch,generate,validate,copyPlan} from '../frontend/core.js';
const flags=enabled=>Object.fromEntries(Object.keys(flagFields).map(key=>[key,enabled.includes(key)]));
function fixture(all=false){const p=createPlan('行动配置测试');p.entities=[createEntity(models[0],'Blue'),createEntity(models[1],'Red')];p.entities.push(...createMountedEntityBatch(models[2],p.entities[0],1,6,'ammo'));const type={...defaultActionType,rule_type_code:'123456',xdmc:'可配置行动',...(all?flags(Object.keys(flagFields)):{})},values=defaultActionValues(p,p.entities[0].id);values.supply.weapon_type=['AMMO01'];return {p,type,values};}
function append(p,type,values){const a=syncActionTargets(makeConfiguredAction(type,values,p.entities[0].id),p);p.actions.push(a);return a;}

test('schema covers every action and ruleconfig field in the supplied JSON example',async()=>{
 const sample=JSON.parse(await readFile(new URL('../模版文档/示例_指令模版.json',import.meta.url),'utf8')).rules[0].ruledata[0];
 assert.deepEqual(Object.keys(actionFields).sort(),Object.keys(sample.action[0]).filter(k=>k!=='rule_type_code').sort());
 assert.deepEqual(Object.keys(configFields).sort(),Object.keys(sample.ruleconfig[0]).sort());
});
test('all enabled nested fields preserve user values including actual false strategy values',()=>{
 const {p,type,values}=fixture(true);values.is_auto_attack=false;values.jam={jam_type:'communication',jam_mode:'spot'};values.launch[0].target_child_id='child-1';values.launch[0].way_points=[{longitude:121,latitude:30,height:10,order:3}];values.executor[0].formation_struct[0].entity_name='用户编成';append(p,type,values);
 assert.deepEqual(validate(p).errors,[]);const group=generate(p).commands.rules[0].ruledata[0];
 assert.equal(group.ruleconfig[0].is_auto_attack,false);assert.deepEqual(group.action[0].jam,values.jam);
 for(const key of Object.keys(actionFields).filter(k=>k!=='action_id'))assert.deepEqual(group.action[0][key],values[key],key);
 assert.deepEqual(Object.keys(group.ruleconfig[0]).sort(),Object.keys(configFields).sort());
});
test('disabled fields are omitted and do not require values or targets',()=>{
 const {p}=fixture();const type={rule_type_code:'654321',xdmc:'无目标行动',...flags(['action_id','jam'])};append(p,type,{start_time:0,end_time:600,jam:{jam_type:'radar',jam_mode:'block'},target:[{target_id:'ignored'}]});
 assert.deepEqual(validate(p).errors,[]);const group=generate(p).commands.rules[0].ruledata[0];assert.deepEqual(Object.keys(group.action[0]).sort(),['action_id','end_time','jam','rule_type_code','start_time']);assert.deepEqual(group.ruleconfig,[]);
});
test('batch instances have unique IDs and differing strategies remain in separate ruledata groups',()=>{
 const {p,type,values}=fixture();for(let i=0;i<3;i++)append(p,type,values);
 const other={...values,is_auto_attack:false};append(p,type,other);
 const groups=generate(p).commands.rules[0].ruledata;assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.action.length),[3,1]);assert.equal(new Set(groups.flatMap(g=>g.action.map(a=>a.action_id))).size,4);
 assert.equal(groups[0].ruleconfig[0].is_auto_attack,true);assert.equal(groups[1].ruleconfig[0].is_auto_attack,false);
});
test('required nested fields, inventory totals and current entity references are validated',()=>{
 const {p,type,values}=fixture(true);const a=append(p,type,values);
 delete a.values.jam.jam_mode;assert.throws(()=>generate(p),/干扰模式/);a.values.jam.jam_mode='block';
 a.values.supply.weapon_count=[1,2];assert.throws(()=>generate(p),/一一对应/);a.values.supply.weapon_count=[1];
 a.values.target[0].target_id='deleted';assert.throws(()=>generate(p),/目标/);a.values.target=values.target;
 a.values.is_auto_return={auto_return:true,airport_id:referenceId(p.entities[1])};assert.throws(()=>generate(p),/机场/);a.values.is_auto_return={auto_return:true,airport_id:referenceId(p.entities[0])};
 a.values.launch[0].weapon_num=4;append(p,type,a.values);assert.throws(()=>generate(p),/计划使用 8/);
});
test('copy rewrites configured references while preserving type snapshots',()=>{
 const {p,type,values}=fixture(true);append(p,type,values);const copy=copyPlan(p);assert.deepEqual(validate(copy).errors,[]);
 assert.notEqual(copy.actions[0].values.executor[0].executor_id,p.actions[0].values.executor[0].executor_id);assert.notEqual(copy.actions[0].values.target[0].target_id,p.actions[0].values.target[0].target_id);assert.notEqual(copy.actions[0].id,p.actions[0].id);assert.deepEqual(copy.actions[0].definition,type);
});
test('SQLite stores one boolean column per action flag and persists edits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'actions-db-')),file=join(dir,'db.sqlite');let models;
 try{models=new ModelStore(file);let store=new ActionStore(models.database);const type={...defaultActionType,rule_type_code:'123456',xdmc:'巡逻',route:true,is_auto_attack:false};store.create(type);assert.deepEqual(store.get('123456'),type);
 const schema=models.database.prepare('PRAGMA table_info(action_types)').all();assert.equal(schema.length,Object.keys(flagFields).length+2);assert.throws(()=>store.create({...type,rule_type_code:'222222',route:'true'}),/布尔/);assert.throws(()=>store.create(type),/已存在/);
 store.update(type.rule_type_code,{...type,jam:true});models.close();models=new ModelStore(file);store=new ActionStore(models.database);assert.equal(store.get('123456').jam,true);
 }finally{models?.close();await rm(dir,{recursive:true,force:true});}
});
test('action API saves flags and server generates configured actions with validation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'actions-http-')),server=createSimTestServer({databasePath:join(dir,'db.sqlite')});server.listen(0,'127.0.0.1');await once(server,'listening');const url=`http://127.0.0.1:${server.address().port}`;
 const request=(path,body,method='POST')=>fetch(url+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{const {p,type,values}=fixture(true);let res=await request('/api/action-types',type);assert.equal(res.status,201);assert.deepEqual((await res.json()).item,type);
 res=await request('/api/action-types/'+type.rule_type_code,{...type,is_auto_attack:false},'PUT');assert.equal(res.status,200);
 append(p,type,values);res=await request('/api/generate',p);assert.equal(res.status,200);const output=(await res.json()).files;assert.equal(output.commands.rules[0].ybnm,output.scenario.ybnm);assert.ok(output.commands.rules[0].ruledata[0].action[0].jam);
 delete p.actions[0].values.executor[0].formation_struct;res=await request('/api/generate',p);assert.equal(res.status,200);assert.equal('formation_struct' in (await res.json()).files.commands.rules[0].ruledata[0].action[0].executor[0],false);
 for(const key of ['start_time','end_time']){const previous=p.actions[0].values[key];delete p.actions[0].values[key];res=await request('/api/generate',p);assert.equal(res.status,400);p.actions[0].values[key]=previous;}
 p.actions[0].values.jam=null;res=await request('/api/generate',p);assert.equal(res.status,400);
 res=await request('/api/action-types',{...type,rule_type_code:'222222',route:'true'});assert.equal(res.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test('timing is mandatory even with no flags or old disabled timing flags',()=>{
 const {p}=fixture();const type={rule_type_code:'654321',xdmc:'纯时间行动',...flags([])};
 const a=append(p,type,{start_time:0,end_time:600});
 assert.equal('start_time' in a.definition,false);assert.equal('end_time' in a.definition,false);
 assert.deepEqual(generate(p).commands.rules[0].ruledata[0].action[0],{rule_type_code:'654321',start_time:0,end_time:600});
 a.definition.start_time=false;a.definition.end_time=false;
 for(const key of ['start_time','end_time']){
   const previous=a.values[key];
   for(const value of [undefined,null,'',-1,1.5,Infinity]){a.values[key]=value;assert.throws(()=>generate(p),/时间/);}
   a.values[key]=previous;
 }
 a.values.start_time=601;assert.throws(()=>generate(p),/结束不早于开始/);
 a.values.start_time=0;a.values.end_time=999999;assert.throws(()=>generate(p),/仿真时长/);
});
test('existing action tables drop only timing flags and preserve type data across restarts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'actions-migration-'));let models;
 try{
   models=new ModelStore(join(dir,'db.sqlite'));let store=new ActionStore(models.database);
   const custom={...defaultActionType,rule_type_code:'987654',xdmc:'已有自定义行动',jam:true,target:false};store.create(custom);
   models.database.exec('ALTER TABLE action_types ADD COLUMN start_time INTEGER NOT NULL DEFAULT 0 CHECK (start_time IN (0,1)); ALTER TABLE action_types ADD COLUMN end_time INTEGER NOT NULL DEFAULT 1 CHECK (end_time IN (0,1));');
   const equipment=models.list();store=new ActionStore(models.database);
   const columns=models.database.prepare('PRAGMA table_info(action_types)').all().map(c=>c.name);
   assert.equal(columns.includes('start_time'),false);assert.equal(columns.includes('end_time'),false);
   assert.equal(columns.length,23);assert.deepEqual(store.get(custom.rule_type_code),custom);assert.deepEqual(models.list(),equipment);
   store.update(custom.rule_type_code,{...custom,route:true});store=new ActionStore(models.database);assert.equal(store.get(custom.rule_type_code).route,true);
 }finally{models?.close();await rm(dir,{recursive:true,force:true});}
});

test('executor formation is optional, omitted when absent or empty, and validated when filled',()=>{
 const {p,type,values}=fixture();const a=append(p,type,values);
 const formation=structuredClone(a.values.executor[0].formation_struct);
 for(const value of [undefined,[]]){
   a.values.executor[0].formation_struct=value;
   assert.deepEqual(validate(p).errors,[]);
   const executor=generate(p).commands.rules[0].ruledata[0].action[0].executor[0];
   assert.equal('formation_struct' in executor,false);
   assert.equal(executor.executor_id,referenceId(p.entities[0]));
   assert.deepEqual(executor.mount,values.executor[0].mount);
   assert.deepEqual(validate(copyPlan(p)).errors,[]);
 }
 a.values.executor[0].formation_struct=[{}];assert.throws(()=>generate(p),/编成编号/);
 a.values.executor[0].formation_struct=formation;
 assert.deepEqual(generate(p).commands.rules[0].ruledata[0].action[0].executor[0].formation_struct,formation);
});
