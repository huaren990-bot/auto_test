async (page) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  const assertClean=async label=>{
    const text=(await page.locator('body').innerText()).toLowerCase();
    for(const forbidden of ['mxlx','llbznm'])if(text.includes(forbidden))throw new Error(`${label} displays forbidden field name: ${forbidden}`);
  };

  await page.goto('http://127.0.0.1:4173/#/plans');
  await page.evaluate(()=>localStorage.removeItem('simtest-demo-v1'));
  await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  await assertClean('方案列表');
  await page.getByRole('button',{name:'编辑 基础行动验证',exact:true}).click();
  await page.locator('#scenario-map svg').waitFor();
  await assertClean('想定编辑');

  await page.getByRole('button',{name:'添加实体',exact:true}).click();
  await page.locator('#create-count').fill('3');
  if(await page.locator('#create-formation').isChecked())throw new Error('Formation must be unchecked by default');
  await assertClean('添加普通实体弹窗');
  await page.getByRole('button',{name:'开始批量布置',exact:true}).click();
  let mapBox=await page.locator('#scenario-map .map-svg-wrap').boundingBox();
  await page.locator('#scenario-map .map-svg-wrap').click({position:{x:mapBox.width*.14,y:mapBox.height*.17}});
  if(await page.locator('.entity-item').count()!==5)throw new Error('Ordinary batch did not add three entities');
  if(await page.locator('.entity-item small').filter({hasText:'普通实体'}).count()!==3)throw new Error('Ordinary entities are not labelled correctly');
  if((await page.locator('.entity-props input:disabled').first().inputValue())!=='普通实体')throw new Error('Ordinary entity type is incorrect');
  await page.getByText('实例信息',{exact:true}).click();
  if(!(await page.locator('.entity-props').innerText()).includes('资源编号'))throw new Error('Ordinary entity reference label is incorrect');

  await page.getByRole('button',{name:'添加实体',exact:true}).click();
  await page.locator('#create-side').selectOption('Red');
  await page.locator('#create-category-0').selectOption('物资');
  await page.locator('#create-category-2').selectOption('飞机');
  if(await page.locator('#create-model').inputValue()!=='MX02')throw new Error('Air model did not follow the selected classification');
  await page.locator('#create-count').fill('2');
  await page.locator('#create-formation').check();
  await assertClean('添加编队弹窗');
  await page.getByRole('button',{name:'开始批量布置',exact:true}).click();
  mapBox=await page.locator('#scenario-map .map-svg-wrap').boundingBox();
  await page.locator('#scenario-map .map-svg-wrap').click({position:{x:mapBox.width*.84,y:mapBox.height*.82}});
  if(await page.locator('.entity-item').count()!==7)throw new Error('Formation batch did not add two entities');
  if(await page.locator('.entity-item small').filter({hasText:'编队'}).count()!==4)throw new Error('Formation entities are not labelled correctly');
  if((await page.locator('.entity-props input:disabled').first().inputValue())!=='编队')throw new Error('Formation entity type is incorrect');
  await page.getByText('实例信息',{exact:true}).click();
  if(!(await page.locator('.entity-props').innerText()).includes('编队编号'))throw new Error('Formation reference label is incorrect');
  await assertClean('批量添加完成后的想定编辑');
  await page.screenshot({path:'/Users/hjt/Projects/自动化测试/output/playwright/batch-entities.png',fullPage:true});

  await page.getByRole('button',{name:'保存',exact:true}).click();
  await page.getByRole('button',{name:'生成文件',exact:true}).click();
  await page.getByRole('button',{name:'想定文件摘要',exact:true}).waitFor();
  const scenarioSummary=await page.locator('.code-panel').innerText();
  if(!scenarioSummary.includes('地图实体\n7')||!scenarioSummary.includes('挂载实体\n0')||!scenarioSummary.includes('编队 / 普通实体\n4 / 3'))throw new Error('Generated scenario summary has incorrect counts');
  await assertClean('想定文件摘要');
  await page.getByRole('button',{name:'指令文件摘要',exact:true}).click();
  await assertClean('指令文件摘要');

  await page.getByRole('link',{name:'模型与行动',exact:true}).click();
  await assertClean('模型目录');
  await page.getByRole('button',{name:'配置'}).first().click();
  await page.getByRole('dialog').waitFor();
  await assertClean('模型配置弹窗');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'添加模型',exact:true}).click();
  await assertClean('添加模型弹窗');
  await page.getByRole('button',{name:'取消',exact:true}).click();

  if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
  console.log('PASS: ordinary and formation batches, automatic layout, summary counts, and forbidden UI-field scan.');
}
