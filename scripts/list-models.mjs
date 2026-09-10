import { resolve } from 'node:path';
import { ModelStore } from '../backend/model-store.mjs';

const filename=process.env.SIMTEST_DB_PATH||resolve(import.meta.dirname,'../data/simtest.sqlite');
const store=new ModelStore(filename);
try{
  console.table(store.list().map(model=>({
    一级分类:model.FirstCfn,二级分类:model.SecondCfn,三级分类:model.ThirdCfn,四级分类:model.ForthCfn,
    装备名称:model.mxmc,型号:model.mxlx,模型编码:model.mxnm
  })));
  console.log(`SQLite: ${filename}`);
}finally{store.close();}
