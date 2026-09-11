async page=>{
  const result={};
  await page.goto(page.url().replace(/\/actions$/,'/map'));
  await page.locator('.map-stage').waitFor();
  await page.locator('[data-entity-select]').nth(0).check();
  await page.locator('[data-entity-select]').nth(1).check();
  result.selected=await page.locator('.entity-selection-toolbar').textContent();

  await page.getByRole('button',{name:'属性',exact:true}).click();
  await page.locator('#batch-apply-height').check();
  await page.locator('#batch-height').fill('125');
  await page.getByRole('button',{name:'应用到所选实体',exact:true}).click();
  result.batchHeight=await page.locator('[data-entity-field="height"]').inputValue();

  await page.getByRole('button',{name:'挂载',exact:true}).click();
  await page.locator('#batch-mount-search').fill('某型弹药');
  await page.getByRole('button',{name:'批量添加',exact:true}).click();
  result.mountSummary=await page.locator('.editor-foot span').last().textContent();

  await page.getByRole('button',{name:'行动',exact:true}).click();
  result.batchActionOwners=await page.locator('#owner-count').textContent();
  result.referenceSearches=await page.locator('.reference-picker input[type="search"]').count();
  await page.locator('.reference-picker input[type="search"]').first().fill('评估实体 101');
  result.referenceOptions=await page.locator('.reference-picker select').first().locator('option').count();
  await page.getByRole('button',{name:'取消',exact:true}).click();

  await page.getByRole('button',{name:'地图全屏',exact:true}).click();
  result.fullscreen=await page.locator('.map-editor').evaluate(node=>node.classList.contains('fullscreen'));
  await page.locator('.fullscreen-exit').click();
  await page.locator('.column-settings > summary').click();
  await page.locator('#entity-list-width').fill('340');
  result.listWidth=await page.locator('.map-editor').evaluate(node=>getComputedStyle(node).getPropertyValue('--entity-list-width').trim());

  await page.getByRole('button',{name:'框选实体',exact:true}).click();
  const box=await page.locator('#scenario-map').boundingBox();
  await page.mouse.move(box.x+box.width*.35,box.y+box.height*.35);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.75,{steps:8});
  await page.mouse.up();
  result.boxSelection=await page.locator('.entity-selection-toolbar').textContent();
  return result;
}
