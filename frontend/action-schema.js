// Shared action contracts: catalog flags select fields; instances hold actual values.
const string=(label,extra={})=>({type:'string',label,...extra});
const number=(label,extra={})=>({type:'number',label,...extra});
const bool=label=>({type:'boolean',label});
const object=(label,properties)=>({type:'object',label,properties});
const array=(label,item,min=1,extra={})=>({type:'array',label,item,min,...extra});
const point=object('坐标点',{longitude:number('经度',{min:-180,max:180}),latitude:number('纬度',{min:-90,max:90}),height:number('高度 / 米'),order:number('顺序',{integer:true,min:0})});
export const actionFields={
  action_id:string('行动编号',{generated:true}),
  related_force:array('关联力量分类',string('分类代码')),
  executor:array('执行者配置',object('执行者',{
    executor_id:string('执行实体',{ref:'executor'}),
    formation_struct:array('编队构成',object('编队成员',{formation_id:string('编成编号'),entity_count:number('实体数量',{integer:true,min:1}),entity_name:string('装备名称',{empty:true}),entity_type:string('装备类型')}),0,{optional:true}),
    mount:array('挂载清单',object('挂载',{mount_type:string('武器型号',{ref:'weapon'}),mount_type_name:string('武器名称'),num:number('挂载数量',{integer:true,min:1})}),0)
  }),1,{max:1}),
  target:array('行动目标',object('目标',{target_id:string('对方实体',{ref:'target'})})),
  launch:array('武器使用',object('使用记录',{target_id:string('打击目标',{ref:'target'}),target_child_id:string('目标子单元',{empty:true}),weapon_type:string('武器型号',{ref:'weapon'}),weapon_num:number('使用数量',{integer:true,min:1}),way_points:array('武器途经点',point,0)})),
  region:array('行动区域',object('区域',{points:array('边界点',point,3),region_type:string('区域类型')})),
  route:array('行动航路',object('航路',{points:array('航路点',point)})),
  radar_angle:object('雷达角度',{start_horizontal_angle:number('水平起始角'),end_horizontal_angle:number('水平结束角'),start_vertical_angle:number('垂直起始角'),end_vertical_angle:number('垂直结束角')}),
  upstream_entity:array('上游实体分类',string('分类代码')),
  downstream_entity:array('下游实体分类',string('分类代码')),
  supply:object('补给',{refuel:number('加油比例',{min:0,max:1}),weapon_type:array('补给武器型号',string('型号')),weapon_count:array('补给数量',number('数量',{integer:true,min:1}))}),
  start_time:number('开始时间 / 秒',{integer:true,min:0}),
  end_time:number('结束时间 / 秒',{integer:true,min:0}),
  jam:object('干扰参数',{jam_type:string('干扰类型'),jam_mode:string('干扰模式')})
};
export const configFields={
  is_auto_attack:bool('自动攻击'),
  is_auto_return:object('自动返航',{auto_return:bool('启用返航'),airport_id:string('返航机场',{ref:'airport',empty:true})}),
  is_task_continue:bool('继续任务'),is_hidden_maneuver:bool('隐蔽机动'),is_consider_environment:bool('考虑环境'),is_auto_deterrence:bool('自动威慑'),is_deterrence_auto_return:bool('威慑后返航'),
  radar_detect_mode:object('雷达探测模式',{detect_mode:string('探测模式'),target_list:array('探测目标',string('实体',{ref:'entity'}))}),
  intercept_strategy:number('拦截策略系数',{min:0})
};
export const requiredActionFields={start_time:actionFields.start_time,end_time:actionFields.end_time};
export const allFields={...actionFields,...configFields};
export const flagFields=Object.fromEntries(Object.entries(allFields).filter(([key])=>!(key in requiredActionFields)));
// Old saved instances can contain timing flags; timing is now mandatory for every type.
export function normalizeActionType(type){if(!type||typeof type!=='object'||Array.isArray(type))return type;const {start_time,end_time,...rest}=type;return rest;}
export const defaultActionType={rule_type_code:'000680',xdmc:'示例行动',...Object.fromEntries(Object.keys(flagFields).map(key=>[key,['action_id','related_force','executor','target',...Object.keys(configFields)].includes(key)]))};
export function validateActionType(type){
  const errors=[];
  if(!type||typeof type!=='object'||Array.isArray(type))return ['行动类型必须是对象。'];
  if(typeof type.rule_type_code!=='string'||!/^\d{6}$/.test(type.rule_type_code))errors.push('行动代码必须是六位数字字符串。');
  if(typeof type.xdmc!=='string'||!type.xdmc.trim())errors.push('行动名称必填。');
  for(const key of Object.keys(flagFields))if(typeof type[key]!=='boolean')errors.push(`${key} 必须为布尔值。`);
  for(const key of Object.keys(type))if(!['rule_type_code','xdmc',...Object.keys(flagFields)].includes(key))errors.push(`未知行动类型字段：${key}`);
  return errors;
}
export const referenceId=e=>e.bzlx?.trim()?e.llbznm:e.zyId;
export const isReturnLocation=(entity,side)=>!!entity&&!entity.parentId&&entity.side===side&&['机场','舰船'].includes(String(entity.model?.ThirdCfn||'').trim());
export const weaponItems=(plan,owner)=>plan.entities.filter(e=>e.parentId===owner&&['ammo','AmDp'].includes(e.mountKind));
export function weaponGroups(plan,owner){const groups=new Map();for(const e of weaponItems(plan,owner)){const type=e.model.mxlx;const group=groups.get(type)||{mount_type:type,mount_type_name:e.model.mxmc,num:0};group.num++;groups.set(type,group);}return [...groups.values()];}
export function schemaDefault(schema){
  if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).map(([key,child])=>[key,schemaDefault(child)]));
  if(schema.type==='array')return Array.from({length:schema.min},()=>schemaDefault(schema.item));
  if(schema.type==='number')return schema.min??0;
  if(schema.type==='boolean')return false;
  return '';
}
export function defaultActionValues(plan,owner){
  const e=plan.entities.find(e=>e.id===owner),target=plan.entities.find(t=>!t.parentId&&t.side!==e.side),targetId=target?referenceId(target):'',weapons=weaponGroups(plan,owner);
  const values=Object.fromEntries(Object.entries(allFields).map(([key,schema])=>[key,schemaDefault(schema)]));
  Object.assign(values,{
    related_force:['hs','kd'],executor:[{executor_id:referenceId(e),formation_struct:[{formation_id:e.formationId,entity_count:1,entity_name:e.model.mxmc,entity_type:e.model.commandType||e.model.mxlx}],mount:weapons}],
    target:[{target_id:targetId}],launch:[{target_id:targetId,target_child_id:'',weapon_type:weapons[0]?.mount_type||'',weapon_num:1,way_points:[]}],
    region:[{points:[{longitude:120.3,latitude:30.4,height:5000,order:0},{longitude:120.9,latitude:30.4,height:5000,order:1},{longitude:120.9,latitude:30,height:5000,order:2}],region_type:'01'}],
    route:[{points:[{longitude:e.lon,latitude:e.lat,height:e.height,order:0}]}],
    radar_angle:{start_horizontal_angle:0,end_horizontal_angle:10,start_vertical_angle:0,end_vertical_angle:60},upstream_entity:['as','ed'],downstream_entity:['as','ifs'],
    supply:{refuel:0.5,weapon_type:[weapons[0]?.mount_type||''],weapon_count:[1]},start_time:0,end_time:Math.min(600,(new Date(plan.end)-new Date(plan.start))/1000),jam:{jam_type:'radar',jam_mode:'block'},
    is_auto_attack:true,is_auto_return:{auto_return:false,airport_id:''},is_task_continue:true,radar_detect_mode:{detect_mode:'scan',target_list:target?[targetId]:[]},intercept_strategy:1
  });return values;
}
export function validateValue(schema,value,path=schema.label){
  if(schema.optional&&value===undefined)return [];
  const errors=[];
  if(schema.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))return [`${path} 必须为对象。`];
    for(const [key,child] of Object.entries(schema.properties))errors.push(...validateValue(child,value[key],`${path} / ${child.label}`));
  }else if(schema.type==='array'){
    if(!Array.isArray(value))return [`${path} 必须为列表。`];
    if(value.length<schema.min||value.length>(schema.max??500))errors.push(`${path} 条目数量须为 ${schema.min}–${schema.max??500}。`);
    value.forEach((item,i)=>errors.push(...validateValue(schema.item,item,`${path} ${i+1}`)));
  }else if(schema.type==='string'){
    if(typeof value!=='string'||(!schema.empty&&!value.trim()))errors.push(`${path} 必填。`);
  }else if(schema.type==='boolean'){
    if(typeof value!=='boolean')errors.push(`${path} 必须选择是或否。`);
  }else if(!Number.isFinite(value)||(schema.integer&&!Number.isSafeInteger(value))||value<(schema.min??-Infinity)||value>(schema.max??Infinity))errors.push(`${path} 数值或范围不正确。`);
  return errors;
}
export function projectValue(schema,value){
  if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).filter(([key,child])=>!child.optional||(value[key]!==undefined&&(!Array.isArray(value[key])||value[key].length>0))).map(([key,child])=>[key,projectValue(child,value[key])]));
  if(schema.type==='array')return value.map(item=>projectValue(schema.item,item));
  return value;
}
export function configuredOutput(a){
  const action={rule_type_code:a.code},config={};
  for(const [key,schema] of Object.entries(actionFields))if(key in requiredActionFields||a.definition[key])action[key]=key==='action_id'?a.id:projectValue(schema,a.values[key]);
  for(const [key,schema] of Object.entries(configFields))if(a.definition[key])config[key]=projectValue(schema,a.values[key]);
  return {action,config};
}
export function actionConsumption(a,plan){
  if(a.definition)return a.definition.launch&&Array.isArray(a.values?.launch)?a.values.launch.map(x=>({type:x.weapon_type,count:x.weapon_num})):[];
  const model=weaponItems(plan,a.executor).find(e=>e.model.id===a.weaponModelId)?.model;
  return a.weapon?[{type:model?.mxlx||a.weaponModelId,count:a.count}]:[];
}
export function validateConfiguredAction(a,plan){
  const type=normalizeActionType(a.definition),errors=validateActionType(type),values=a.values||{};
  if(a.code!==type.rule_type_code)errors.push('行动代码与类型快照不一致。');
  for(const [key,schema] of Object.entries(allFields))if((key in requiredActionFields||type[key])&&key!=='action_id')errors.push(...validateValue(schema,values[key]));
  if(errors.length)return errors;
  const root=plan.entities.find(e=>e.id===a.executor),roots=plan.entities.filter(e=>!e.parentId),find=id=>roots.find(e=>referenceId(e)===id),weapons=weaponGroups(plan,a.executor);
  if(!root||root.parentId)return ['执行实体不存在。'];
  const targetIds=type.target?values.target.map(t=>t.target_id):[];
  if(type.target)for(const id of targetIds)if(!find(id)||find(id).side===root.side)errors.push('行动目标必须是当前想定中的对方实体。');
  if(type.executor){
    if(values.executor[0].executor_id!==referenceId(root))errors.push('执行者编号必须匹配已选实体。');
    for(const item of values.executor[0].mount){const available=weapons.find(w=>w.mount_type===item.mount_type);if(!available||item.num>available.num)errors.push('执行者挂载数量超出实际库存。');}
    const types=values.executor[0].mount.map(w=>w.mount_type);if(new Set(types).size!==types.length)errors.push('执行者挂载清单不能重复填写同一武器型号。');
  }
  if(type.launch)for(const item of values.launch){
    if(!find(item.target_id)||find(item.target_id).side===root.side||(type.target&&!targetIds.includes(item.target_id)))errors.push('武器打击目标必须属于本行动的对方目标。');
    if(!weapons.some(w=>w.mount_type===item.weapon_type))errors.push('武器使用记录必须选择执行实体实际挂载的武器。');
    if(type.executor){const declared=values.executor[0].mount.find(w=>w.mount_type===item.weapon_type);const used=values.launch.filter(l=>l.weapon_type===item.weapon_type).reduce((n,l)=>n+l.weapon_num,0);if(!declared||used>declared.num)errors.push('武器使用量超过执行者挂载清单中声明的数量。');}
  }
  const seconds=(new Date(plan.end)-new Date(plan.start))/1000;
  if(values.start_time>seconds||values.end_time>seconds||values.start_time>values.end_time)errors.push('行动时间必须位于仿真时长内，结束不早于开始。');
  if(type.supply&&values.supply.weapon_type.length!==values.supply.weapon_count.length)errors.push('补给武器型号与数量必须一一对应。');
  if(type.radar_angle){const x=values.radar_angle;if(x.start_horizontal_angle>x.end_horizontal_angle||x.start_vertical_angle>x.end_vertical_angle)errors.push('雷达角度的结束值不能小于起始值。');}
  if(type.is_auto_return){const x=values.is_auto_return,airport=find(x.airport_id);if((x.auto_return||x.airport_id)&&!isReturnLocation(airport,root.side))errors.push('返航机场只可选择当前阵营中三级分类为机场或舰船的实体。');}
  if(type.radar_detect_mode&&values.radar_detect_mode.target_list.some(id=>!find(id)))errors.push('雷达探测目标必须引用当前想定实体。');
  const checkPoints=(points,label)=>{if(new Set(points.map(p=>p.order)).size!==points.length)errors.push(`${label}的点顺序不能重复。`);};
  if(type.region)for(const r of values.region){checkPoints(r.points,'区域');if(new Set(r.points.map(p=>`${p.longitude},${p.latitude}`)).size<3)errors.push('区域至少需要三个不同的边界点。');}
  if(type.route)values.route.forEach(r=>checkPoints(r.points,'航路'));
  if(type.launch)values.launch.forEach(r=>checkPoints(r.way_points,'武器途经点'));
  return errors;
}
export function makeConfiguredAction(definition,values,owner,id='ACT_'+crypto.randomUUID().replaceAll('-','')){
  const v=structuredClone(values);
  return {id,name:definition.xdmc,code:definition.rule_type_code,executor:owner,definition:structuredClone(normalizeActionType(definition)),values:v,targets:[],start:v.start_time,end:v.end_time,weapon:definition.launch,weaponModelId:null,count:definition.launch?v.launch.reduce((sum,x)=>sum+x.weapon_num,0):0,route:[]};
}
export function syncActionTargets(a,plan){if(a.definition)a.targets=a.definition.target?(a.values.target||[]).map(t=>plan.entities.find(e=>referenceId(e)===t.target_id)?.id).filter(Boolean):[];return a;}
