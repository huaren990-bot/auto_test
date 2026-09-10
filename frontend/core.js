import { configuredOutput, validateConfiguredAction, actionConsumption, referenceId } from './action-schema.js';
// Pure domain functions. The UI and future HTTP adapter share these contracts.
export const clone = value => structuredClone(value);
export const uid = (prefix = '') => prefix + crypto.randomUUID().replaceAll('-', '');
export const numericId = () => BigInt('0x' + uid()).toString().slice(0, 33).padStart(33, '0');
export const classificationFields = [
  ['FirstCfn','一级分类'],['SecondCfn','二级分类'],['ThirdCfn','三级分类'],['ForthCfn','四级分类']
];
export const mountKinds = [
  {id:'ammo',name:'武器',itemName:'武器'},
  {id:'Hang',name:'机库',itemName:'飞机'},
  {id:'AmDp',name:'武器库',itemName:'武器',requires:'Hang'}
];
export const modelClassification = model => classificationFields.map(([key])=>model?.[key]?.trim()||'未分类');
export const modelMountRole = model => {
  const category=modelClassification(model).join('/');
  if(/飞机|航空器|飞行器|直升机|无人机|舰载机/.test(category))return 'aircraft';
  if(/武器|弹药|导弹|火箭|炸弹|鱼雷/.test(category))return 'weapon';
  return null;
};
export const mountKindAcceptsModel = (kind,model) => kind==='Hang'?modelMountRole(model)==='aircraft':['ammo','AmDp'].includes(kind)&&modelMountRole(model)==='weapon';
export const models = [
  { id:'MX01', mxmc:'某型装备模型', mxlx:'MX01', mxnm:'CMRM0300000000001', lxzymc:'某型装备', lxzynm:'a1b2c3d4-0000-4000-8000-000000000001', bzlx:'MX01', commandType:'ZB01', FirstCfn:'设施', SecondCfn:'陆上', ThirdCfn:'机场', ForthCfn:'无', description:'标准设施模型，支持实体部署与挂载配置。' },
  { id:'MX02', mxmc:'某型装备模型', mxlx:'MX02', mxnm:'CMRM0300000000002', lxzymc:'某型装备', lxzynm:'a1b2c3d4-0000-4000-8000-000000000002', bzlx:'MX02', commandType:'MX02', FirstCfn:'物资', SecondCfn:'空中', ThirdCfn:'飞机', ForthCfn:'无', description:'空中装备示例模型，可用于双方实体构建。' },
  { id:'AMMO01', mxmc:'某型弹药', mxlx:'AMMO01', mxnm:'AMMO01', lxzymc:'某型弹药', lxzynm:'6a115b01-0000-4000-8000-000000000009', bzlx:null, commandType:'AMMO01', FirstCfn:'物资', SecondCfn:'空中', ThirdCfn:'导弹', ForthCfn:'无', description:'可作为武器实体直接挂载，或挂载到武器库关系中。' }
];
export const duration = p => Math.round((new Date(p.end.replace(' ','T')) - new Date(p.start.replace(' ','T'))) / 1000);
export const entityId = e => e.bzlx?.trim() ? e.llbznm : e.zyId;
export const deployedEntities = plan => plan.entities.filter(entity=>!entity.parentId);
export const mountedEntities = (plan,parentId,kind=null) => plan.entities.filter(entity=>entity.parentId===parentId&&(!kind||entity.mountKind===kind));
export const mountedWeaponEntities = (plan,parentId) => mountedEntities(plan,parentId).filter(entity=>['ammo','AmDp'].includes(entity.mountKind));
export function createEntity(model, side = 'Blue', index = 1, lon = 120.1, lat = 30.2) {
  const n = numericId();
  return { id:uid('ent_'), name:`${side === 'Blue' ? '蓝' : '红'}方平台 ${String(index).padStart(2,'0')}`, side,
    model:clone(model), bzlx:model.bzlx ?? null, llbznm:n, sjllbznm:numericId(), formationId:uid('FORM_'),
    zyId:`${model.mxnm}_${n.slice(0,8)}_${n.slice(8,16)}_${n.slice(16,21)}`,
    lon,lat,height:0,parentId:null,mountKind:null };
}
export function createEntityBatch(model, side = 'Blue', startIndex = 1, lon = 120.1, lat = 30.2, quantity = 1, formation = false) {
  const count=Math.min(50,Math.max(1,Math.trunc(Number(quantity)||1))),columns=Math.ceil(Math.sqrt(count)),spacing=.08;
  const rows=Math.ceil(count/columns),entities=[];
  for(let i=0;i<count;i++){
    const column=i%columns,row=Math.floor(i/columns);
    const e=createEntity(model,side,startIndex+i,
      Math.max(-180,Math.min(180,lon+(column-(columns-1)/2)*spacing)),
      Math.max(-90,Math.min(90,lat+(row-(rows-1)/2)*spacing)));
    e.bzlx=formation?(model.bzlx||model.mxlx||'FORMATION'):null;
    entities.push(e);
  }
  return entities;
}
export function createMountedEntityBatch(model,parent,startIndex=1,quantity=1,mountKind='ammo'){
  if(!mountKinds.some(kind=>kind.id===mountKind))throw new Error('挂载关系无效。');
  if(!mountKindAcceptsModel(mountKind,model))throw new Error(`${mountKinds.find(kind=>kind.id===mountKind).name}不能挂载该分类的实体模型。`);
  const count=Math.max(1,Math.trunc(Number(quantity)||1));
  return Array.from({length:count},(_,index)=>createEntity(model,parent.side,startIndex+index,parent.lon,parent.lat)).map((entity,index)=>({...entity,
    name:`${model.mxmc} ${String(startIndex+index).padStart(2,'0')}`,side:parent.side,parentId:parent.id,mountKind,bzlx:null,height:parent.height
  }));
}
export function createPlan(name = '未命名方案') {
  return { id:uid('plan_'), name, description:'', start:'2027-01-01 10:00:00', end:'2027-01-01 13:30:00',
    revision:1, updated:new Date().toISOString(), archived:false, entities:[], actions:[], generated:null };
}
export function createAction(executor, target, end = 600) {
  return { id:uid('ACT_'), name:'示例行动', code:'000680', executor, targets:target ? [target] : [], start:0,end,
    weapon:false, weaponModelId:null, count:1, route:[] };
}
export function copyPlan(source) {
  const p = clone(source), mapping = {},sourceEntities=p.entities;
  p.id=uid('plan_'); p.name += ' · 副本'; p.revision=1; p.generated=null; p.archived=false;
  p.updated=new Date().toISOString();
  p.entities=sourceEntities.map((e,i)=>{ const n={...createEntity(e.model,e.side,i+1,e.lon,e.lat),name:e.name,height:e.height,bzlx:e.bzlx,parentId:e.parentId||null,mountKind:e.mountKind||null}; mapping[e.id]=n.id; return n; });
  p.entities.forEach((entity,index)=>{entity.parentId=sourceEntities[index].parentId?mapping[sourceEntities[index].parentId]:null;});
  const references=new Map();sourceEntities.forEach((entity,index)=>{references.set(referenceId(entity),referenceId(p.entities[index]));references.set(entity.formationId,p.entities[index].formationId);});
  const rewrite=value=>Array.isArray(value)?value.map(rewrite):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,rewrite(child)])):typeof value==='string'?(references.get(value)||value):value;
  p.actions=p.actions.map(a=>({...a,id:uid('ACT_'),executor:mapping[a.executor],targets:a.targets.map(t=>mapping[t]),...(a.definition?{values:rewrite(a.values)}:{})}));
  return p;
}
export function validate(p) {
  const errors=[], warnings=[];
  const err=(message, tab='actions', entity=null)=>errors.push({message,tab,entity});
  const T=duration(p),roots=deployedEntities(p);
  if(!p.name.trim() || p.name.length>60) err('方案名称必填，且不能超过 60 个字符。','info');
  if(!Number.isFinite(T)||T<=0) err('结束时间必须晚于开始时间。','info');
  if(!roots.length) err('请先在地图上创建至少一个主实体。','map');
  if(!p.actions.length) err('请至少添加一条行动。');
  const seen=new Set();
  for(const e of p.entities){
    if(seen.has(entityId(e))) err('实体编号重复，请重新创建实体。','map',e.id);
    seen.add(entityId(e));
    if(!e.name.trim()) err('实体名称不能为空。','map',e.id);
    if(!['Blue','Red'].includes(e.side)) err(`${e.name}：阵营无效。`,'map',e.id);
    if(e.parentId){const parent=p.entities.find(parent=>parent.id===e.parentId),kind=mountKinds.find(kind=>kind.id===e.mountKind);if(!parent||parent.parentId)err(`${e.name}：所属主实体不存在或不是地图实体。`,'map',e.id);else if(parent.side!==e.side)err(`${e.name}：挂载实体必须与所属主实体阵营一致。`,'map',e.id);if(!kind)err(`${e.name}：挂载关系无效。`,'map',e.id);else if(!mountKindAcceptsModel(e.mountKind,e.model))err(`${e.name}：${kind.name}中只能挂载${kind.itemName}实体。`,'map',e.id);if(e.mountKind==='AmDp'&&parent&&!mountedEntities(p,parent.id,'Hang').length)err(`${e.name}：所属主实体需先挂载机库中的飞机，才能添加武器库中的武器。`,'map',e.id);if(e.bzlx?.trim())err(`${e.name}：挂载实体不能同时作为编队。`,'map',e.id);}
    else if(!Number.isFinite(e.lon)||Math.abs(e.lon)>180||!Number.isFinite(e.lat)||Math.abs(e.lat)>90||!Number.isFinite(e.height)) err(`${e.name}：请填写有效的经纬高。`,'map',e.id);
  }
  const actionIds=new Set();
  for(const a of p.actions){
    if(actionIds.has(a.id)) err('行动编号重复。'); actionIds.add(a.id);
    const e=p.entities.find(e=>e.id===a.executor);
    if(!e) {err('行动执行者不存在，请重新选择。');continue;}
    if(e.parentId)err(`${e.name}：挂载实体不能作为行动执行者。`);
    if(a.definition){for(const message of validateConfiguredAction(a,p))err(`${e.name}：${message}`);continue;}
    if(a.code!=='000680') err(`${a.name}：行动代码未加载。`);
    if(!Number.isSafeInteger(a.start)||!Number.isSafeInteger(a.end)||a.start<0||a.start>a.end||a.end>T) err(`${e.name}：行动时间必须位于 0–${Number.isFinite(T)?T:'有效时长'} 秒内，且结束不早于开始。`);
    if(!a.targets.length) err(`${e.name}：请选择对方目标。`);
    for(const target of a.targets){const t=p.entities.find(e=>e.id===target);if(!t)err(`${e.name}：目标已不存在。`);else if(t.parentId)err(`${e.name}：挂载实体不能作为行动目标。`);else if(t.side===e.side)err(`${e.name}：行动目标必须属于对方阵营。`);}
    if(a.weapon){if(!Number.isSafeInteger(a.count)||a.count<1)err(`${e.name}：武器使用量必须为正整数。`);if(!a.weaponModelId)err(`${e.name}：请选择已挂载的武器实体。`);else if(!mountedWeaponEntities(p,e.id).some(item=>item.model.id===a.weaponModelId))err(`${e.name}：所选武器实体未挂载或已删除。`);}
    if(a.route?.some(pt=>!Number.isFinite(pt.longitude)||Math.abs(pt.longitude)>180||!Number.isFinite(pt.latitude)||Math.abs(pt.latitude)>90||!Number.isFinite(pt.height)))err(`${e.name}：航路点格式或坐标不正确。`);
  }
  for(const e of roots){
    const assigned=p.actions.filter(a=>a.executor===e.id);
    const usage=new Map();
    for(const a of assigned)for(const item of actionConsumption(a,p))usage.set(item.type,(usage.get(item.type)||0)+item.count);
    for(const [type,used] of usage){const items=mountedWeaponEntities(p,e.id).filter(item=>item.model.mxlx===type),available=items.length;if(used>available)err(`${e.name}：${items[0]?.model.mxmc||'武器'} 已挂载 ${available} 个，计划使用 ${used} 个，超出 ${used-available} 个。`,'map',e.id);}
    if(assigned.some((a,i)=>assigned.slice(i+1).some(b=>a.start<=b.end&&b.start<=a.end)))warnings.push({message:`${e.name} 存在时间重叠的行动，结果关联可能需要复核。`,tab:'actions'});
  }
  if(p.actions.length)warnings.push({message:'行动尚未配置真实判读规则；真实结果应待复核。Demo 可注入模拟结果以体验流程。',tab:'actions'});
  return {errors,warnings};
}
export function generate(p, title) {
  const check=validate(p);if(check.errors.length)throw new Error(check.errors[0].message);
  const ybnm=title||`${p.name.replace(/[\\/:*?"<>|\s]/g,'_').slice(0,60)}_${Date.now()}_${uid().slice(0,6)}`;
  const groups=(parentId,kind)=>{const result=new Map();for(const entity of mountedEntities(p,parentId,kind)){const key=entity.model.id,entry=result.get(key)||{model:entity.model,count:0};entry.count++;result.set(key,entry);}return [...result.values()];};
  const weaponGroups=parentId=>{const result=new Map();for(const entity of mountedWeaponEntities(p,parentId)){const key=entity.model.id,entry=result.get(key)||{model:entity.model,count:0};entry.count++;result.set(key,entry);}return [...result.values()];};
  const scenario={cjlx:'DEMO_TYPE',endTime:p.end,startTime:p.start,yb:['Blue','Red'].map((side,i)=>{
    const code=String(i+1).padStart(2,'0');
    return {dwsxnm:code,data:{resource:{dwsxnm:code,trooplist:deployedEntities(p).filter(e=>e.side===side).map(e=>({
      bzmc:e.name,bznm:'',bzlx:e.bzlx?.trim()||null,glph:'',llbznm:e.llbznm,sjllbznm:e.sjllbznm,jznm:null,jd:e.lon,wd:e.lat,gc:e.height,
      lstEquip:[{lxzymc:e.model.lxzymc,lxzynm:e.model.lxzynm,mxlx:e.model.mxlx,mxmc:e.model.mxmc,mxnm:e.model.mxnm,sl:1,zyId:e.zyId,
        AmDp:groups(e.id,'AmDp').map(({model,count})=>({ModelName:model.mxmc,ModelType:model.mxlx,count})),
        Hang:groups(e.id,'Hang').map(({model,count})=>({ModelName:model.mxmc,ModelType:model.mxlx,count})),
        ammo:groups(e.id,'ammo').map(({model,count})=>({lxzymc:model.lxzymc,lxzynm:model.lxzynm,mxlx:model.mxlx,mxmc:model.mxmc,mxnm:model.mxnm,sl:count})),bzmc:e.model.lxzymc,llbznm:e.model.mxlx}]
    }))},dwsxnm:code}};
  }),ybnm};
  const resolve=id=>entityId(p.entities.find(e=>e.id===id));
  const commands={rules:[{fanm:uid(),ybnm,ruledata:p.entities.filter(e=>p.actions.some(a=>a.executor===e.id)).map(e=>{
    const list=p.actions.filter(a=>a.executor===e.id&&!a.definition);
    return {action:list.map(a=>{
      const weapons=weaponGroups(e.id);
      const result={action_id:a.id,related_force:['hs','kd'],executor:[{executor_id:entityId(e),formation_struct:[{formation_id:e.formationId,entity_count:1,entity_name:e.model.mxmc,entity_type:e.model.commandType||e.model.mxlx}],mount:weapons.map(({model,count})=>({mount_type:model.mxlx,mount_type_name:model.mxmc,num:count}))}],target:a.targets.map(id=>({target_id:resolve(id)})),start_time:a.start,end_time:a.end,rule_type_code:a.code};
      if(a.weapon){const weapon=weapons.find(({model})=>model.id===a.weaponModelId)?.model;result.launch=[{target_id:resolve(a.targets[0]),target_child_id:'',weapon_type:weapon.mxlx,weapon_num:a.count,way_points:[]}];}
      if(a.route?.length)result.route=[{points:a.route.map((pt,order)=>({...pt,order}))}];
      return result;
    }),ruleconfig:[{is_auto_attack:true,is_auto_return:{auto_return:false,airport_id:''},is_task_continue:true,is_hidden_maneuver:false,is_consider_environment:false,is_auto_deterrence:false,is_deterrence_auto_return:false,radar_detect_mode:{detect_mode:'scan',target_list:[...new Set(list.flatMap(a=>a.targets))].map(resolve)},intercept_strategy:1.0}]};
  })}]};
  commands.rules[0].ruledata=commands.rules[0].ruledata.filter(group=>group.action.length);
  const configuredGroups=new Map();
  for(const a of p.actions.filter(a=>a.definition)){
    const {action,config}=configuredOutput(a),key=JSON.stringify([a.executor,config]);
    if(!configuredGroups.has(key))configuredGroups.set(key,{action:[],ruleconfig:Object.keys(config).length?[config]:[]});
    configuredGroups.get(key).action.push(action);
  }
  commands.rules[0].ruledata.push(...configuredGroups.values());
  return {ybnm,scenario,commands,revision:p.revision,created:new Date().toISOString()};
}

// A small, dependency-free ZIP writer (STORE method) keeps the two identical names in separate folders.
export function makeZip(files) {
  const enc=new TextEncoder(), chunks=[], central=[];let offset=0;
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const header=(size)=>{const a=new Uint8Array(size);return[a,new DataView(a.buffer)];};
  for(const [path,content] of Object.entries(files)){
    const name=enc.encode(path),body=enc.encode(content),sum=crc(body);const[h,v]=header(30);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,body.length,true);v.setUint32(22,body.length,true);v.setUint16(26,name.length,true);
    chunks.push(h,name,body);const[c,d]=header(46);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,sum,true);d.setUint32(20,body.length,true);d.setUint32(24,body.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);central.push(c,name);offset+=h.length+name.length+body.length;
  }
  const size=central.reduce((s,b)=>s+b.length,0),[end,v]=header(22);v.setUint32(0,0x06054b50,true);v.setUint16(8,Object.keys(files).length,true);v.setUint16(10,Object.keys(files).length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  const out=new Uint8Array(offset+size+22);let at=0;for(const c of [...chunks,...central,end]){out.set(c,at);at+=c.length;}return out;
}
