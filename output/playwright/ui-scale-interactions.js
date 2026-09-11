async page=>{
  const result={};
  await page.goto(page.url().replace(/\/actions$/,'/map'));
  await page.locator('.map-stage').waitFor();
  await page.selectOption('[data-ui-filter="entity-group"]','model');
  result.entityGrouping=await page.locator('.side-title').first().textContent();
  await page.getByRole('button',{name:'添加实体',exact:true}).click();
  result.entityDialog={allCategoryOptions:await page.locator('#create-category-0 option').filter({hasText:'全部'}).count()};
  await page.locator('#create-model-search').fill('评估装备 497');
  result.entityDialog.modelOptions=await page.locator('#create-model option').count();
  result.entityDialog.modelName=await page.locator('#create-model option').first().textContent();
  await page.selectOption('#create-mode','mount');
  await page.selectOption('#create-side','Red');
  await page.locator('#create-parent-search').fill('评估实体 200');
  result.entityDialog.parentOptions=await page.locator('#create-parent option').count();
  await page.getByRole('button',{name:'取消',exact:true}).click();

  await page.getByRole('button',{name:/行动指令/}).click();
  await page.locator('#action-start-filter').fill('1800');
  result.timeFilter=await page.locator('.catalog-pager').textContent();
  await page.selectOption('[data-ui-filter="action-group"]','executor');
  const before=await page.locator('tbody tr:not(.group-row)').count();
  await page.locator('.group-row button').first().click();
  const after=await page.locator('tbody tr:not(.group-row)').count();
  result.groupCollapse={before,after};
  await page.selectOption('[data-ui-filter="action-group"]','none');
  await page.locator('[data-action-select]').nth(0).check();
  await page.locator('[data-action-select]').nth(1).check();
  await page.getByRole('button',{name:'复制已选',exact:true}).click();
  result.afterCopy=await page.locator('.action-summary .panel-title-count').textContent();
  await page.getByRole('button',{name:'时间平移',exact:true}).click();
  await page.locator('#shift-actions-seconds').fill('1');
  await page.getByRole('button',{name:'应用平移',exact:true}).click();
  result.shiftToast=await page.locator('#toasts .toast').last().textContent();
  return result;
}
