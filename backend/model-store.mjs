import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { models as builtInModels } from '../frontend/core.js';

const requiredFields=['FirstCfn','SecondCfn','ThirdCfn','ForthCfn','mxmc','mxlx'];
const storedFields=[...requiredFields,'mxnm','lxzymc','lxzynm','bzlx','commandType','description'];

export class ModelValidationError extends Error {
  constructor(message){super(message);this.name='ModelValidationError';}
}

export function normalizeEquipmentModel(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new ModelValidationError('装备型号必须是 JSON 对象。');
  const model={};
  for(const field of requiredFields){
    if(typeof input[field]!=='string'||!input[field].trim())throw new ModelValidationError(`${field} 不能为空。`);
    model[field]=input[field].trim();
  }
  if(input.id!=null&&String(input.id).trim()!==model.mxlx)throw new ModelValidationError('型号内部标识必须与型号编号一致。');
  model.mxnm=typeof input.mxnm==='string'&&input.mxnm.trim()?input.mxnm.trim():model.mxlx;
  model.lxzymc=typeof input.lxzymc==='string'&&input.lxzymc.trim()?input.lxzymc.trim():model.mxmc;
  model.lxzynm=typeof input.lxzynm==='string'&&input.lxzynm.trim()?input.lxzynm.trim():randomUUID();
  model.bzlx=typeof input.bzlx==='string'&&input.bzlx.trim()?input.bzlx.trim():null;
  model.commandType=typeof input.commandType==='string'&&input.commandType.trim()?input.commandType.trim():model.mxlx;
  model.description=typeof input.description==='string'?input.description.trim():'';
  return model;
}

const rowToModel=row=>({id:row.mxlx,...Object.fromEntries(storedFields.map(field=>[field,row[field]]))});

export class ModelStore {
  constructor(filename=resolve('data/simtest.sqlite')){
    this.filename=resolve(filename);
    mkdirSync(dirname(this.filename),{recursive:true});
    this.database=new DatabaseSync(this.filename);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS equipment_models (
        mxlx TEXT PRIMARY KEY,
        FirstCfn TEXT NOT NULL,
        SecondCfn TEXT NOT NULL,
        ThirdCfn TEXT NOT NULL,
        ForthCfn TEXT NOT NULL,
        mxmc TEXT NOT NULL,
        mxnm TEXT NOT NULL UNIQUE,
        lxzymc TEXT NOT NULL,
        lxzynm TEXT NOT NULL UNIQUE,
        bzlx TEXT,
        commandType TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_equipment_models_classification
        ON equipment_models (FirstCfn, SecondCfn, ThirdCfn, ForthCfn);
      PRAGMA user_version = 1;
    `);
    this.insertStatement=this.database.prepare(`
      INSERT INTO equipment_models (
        mxlx, FirstCfn, SecondCfn, ThirdCfn, ForthCfn,
        mxmc, mxnm, lxzymc, lxzynm, bzlx, commandType, description
      ) VALUES (
        $mxlx, $FirstCfn, $SecondCfn, $ThirdCfn, $ForthCfn,
        $mxmc, $mxnm, $lxzymc, $lxzynm, $bzlx, $commandType, $description
      )
    `);
    this.seed();
  }

  seed(){
    const insert=this.database.prepare(`
      INSERT OR IGNORE INTO equipment_models (
        mxlx, FirstCfn, SecondCfn, ThirdCfn, ForthCfn,
        mxmc, mxnm, lxzymc, lxzynm, bzlx, commandType, description
      ) VALUES (
        $mxlx, $FirstCfn, $SecondCfn, $ThirdCfn, $ForthCfn,
        $mxmc, $mxnm, $lxzymc, $lxzynm, $bzlx, $commandType, $description
      )
    `);
    this.database.exec('BEGIN IMMEDIATE');
    try{
      for(const model of builtInModels)insert.run(normalizeEquipmentModel(model));
      this.database.exec('COMMIT');
    }catch(error){this.database.exec('ROLLBACK');throw error;}
  }

  list(filters={}){
    const allowed=['FirstCfn','SecondCfn','ThirdCfn','ForthCfn'];
    const active=allowed.filter(field=>typeof filters[field]==='string'&&filters[field].trim());
    const where=active.length?' WHERE '+active.map(field=>`${field} = $${field}`).join(' AND '):'';
    const params=Object.fromEntries(active.map(field=>[field,filters[field].trim()]));
    return this.database.prepare(`SELECT ${storedFields.join(', ')} FROM equipment_models${where} ORDER BY FirstCfn, SecondCfn, ThirdCfn, ForthCfn, mxmc, mxlx`).all(params).map(rowToModel);
  }

  get(mxlx){
    const row=this.database.prepare(`SELECT ${storedFields.join(', ')} FROM equipment_models WHERE mxlx = ?`).get(mxlx);
    return row?rowToModel(row):null;
  }

  create(input){
    const model=normalizeEquipmentModel(input);
    this.insertStatement.run(model);
    return this.get(model.mxlx);
  }

  createMany(input){
    if(!Array.isArray(input)||!input.length)throw new ModelValidationError('配置必须是非空型号数组。');
    const normalized=input.map(normalizeEquipmentModel),types=new Set(),codes=new Set(),resourceIds=new Set();
    for(const model of normalized){
      if(types.has(model.mxlx)||codes.has(model.mxnm)||resourceIds.has(model.lxzynm))throw new ModelValidationError('批量配置中存在重复的型号编号或模型编码。');
      types.add(model.mxlx);codes.add(model.mxnm);resourceIds.add(model.lxzynm);
    }
    this.database.exec('BEGIN IMMEDIATE');
    try{
      for(const model of normalized)this.insertStatement.run(model);
      this.database.exec('COMMIT');
    }catch(error){this.database.exec('ROLLBACK');throw error;}
    return normalized.map(model=>this.get(model.mxlx));
  }

  count(){return Number(this.database.prepare('SELECT COUNT(*) AS count FROM equipment_models').get().count);}
  close(){this.database.close();}
}
