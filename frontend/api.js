import { defaultActionType, normalizeActionType } from './action-schema.js';
import { models, clone, uid, createPlan, createEntity, createMountedEntityBatch, createAction, copyPlan, generate, validate, entityId } from './core.js';
const KEY='simtest-demo-v1';
const MODEL_ENDPOINT='/api/models';
const now=()=>new Date().toISOString();
const categoryKeys=['FirstCfn','SecondCfn','ThirdCfn','ForthCfn'];
const normalizeModel=model=>{const builtin=models.find(m=>m.id===model.id||m.mxlx===model.mxlx),mxlx=model.mxlx?.trim()||model.id?.trim(),mxmc=model.mxmc?.trim();return {...model,id:mxlx,mxlx,mxmc,mxnm:model.mxnm?.trim()||mxlx,lxzymc:model.lxzymc?.trim()||mxmc,lxzynm:model.lxzynm?.trim()||crypto.randomUUID(),commandType:model.commandType?.trim()||mxlx,...Object.fromEntries(categoryKeys.map((key,index)=>[key,model[key]?.trim()||builtin?.[key]||(index===3?'无':'未分类')]))};};
const assertModel=model=>{if(!model||['mxmc','mxlx',...categoryKeys].some(key=>typeof model[key]!=='string'||!model[key].trim()))throw new Error('装备名称、型号编号和四级分类均为必填项。');if(model.id!=null&&String(model.id).trim()!==model.mxlx.trim())throw new Error('型号内部标识必须与型号编号一致。');};
const request=async(path,options={})=>{const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});let body={};try{body=await response.json();}catch{}if(!response.ok)throw new Error(body.error||`服务请求失败（${response.status}）。`);return body;};
function seed(){
  const names=['基础行动验证','多实体协同行动','挂载数量边界验证','实体部署与航路验证','新模型接入验证'];
  const plans=names.map((name,i)=>{
    const p=createPlan(name);p.description=['验证完整的想定、指令生成与行动判读流程。','为多个实体配置独立行动，检查指令展开与引用关系。','检查计划使用量与实体初始挂载的一致性。','通过地图调整部署位置与行动航路。','加载模型配置，建立新的仿真实体。'][i];
    if(i===4)return p;
    p.entities=[createEntity(models[0],'Blue',1,120.1,30.2),createEntity(models[1],'Red',1,122.5,29.5)];
    p.actions=[createAction(p.entities[0].id,p.entities[1].id)];
    if(i===1){p.entities.push(createEntity(models[0],'Blue',2,120.5,28.8));p.actions.push(createAction(p.entities[2].id,p.entities[1].id,900));}
    if(i===2){p.entities.push(...createMountedEntityBatch(models[2],p.entities[0],1,4,'ammo'));p.actions[0].weapon=true;p.actions[0].weaponModelId=models[2].id;p.actions[0].count=5;}
    if(i===3)p.actions[0].route=[{longitude:121,latitude:30,height:0},{longitude:122,latitude:30.5,height:0}];
    if(i<2)p.generated=generate(p);
    return p;
  });
  return {plans,models:clone(models),runs:[],settings:{scenarioRoot:'./data/scenarios',commandRoot:'./data/commands',runsRoot:'./data/runs',simulator:'',replay:'',timeout:3600},version:3};
}
let db;
try{db=JSON.parse(localStorage.getItem(KEY));if(!db||!Array.isArray(db.plans))db=seed();}catch{db=seed();}
const obsoleteModelIds=new Set(['HANG01','AMDP01']);
const existingModels=(Array.isArray(db.models)?db.models:[]).filter(model=>!obsoleteModelIds.has(model.id));
for(const builtin of models)if(!existingModels.some(model=>model.id===builtin.id||model.mxnm===builtin.mxnm))existingModels.push(clone(builtin));
db.models=existingModels.map(normalizeModel);
for(const plan of db.plans){
  plan.entities??=[];let migrated=false;
  for(const action of plan.actions||[])if(action.definition){
    const hadTimingFlags='start_time' in action.definition||'end_time' in action.definition;
    action.definition=normalizeActionType(action.definition);
    action.start=action.values?.start_time;action.end=action.values?.end_time;
    if(hadTimingFlags)migrated=true;
  }
  for(const entity of plan.entities){const legacyId=entity.model?.id;if(obsoleteModelIds.has(legacyId)){const replacement=models.find(model=>model.id===(legacyId==='HANG01'?'MX02':'AMMO01')),suffix=entity.name?.match(/\d+$/)?.[0]||'01';entity.model=clone(replacement);entity.name=`${replacement.mxmc} ${suffix}`;entity.mountKind=legacyId==='HANG01'?'Hang':'AmDp';migrated=true;}const catalog=db.models.find(model=>model.id===entity.model?.id||model.mxlx===entity.model?.mxlx);entity.model=normalizeModel({...catalog,...entity.model});entity.parentId??=null;entity.mountKind??=null;}
  const additions=[];
  for(const parent of plan.entities.filter(entity=>!entity.parentId))for(const [legacyKey,mountKind,modelId] of [['ammo','ammo','AMMO01'],['hang','Hang','MX02'],['equipment','AmDp','AMMO01']]){const count=Number.isSafeInteger(parent[legacyKey])&&parent[legacyKey]>0?parent[legacyKey]:0;if(count){const model=db.models.find(item=>item.id===modelId),start=plan.entities.filter(entity=>entity.parentId===parent.id&&entity.model.id===modelId&&entity.mountKind===mountKind).length+1;additions.push(...createMountedEntityBatch(model,parent,start,count,mountKind));migrated=true;}delete parent[legacyKey];}
  plan.entities.push(...additions);
  for(const parent of plan.entities.filter(entity=>!entity.parentId))if(!plan.entities.some(entity=>entity.parentId===parent.id&&entity.mountKind==='Hang'))for(const entity of plan.entities.filter(entity=>entity.parentId===parent.id&&entity.mountKind==='AmDp')){entity.mountKind='ammo';migrated=true;}
  for(const action of plan.actions||[])if(!action.definition&&action.weapon&& !action.weaponModelId){action.weaponModelId='AMMO01';migrated=true;}
  if(migrated){plan.generated=null;plan.revision=(plan.revision||0)+1;plan.updated=now();}
}
db.version=6;
db.actionTypes=(db.actionTypes||[clone(defaultActionType)]).map(normalizeActionType);
let actionCatalogError='',actionCatalogReady=false;
// Reload never turns an unfinished mock run into a success.
for(const r of db.runs)if(['queued','running','collecting'].includes(r.status)){r.status='interrupted';r.logs.push('页面重新加载，模拟执行已中断。');}
let storageError=false;
let catalogMode='fallback',catalogError='',catalogInitialized=false;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(db));storageError=false;}catch{storageError=true;}};
persist();
const emit=()=>{persist();window.dispatchEvent(new CustomEvent('simtest:update'));};
const delay=()=>new Promise(r=>setTimeout(r,100));
function complete(r){
  r.status='done';r.finished=now();r.progress=100;
  r.results=r.plan.actions.map((a,i)=>{
    const e=r.plan.entities.find(e=>e.id===a.executor),t=r.plan.entities.find(e=>e.id===a.targets[0]);
    const verdict=r.outcome==='success'?'pass':r.outcome==='missing'&&i===0?'fail':'review';
    return {actionId:a.id,name:a.name,code:a.code,executor:e.name,target:t?.name||'—',time:a.start+10,
      verdict,reason:verdict==='pass'?'模拟证据唯一关联，示例成功条件满足。':verdict==='fail'?'模拟输出已完整，未发现本条行动要求的事件。':'未配置真实行动判读规则，结果需复核。',
      evidence:verdict==='fail'?null:{mock:true,action_id:a.id,srcID:entityId(e),targetID:t?entityId(t):'',timeStamp:String(a.start+10),eventType:'DEMO_ACTION',state:verdict==='pass'?'success':'running',message:'前端模拟事件，仅用于交互演示。'}};
  });
  r.verdict=r.results.some(x=>x.verdict==='fail')?'fail':r.results.every(x=>x.verdict==='pass')?'pass':'review';
  r.logs.push('模拟产物已收集，逐行动判读完成。');
}
setInterval(()=>{
  let r=db.runs.find(r=>['running','collecting'].includes(r.status));
  if(!r){r=[...db.runs].reverse().find(r=>r.status==='queued');if(!r)return;r.status='running';r.started=now();r.progress=5;r.logs.push('开始模拟执行；未调用外部仿真器。');emit();return;}
  r.progress+=9;
  if(r.progress>=45&&r.outcome==='error'){r.status='failed';r.finished=now();r.logs.push('模拟错误：仿真器退出码 1。已隔离，队列继续。');}
  else if(r.progress>=100)complete(r);
  else if(r.progress>=80&&r.status==='running'){r.status='collecting';r.logs.push('正在生成本次运行的模拟产物。');}
  emit();
},650);

// Replace this adapter with HTTP calls without coupling pages to persistence or simulation.
export const api={
  mode:'hybrid',
  snapshot(){return {...clone(db),storageError,catalogMode,catalogError,actionCatalogError,actionCatalogReady};},
  async initializeActions(){
    try{const result=await request('/api/action-types',{cache:'no-store'});if(!Array.isArray(result.items))throw new Error('行动目录返回格式不正确。');db.actionTypes=result.items;actionCatalogReady=true;actionCatalogError='';}
    catch(error){actionCatalogReady=false;actionCatalogError=error.message;}
    emit();
  },
  async saveActionType(value,editing=false){
    if(!actionCatalogReady)throw new Error('行动数据库未连接，请刷新页面后重试。');
    const {item}=await request('/api/action-types'+(editing?'/'+encodeURIComponent(value.rule_type_code):''),{method:editing?'PUT':'POST',body:JSON.stringify(value)});
    const index=db.actionTypes.findIndex(t=>t.rule_type_code===item.rule_type_code);if(index<0)db.actionTypes.push(item);else db.actionTypes[index]=item;emit();return clone(item);
  },
  async initialize(){
    try{
      catalogError='';
      let remote=(await request(MODEL_ENDPOINT,{cache:'no-store'})).items;
      if(!Array.isArray(remote))throw new Error('模型服务返回格式不正确。');
      const missing=db.models.filter(local=>!remote.some(item=>item.mxlx===local.mxlx||item.mxnm===local.mxnm));
      if(missing.length){
        try{await request(`${MODEL_ENDPOINT}/import`,{method:'POST',body:JSON.stringify(missing)});}
        catch(error){catalogError=`旧浏览器型号未全部迁移：${error.message}`;}
        remote=(await request(MODEL_ENDPOINT,{cache:'no-store'})).items;
      }
      db.models=remote.map(normalizeModel);catalogMode='backend';catalogInitialized=true;emit();return clone(db.models);
    }catch(error){catalogMode='fallback';catalogInitialized=true;catalogError=error.message||'模型数据库连接失败。';emit();return clone(db.models);}
  },
  async savePlan(plan){await delay();const p=clone(plan);p.updated=now();const i=db.plans.findIndex(x=>x.id===p.id);if(i<0)db.plans.unshift(p);else db.plans[i]=p;emit();return clone(p);},
  async createPlan(name,example=false){const p=example?copyPlan(seed().plans[0]):createPlan(name);p.name=name;return this.savePlan(p);},
  async copyPlan(id){return this.savePlan(copyPlan(db.plans.find(p=>p.id===id)));},
  async archivePlan(id){db.plans.find(p=>p.id===id).archived=!db.plans.find(p=>p.id===id).archived;emit();},
  async generate(plan){const p=clone(plan);p.generated=actionCatalogReady?(await request('/api/generate',{method:'POST',body:JSON.stringify(p)})).files:generate(p);await this.savePlan(p);return p;},
  async enqueue(plans,outcome='review'){
    await delay();const batchId=uid('batch_');const output=[];
    for(const p of plans){const check=validate(p);if(check.errors.length)throw new Error(check.errors[0].message);}
    for(const p of plans){const run={id:uid('run_'),batchId,plan:clone(p),files:generate(p),status:'queued',created:now(),progress:0,outcome,verdict:null,results:[],logs:['已保存输入快照。','运行模式：前端模拟；模拟场景：'+outcome],review:null};db.runs.unshift(run);output.push(run);}
    emit();return clone(output);
  },
  async cancel(id){const r=db.runs.find(r=>r.id===id);if(r&&['queued','running','collecting'].includes(r.status)){r.status='cancelled';r.finished=now();r.logs.push('用户已取消模拟执行。');emit();}},
  async review(id,verdict,note){const r=db.runs.find(r=>r.id===id);r.reviews??=[];r.reviews.push({verdict,note,time:now()});r.review=r.reviews.at(-1);emit();},
  async saveSettings(settings){db.settings=clone(settings);emit();},
  async addModel(model){assertModel(model);if(db.models.some(m=>m.mxlx===model.mxlx||m.mxnm===model.mxnm))throw new Error('型号编号或模型编码已存在。');if(catalogInitialized&&catalogMode!=='backend')throw new Error('装备数据库未连接，当前不能新增型号。');const saved=catalogMode==='backend'?(await request(MODEL_ENDPOINT,{method:'POST',body:JSON.stringify(model)})).item:model;db.models.push(normalizeModel(clone(saved)));emit();return clone(saved);},
  async importModels(list){
    if(!Array.isArray(list)||!list.length)throw new Error('配置必须是非空模型数组。');
    const candidate=[...db.models];
    const normalized=[];
    for(const m of list){assertModel(m);if(candidate.some(x=>x.mxlx===m.mxlx||x.mxnm===m.mxnm))throw new Error('存在重复的型号编号或模型编码，未导入任何条目。');const model=normalizeModel({...m,bzlx:m.bzlx??m.mxlx,description:m.description||'从本地配置导入。'});candidate.push(model);normalized.push(model);}
    if(catalogInitialized&&catalogMode!=='backend')throw new Error('装备数据库未连接，当前不能导入型号。');
    const saved=catalogMode==='backend'?(await request(`${MODEL_ENDPOINT}/import`,{method:'POST',body:JSON.stringify(normalized)})).items:normalized;
    db.models.push(...saved.map(normalizeModel));emit();return clone(saved);
  }
};
