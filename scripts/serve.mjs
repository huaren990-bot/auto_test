import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionStore, ActionTypeError } from '../backend/action-store.mjs';
import { generate } from '../frontend/core.js';
import { ModelStore, ModelValidationError } from '../backend/model-store.mjs';

const frontendRoot=resolve(import.meta.dirname,'../frontend');
const defaultDatabasePath=resolve(import.meta.dirname,'../data/simtest.sqlite');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.svg':'image/svg+xml'};
const sendJson=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};

async function readJson(req){
  const chunks=[];let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>1024*1024)throw Object.assign(new Error('请求内容不能超过 1 MB。'),{statusCode:413});
    chunks.push(chunk);
  }
  if(!chunks.length)throw Object.assign(new Error('请求体不能为空。'),{statusCode:400});
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Object.assign(new Error('请求体不是有效的 JSON。'),{statusCode:400});}
}

function mapError(error){
  if(error instanceof ModelValidationError)return {status:400,message:error.message};
  if((Number(error?.errcode)&0xff)===19)return {status:409,message:'型号编号、模型编码或资源类型编号已存在。'};
  return {status:error.statusCode||500,message:error.statusCode?error.message:'服务器处理失败。'};
}

export function createSimTestServer({root=frontendRoot,databasePath=defaultDatabasePath}={}){
  const store=new ModelStore(databasePath);
  const actions=new ActionStore(store.database);
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost'),path=decodeURIComponent(url.pathname);
      if(path==='/api/health'&&req.method==='GET')return sendJson(res,200,{status:'ok',database:'sqlite',modelCount:store.count()});
      if(path==='/api/models'&&req.method==='GET'){
        const filters=Object.fromEntries(['FirstCfn','SecondCfn','ThirdCfn','ForthCfn'].map(field=>[field,url.searchParams.get(field)]));
        return sendJson(res,200,{items:store.list(filters)});
      }
      if(path==='/api/models'&&req.method==='POST')return sendJson(res,201,{item:store.create(await readJson(req))});
      if(path==='/api/models/import'&&req.method==='POST')return sendJson(res,201,{items:store.createMany(await readJson(req))});
      if(path==='/api/action-types'&&req.method==='GET')return sendJson(res,200,{items:actions.list()});
      if(path==='/api/action-types'&&req.method==='POST')return sendJson(res,201,{item:actions.create(await readJson(req))});
      if(path.startsWith('/api/action-types/')&&req.method==='PUT')return sendJson(res,200,{item:actions.update(path.slice('/api/action-types/'.length),await readJson(req))});
      if(path==='/api/generate'&&req.method==='POST'){
        const plan=await readJson(req);
        if(!Array.isArray(plan?.entities)||!Array.isArray(plan?.actions))throw new ActionTypeError('想定实体和行动必须为列表。');
        for(const action of plan.actions)if(!actions.get(action.code))throw new ActionTypeError('行动代码未在数据库中登记。');
        try{return sendJson(res,200,{files:generate(plan)});}catch(error){throw new ActionTypeError(error.message);}
      }
      if(path.startsWith('/api/'))return sendJson(res,404,{error:'接口不存在。'});
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
      const file=resolve(root,'.'+(path==='/'?'/index.html':path));
      if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
      const body=await readFile(file);
      res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch(error){
      const result=mapError(error);
      if(req.url?.startsWith('/api/'))sendJson(res,result.status,{error:result.message});
      else{res.writeHead(error?.code==='ENOENT'?404:500);res.end(error?.code==='ENOENT'?'Not found':'Server error');}
    }
  });
  server.modelStore=store;
  server.on('close',()=>store.close());
  return server;
}

const launchedDirectly=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(launchedDirectly){
  const port=Number(process.env.PORT||4173),databasePath=process.env.SIMTEST_DB_PATH||defaultDatabasePath;
  const server=createSimTestServer({databasePath});
  server.listen(port,'127.0.0.1',()=>console.log(`SimTest: http://127.0.0.1:${port} · SQLite: ${databasePath}`));
}
