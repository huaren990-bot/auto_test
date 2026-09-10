async (page) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4174/#/plans');
  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByText('装备数据库已连接',{exact:true}).waitFor();
  await page.getByRole('link',{name:'模型与行动',exact:true}).click();
  await page.getByRole('button',{name:'添加型号',exact:true}).click();
  await page.locator('#model-name').fill('后端测试飞机');
  await page.locator('#model-type').fill('AIR-BE-001');
  await page.locator('#model-category-0').fill('物资');
  await page.locator('#model-category-1').fill('空中');
  await page.locator('#model-category-2').fill('飞机');
  await page.locator('#model-category-3').fill('固定翼');
  await page.getByRole('button',{name:'添加型号',exact:true}).last().click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  let response=await page.evaluate(()=>fetch('/api/models').then(result=>result.json()));
  const created=response.items.find(item=>item.mxlx==='AIR-BE-001');
  if(!created||created.mxmc!=='后端测试飞机'||created.ForthCfn!=='固定翼'||created.mxnm!=='AIR-BE-001')throw Error('New model was not persisted by the model API');

  await page.evaluate(()=>localStorage.clear());await page.reload();
  await page.getByText('装备数据库已连接',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'后端测试飞机',exact:true}).waitFor();
  await page.getByRole('link',{name:'方案管理',exact:true}).click();
  await page.getByRole('button',{name:'编辑 基础行动验证',exact:true}).click();
  await page.getByRole('button',{name:'添加实体',exact:true}).click();
  await page.locator('#create-category-0').selectOption('物资');
  await page.locator('#create-category-1').selectOption('空中');
  await page.locator('#create-category-2').selectOption('飞机');
  await page.locator('#create-category-3').selectOption('固定翼');
  if(await page.locator('#create-model option:checked').innerText()!=='后端测试飞机')throw Error('Scenario editor did not select the model loaded from SQLite');
  if((await page.getByRole('dialog').innerText()).includes('AIR-BE-001'))throw Error('Scenario model selector exposed the raw type code');
  await page.screenshot({path:'output/playwright/model-backend-picker.png'});
  if(errors.length)throw Error('Browser errors: '+errors.join('; '));
  console.log('PASS: frontend creates a concrete model in SQLite, reloads it, and selects it by classification in scenario editing.');
}
