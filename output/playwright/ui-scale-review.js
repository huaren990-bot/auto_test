async page=>{
  // Synthetic data is kept in this isolated browser. All API requests are mocked.
  const fixture=await page.evaluate(async()=>{
    const c=await import('/core.js'),s=await import('/action-schema.js');
    const catalog=[...c.models,...Array.from({length:497},(_,i)=>({...c.models[0],id:'REVIEW_'+i,mxlx:'REVIEW_'+i,mxnm:'REVIEW_MODEL_'+i,mxmc:`评估装备 ${String(i+1).padStart(3,'0')}`,FirstCfn:i%2?'设施':'物资',SecondCfn:i%3?'海上':'陆上',ThirdCfn:'评估分类 '+i%8,ForthCfn:'子分类 '+i%4}))];
    const types=[s.defaultActionType,...Array.from({length:199},(_,i)=>({...s.defaultActionType,rule_type_code:String(100000+i),xdmc:'评估行动 '+(i+1)}))];
    const p=c.createPlan('大规模界面评估');
    const roots=Array.from({length:200},(_,i)=>{const e=c.createEntity(c.models[0],i<100?'Blue':'Red',i+1,120+(i%20)*.08,29+Math.floor(i/20)*.08);e.name='评估实体 '+String(i+1).padStart(3,'0');return e;});
    p.entities=[...roots,...roots.flatMap(e=>c.createMountedEntityBatch(c.models[2],e,1,2,'ammo'))];
    p.actions=roots.flatMap(e=>Array.from({length:5},(_,i)=>c.createAction(e.id,roots[e.side==='Blue'?100:0].id,i*600)));
    const db=JSON.parse(localStorage.getItem('simtest-demo-v1'));db.models=catalog;db.actionTypes=types;db.plans=[p];db.runs=[];
    localStorage.setItem('simtest-demo-v1',JSON.stringify(db));return {catalog,types,id:p.id};
  });
  await page.route('**/api/**',route=>{const path='/api/'+route.request().url().split('/api/')[1].split('?')[0];return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:path==='/api/models'?fixture.catalog:path==='/api/action-types'?fixture.types:[]})});});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:4173/#/library');await page.reload();await page.locator('tbody tr').first().waitFor();
  const report={viewport:{width:1440,height:1000},models:500,actionTypes:200,rootEntities:200,mountedEntities:400,actionCount:1000};
  report.catalog=await page.evaluate(()=>({rows:document.querySelectorAll('tbody tr').length,pageHeight:document.documentElement.scrollHeight,searchInputs:document.querySelectorAll('input[type=search]').length,pager:document.querySelector('.catalog-pager')?.textContent.trim()}));
  await page.locator('#model-search').fill('评估装备 497');
  report.catalogSearch=await page.evaluate(()=>({rows:document.querySelectorAll('tbody tr').length,result:document.querySelector('tbody tr')?.textContent.trim()}));
  await page.locator('#model-search').fill('');
  await page.getByRole('button',{name:'行动目录',exact:true}).click();
  report.types=await page.evaluate(()=>({rows:document.querySelectorAll('tbody tr').length,pageHeight:document.documentElement.scrollHeight,tableWidth:document.querySelector('table').scrollWidth,containerWidth:document.querySelector('.table-scroll').clientWidth,pager:document.querySelector('.catalog-pager')?.textContent.trim()}));
  await page.goto('http://127.0.0.1:4173/#/plan/'+fixture.id+'/map');await page.locator('.map-cluster,.entity-marker').first().waitFor();
  report.map=await page.evaluate(()=>({entityRows:document.querySelectorAll('.entity-item').length,listHeight:document.querySelector('.entity-list').scrollHeight,visibleListHeight:document.querySelector('.entity-list').clientHeight,markers:document.querySelectorAll('.entity-marker').length,clusters:document.querySelectorAll('.map-cluster').length,visibleNameLabels:document.querySelectorAll('.entity-label.visible').length,pager:document.querySelector('.entity-list .catalog-pager')?.textContent.trim()}));
  await page.screenshot({path:'output/playwright/ui-scale-map.png',animations:'disabled'});
  await page.getByRole('button',{name:'行动指令 1000',exact:true}).click();await page.getByRole('button',{name:'添加行动',exact:true}).waitFor();
  report.actions=await page.evaluate(()=>({rows:document.querySelectorAll('tbody tr').length,pageHeight:document.documentElement.scrollHeight,pager:document.querySelector('.catalog-pager')?.textContent.trim()}));
  await page.getByRole('button',{name:'添加行动',exact:true}).click();
  report.addAction=await page.evaluate(()=>({ownersOnPage:document.querySelectorAll('[name=command-owner]').length,ownerListHeight:document.querySelector('#command-owners').scrollHeight,ownerVisibleHeight:document.querySelector('#command-owners').clientHeight,formHeight:document.querySelector('.modal-body').scrollHeight,visibleFormHeight:document.querySelector('.modal-body').clientHeight,typeOptions:document.querySelector('#command-type').options.length,sections:document.querySelectorAll('.command-form-group').length}));
  await page.screenshot({path:'output/playwright/ui-scale-action.png',animations:'disabled'});
  await page.getByRole('button',{name:'取消',exact:true}).click();
  return report;
}
