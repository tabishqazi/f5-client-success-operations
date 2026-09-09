import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('operational screens load records, fit the viewport, and keep planning language out',async({page},testInfo)=>{
 for(const path of ['/','/clients','/rules','/placements','/issues']){
  await page.goto(path);
  if(path!=='/rules')await expect(page.getByText('Loading workspace…')).toHaveCount(0);
  if(path==='/placements')await expect(page.getByText('30 placements',{exact:true})).toBeVisible();
  if(path==='/clients')await expect(page.getByText('12 clients',{exact:true})).toBeVisible();
  if(path==='/issues')await expect(page.getByText('Client requested replacement after repeated late submissions.',{exact:true})).toBeVisible();
  if(path==='/rules')await expect(page.getByRole('heading',{name:'Contact priority'})).toBeVisible();
  await expect(page.locator('nav a[aria-current="page"]')).toHaveCount(1);
  expect(await page.locator('main').innerText()).not.toMatch(/\bdemo\b|synthetic|implementation plan|technical assessment|\bA0[1-8]\b/i);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),path).toBe(false);
 }
 await page.goto('/placements');await expect(page.getByText('30 placements',{exact:true})).toBeVisible();
 if(testInfo.project.name==='phone-390')await page.screenshot({path:'work/phase6-phone.png',fullPage:false});
});
test('create, edit contacts and dates, reload, and isolate another browser session',async({page,browser,baseURL})=>{
 test.setTimeout(60000);
 await page.goto('/placements/new');
 await page.getByLabel('Company name',{exact:true}).fill('Orchard Operations');
 await page.getByLabel('Contact name',{exact:true}).fill('Robin Lane');
 await page.getByLabel('Contact email',{exact:true}).fill('robin@orchard.example');
 await page.getByLabel('Full name',{exact:true}).fill('Casey Morgan');
 await page.getByLabel('Role',{exact:true}).fill('Operations Specialist');
 await page.getByLabel('Location',{exact:true}).fill('Pune, India');
 await page.getByLabel('Email',{exact:true}).fill('casey@talent.example');
 await page.getByLabel('Start date',{exact:true}).fill('2026-08-15');
 await page.getByLabel('Trial end',{exact:true}).fill('2026-09-14');
 await page.getByRole('button',{name:'Create placement',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Casey Morgan',exact:true,level:1})).toBeVisible();
 await expect(page.locator('nav a[aria-current="page"]')).toHaveText('Placements');
 const detailURL=page.url();
 await page.getByRole('button',{name:'Edit placement',exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('Casey Morgan Updated');
 await page.getByLabel('Contact email',{exact:true}).fill('robin.updated@orchard.example');
 await page.getByLabel('Trial end',{exact:true}).fill('2026-09-20');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Casey Morgan Updated',exact:true,level:1})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'Casey Morgan Updated',exact:true,level:1})).toBeVisible();
 await expect(page.getByText('Sep 20, 2026',{exact:true})).toBeVisible();
 await expect(page.getByText('robin.updated@orchard.example',{exact:true})).toBeVisible();
 const second=await browser.newContext({baseURL});
 try{
  const other=await second.newPage();await other.goto('/placements');
  await expect(other.getByText('30 placements',{exact:true})).toBeVisible();
  await other.getByLabel('Find a placement').fill('Casey Morgan Updated');
  await expect(other.getByText('No placements match your search.')).toBeVisible();
  const response=await second.request.get(detailURL.replace('/placements/','/api/placements/'));
  expect(response.status()).toBe(404);
 }finally{await second.close();}
});

test('failed save retains entries and a retry commits once',async({page})=>{
 await page.goto('/placements');
 await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Daniel Reyes',exact:true})}).click();
 await page.getByRole('button',{name:'Edit placement',exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('Daniel Retry');
 let failed=false;
 await page.route('**/api/placements/*',async route=>{
  if(route.request().method()==='PATCH'&&!failed){failed=true;await route.fulfill({status:503,json:{error:{message:'Unable to save right now.'}}});}
  else await route.continue();
 });
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.locator('main').getByRole('alert')).toContainText('Your entries have been kept.');
 await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('Daniel Retry');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Daniel Retry',exact:true,level:1})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Daniel Retry',exact:true,level:1})).toBeVisible();
 await expect(page.getByText('Placement details and contact records updated.',{exact:true})).toHaveCount(1);
});

test('loading and retryable read errors are distinct from an empty result',async({page})=>{
 let release:()=>void=()=>{};
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/placements**',async route=>{await pending;await route.fulfill({status:503,json:{error:{message:'Connection unavailable. Please retry.'}}});});
 await page.goto('/placements');await expect(page.getByRole('status')).toContainText('Loading workspace');
 release();await expect(page.locator('main').getByRole('alert')).toContainText('Connection unavailable');
 await expect(page.getByText('No placements yet.',{exact:true})).toHaveCount(0);
 await page.unroute('**/api/placements**');await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByText('30 placements',{exact:true})).toBeVisible();
});

test('API rejects missing sessions, foreign origins and forged scope',async({page,browser,baseURL})=>{
 const empty=await browser.newContext({baseURL});
 try{expect((await empty.request.get('/api/placements')).status()).toBe(403);}finally{await empty.close();}
 await page.goto('/placements');await expect(page.getByText('30 placements',{exact:true})).toBeVisible();
 const response=await page.request.post('/api/placements',{headers:{Origin:'https://untrusted.example'},data:{workspace_id:randomUUID(),key:randomUUID()}});
 expect(response.status()).toBe(403);
 const malformed=await page.request.post('/api/placements',{headers:{Origin:baseURL!},data:{workspace_id:randomUUID(),key:randomUUID(),placement:{}}});
 expect(malformed.status()).toBe(400);
 expect(JSON.stringify(await malformed.json())).not.toMatch(/postgres|password|DATABASE_URL|select .*from/i);
});
