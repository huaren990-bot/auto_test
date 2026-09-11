export class PlanValidationError extends Error {
  constructor(message,statusCode=400){super(message);this.name='PlanValidationError';this.statusCode=statusCode;}
}

function normalizePlan(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new PlanValidationError('方案必须是 JSON 对象。');
  if(typeof input.id!=='string'||!input.id.trim())throw new PlanValidationError('方案编号不能为空。');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>60)throw new PlanValidationError('方案名称必填，且不能超过 60 个字符。');
  if(!Array.isArray(input.entities)||!Array.isArray(input.actions))throw new PlanValidationError('方案实体和行动必须为列表。');
  const plan=structuredClone(input);plan.id=plan.id.trim();plan.name=plan.name.trim();plan.archived=Boolean(plan.archived);plan.revision=Number.isSafeInteger(plan.revision)?plan.revision:0;plan.updated=typeof plan.updated==='string'&&plan.updated?plan.updated:new Date().toISOString();
  try{JSON.stringify(plan);}catch{throw new PlanValidationError('方案包含无法保存的数据。');}
  return plan;
}

const decode=row=>row?JSON.parse(row.payload):null;

export class PlanStore {
  constructor(database){
    this.db=database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plans_archived_updated ON plans (archived, updated_at DESC);
    `);
    this.upsert=this.db.prepare(`INSERT INTO plans (id,name,archived,revision,updated_at,payload)
      VALUES ($id,$name,$archived,$revision,$updated_at,$payload)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,archived=excluded.archived,revision=excluded.revision,updated_at=excluded.updated_at,payload=excluded.payload`);
  }
  row(plan){return {id:plan.id,name:plan.name,archived:plan.archived?1:0,revision:plan.revision,updated_at:plan.updated,payload:JSON.stringify(plan)};}
  list(){return this.db.prepare('SELECT payload FROM plans ORDER BY archived, updated_at DESC').all().map(decode);}
  get(id){return decode(this.db.prepare('SELECT payload FROM plans WHERE id = ?').get(id));}
  save(input){const plan=normalizePlan(input);this.upsert.run(this.row(plan));return this.get(plan.id);}
  importMissing(input){
    if(!Array.isArray(input))throw new PlanValidationError('方案导入内容必须是数组。');
    const plans=input.map(normalizePlan),seen=new Set();for(const plan of plans){if(seen.has(plan.id))throw new PlanValidationError('导入内容包含重复方案编号。');seen.add(plan.id);}
    this.db.exec('BEGIN IMMEDIATE');try{const inserted=[];for(const plan of plans){if(this.get(plan.id))continue;this.upsert.run(this.row(plan));inserted.push(this.get(plan.id));}this.db.exec('COMMIT');return inserted;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  count(){return Number(this.db.prepare('SELECT COUNT(*) AS count FROM plans').get().count);}
}
