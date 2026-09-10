async (page) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  const assertClean=async label=>{
    const text=(await page.locator('body').innerText()).toLowerCase();
    for(const forbidden of ['mxlx','llbznm'])if(text.includes(forbidden))throw new Error(`${label} displays forbidden field name: ${forbidden}`);
  };

  await page.goto('http://127.0.0.1:4173/#/library');
  await page.evaluate(()=>localStorage.removeItem('simtest-demo-v1'));
  await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  const catalogText=await page.locator('#content').innerText();
  if(!catalogText.includes('设施 / 陆上 / 机场 / 无')||!catalogText.includes('物资 / 空中 / 飞机 / 无'))throw new Error('Built-in classification groups are missing');
  await assertClean('模型目录');

  await page.getByRole('button',{name:'添加模型',exact:true}).click();
  await page.locator('#model-name').fill('测试舰船');
  await page.locator('#model-type').fill('SHIP01');
  await page.locator('#model-code').fill('CMRM0300000000099');
  await page.locator('#model-category-0').fill('物资');
  await page.locator('#model-category-1').fill('海上');
  await page.locator('#model-category-2').fill('舰船');
  await page.locator('#model-category-3').fill('无');
  await assertClean('添加模型弹窗');
  await page.getByRole('button',{name:'添加模型',exact:true}).last().click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const updatedCatalog=await page.locator('#content').innerText();
  if(!updatedCatalog.includes('物资 / 海上 / 舰船 / 无')||!updatedCatalog.includes('测试舰船'))throw new Error('New model was not grouped by classification');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('simtest-demo-v1')).models.find(model=>model.id==='SHIP01'));
  if(!stored||stored.mxmc!=='测试舰船'||stored.mxlx!=='SHIP01'||stored.FirstCfn!=='物资'||stored.SecondCfn!=='海上'||stored.ThirdCfn!=='舰船'||stored.ForthCfn!=='无')throw new Error('Model classification was not persisted');
  await page.locator('[data-act="model-detail"][data-id="SHIP01"]').click();
  const detail=await page.getByRole('dialog').innerText();
  for(const value of ['一级分类\n物资','二级分类\n海上','三级分类\n舰船','四级分类\n无'])if(!detail.includes(value))throw new Error(`Model detail is missing ${value}`);
  await assertClean('模型详情');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.screenshot({path:'/Users/hjt/Projects/自动化测试/output/playwright/classification-catalog.png',fullPage:true});

  await page.getByRole('link',{name:'方案管理',exact:true}).click();
  await page.getByRole('button',{name:'编辑 基础行动验证',exact:true}).click();
  await page.locator('#scenario-map svg').waitFor();
  await page.getByRole('button',{name:'添加实体',exact:true}).click();
  await page.locator('#create-category-0').selectOption('物资');
  await page.locator('#create-category-1').selectOption('海上');
  if(await page.locator('#create-category-2').inputValue()!=='舰船')throw new Error('Third-level category did not cascade');
  if(await page.locator('#create-category-3').inputValue()!=='无')throw new Error('Fourth-level category did not cascade');
  if(await page.locator('#create-model').inputValue()!=='SHIP01')throw new Error('Filtered model does not match the selected classification');
  await assertClean('分类选择实体弹窗');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.overlay')).opacity==='1');
  await page.screenshot({path:'/Users/hjt/Projects/自动化测试/output/playwright/classification-picker.png',fullPage:true});
  await page.getByRole('button',{name:'开始批量布置',exact:true}).click();
  const mapBox=await page.locator('#scenario-map .map-svg-wrap').boundingBox();
  await page.locator('#scenario-map .map-svg-wrap').click({position:{x:mapBox.width*.14,y:mapBox.height*.17}});
  const values=await page.locator('.entity-props input:disabled').evaluateAll(inputs=>inputs.map(input=>input.value));
  if(!values.includes('普通实体')||!values.includes('测试舰船'))throw new Error('Created entity does not use the filtered model');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('已保存至本地'));
  await page.reload();
  if(!(await page.locator('.entity-list').innerText()).includes('蓝方平台 02'))throw new Error('Categorized entity did not persist after reload');
  if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
  return {groups:3,selectedModel:'SHIP01',persisted:true};
}
