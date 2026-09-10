async (page) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/#/plans');
  await page.evaluate(()=>localStorage.removeItem('simtest-demo-v1'));
  await page.reload();
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'编辑 基础行动验证',exact:true}).click();
  await page.locator('#scenario-map svg').waitFor();

  const selectRoot=async()=>{
    await page.locator('.entity-item:not(.mount-item)').first().click();
    await page.getByRole('button',{name:'添加挂载',exact:true}).click();
  };

  await selectRoot();
  const depotOption=page.locator('#create-mount-kind option[value="AmDp"]');
  if(!await depotOption.isDisabled())throw Error('Weapon library must be disabled before a hangar aircraft exists');
  await page.locator('#create-mount-kind').selectOption('Hang');
  const hangarModels=await page.locator('#create-model option').allTextContents();
  if(hangarModels.length!==1||hangarModels[0]!=='某型装备模型')throw Error('Hangar must list aircraft model names only');
  await page.locator('#create-count').fill('1');
  await page.getByRole('button',{name:'添加挂载实体',exact:true}).click();

  await selectRoot();
  if(await depotOption.isDisabled())throw Error('Weapon library must be enabled after a hangar aircraft is added');
  await page.locator('#create-mount-kind').selectOption('AmDp');
  const depotModels=await page.locator('#create-model option').allTextContents();
  if(depotModels.length!==1||depotModels[0]!=='某型弹药')throw Error('Weapon library must list weapon model names only');
  await page.locator('#create-count').fill('2');
  await page.getByRole('button',{name:'添加挂载实体',exact:true}).click();

  const listText=await page.locator('.entity-list').innerText();
  if(!listText.includes('机库 · 飞机实体')||!listText.includes('武器库 · 武器实体'))throw Error('Mounted entity labels do not express the relationship and actual entity type');
  if((await page.locator('body').innerText()).includes('mxlx')||(await page.locator('body').innerText()).includes('llbznm'))throw Error('Raw field names are visible in the editor');

  await page.locator('.mount-item').filter({hasText:'机库 · 飞机实体'}).click();
  await page.getByRole('button',{name:'删除当前实体',exact:true}).click();
  await page.getByRole('heading',{name:'暂不能删除机库飞机',exact:true}).waitFor();
  if(!(await page.getByRole('dialog').innerText()).includes('请先删除武器库中的 2 个武器实体'))throw Error('Deleting the final hangar aircraft was not blocked');
  await page.getByRole('button',{name:'知道了',exact:true}).click();

  await page.locator('.entity-item:not(.mount-item)').first().click();
  await page.screenshot({path:'output/playwright/mount-relations.png'});
  await page.getByRole('button',{name:'生成文件',exact:true}).click();
  await page.getByRole('button',{name:'导出配套 ZIP',exact:true}).waitFor();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('simtest-demo-v1')));
  const plan=state.plans.find(plan=>plan.name==='基础行动验证');
  const equip=plan.generated.scenario.yb[0].data.resource.trooplist[0].lstEquip[0];
  if(equip.Hang.length!==1||equip.Hang[0].ModelType!=='MX02'||equip.Hang[0].count!==1)throw Error('Hangar export does not contain the aircraft model');
  if(equip.AmDp.length!==1||equip.AmDp[0].ModelType!=='AMMO01'||equip.AmDp[0].count!==2)throw Error('Weapon library export does not contain the weapon model');
  if(state.models.some(model=>['HANG01','AMDP01'].includes(model.id)))throw Error('Legacy fake hangar or weapon-library models remain in the catalog');
  if(errors.length)throw Error('Browser errors: '+errors.join('; '));
  console.log('PASS: hangar/weapon-library dependency, classification filtering, deletion guard, UI labels and generated structures.');
}
