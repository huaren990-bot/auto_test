import { flagFields, defaultActionType, validateActionType } from '../frontend/action-schema.js';
export class ActionTypeError extends Error {constructor(message,statusCode=400){super(message);this.statusCode=statusCode;}}
const keys=Object.keys(flagFields);
export class ActionStore {
  constructor(database){
    this.db=database;
    this.db.exec(`CREATE TABLE IF NOT EXISTS action_types (rule_type_code TEXT PRIMARY KEY NOT NULL, xdmc TEXT NOT NULL, ${keys.map(key=>`${key} INTEGER NOT NULL CHECK (${key} IN (0,1))`).join(', ')});`);
    const columns=new Set(this.db.prepare('PRAGMA table_info(action_types)').all().map(column=>column.name));
    const obsolete=['start_time','end_time'].filter(key=>columns.has(key));
    if(obsolete.length){
      this.db.exec('BEGIN');
      try{for(const key of obsolete)this.db.exec(`ALTER TABLE action_types DROP COLUMN ${key}`);this.db.exec('COMMIT');}
      catch(error){this.db.exec('ROLLBACK');throw error;}
    }
    if(!this.get(defaultActionType.rule_type_code))this.create(defaultActionType);
  }
  decode(row){return row?{rule_type_code:row.rule_type_code,xdmc:row.xdmc,...Object.fromEntries(keys.map(key=>[key,Boolean(row[key])]))}:null;}
  get(code){return this.decode(this.db.prepare('SELECT * FROM action_types WHERE rule_type_code = ?').get(code));}
  list(){return this.db.prepare('SELECT * FROM action_types ORDER BY rule_type_code').all().map(row=>this.decode(row));}
  check(value){const errors=validateActionType(value);if(errors.length)throw new ActionTypeError(errors.join(' '));return {rule_type_code:value.rule_type_code,xdmc:value.xdmc.trim(),...Object.fromEntries(keys.map(key=>[key,value[key]?1:0]))};}
  create(value){const row=this.check(value);if(this.get(row.rule_type_code))throw new ActionTypeError('行动代码已存在。',409);const fields=['rule_type_code','xdmc',...keys];this.db.prepare(`INSERT INTO action_types (${fields.join(',')}) VALUES (${fields.map(k=>'$'+k).join(',')})`).run(row);return this.get(row.rule_type_code);}
  update(code,value){if(code!==value?.rule_type_code)throw new ActionTypeError('编辑时不能更改行动代码。');const row=this.check(value);if(!this.get(code))throw new ActionTypeError('行动类型不存在。',404);this.db.prepare(`UPDATE action_types SET ${['xdmc',...keys].map(k=>`${k}=$${k}`).join(',')} WHERE rule_type_code=$rule_type_code`).run(row);return this.get(code);}
}
