import { expect, test } from '@playwright/test';

type QueuePayload={cards:{reasons:{obligationId:string}[]}[]};

async function obligationIds(page:import('@playwright/test').Page,scope:'today'|'upcoming'='today'){
 return page.evaluate(async selected=>{
  const response=await fetch(`/api/queue?scope=${selected}`,{method:'POST'});
  if(!response.ok)throw new Error(`Queue returned ${response.status}`);
  const queue=await response.json() as QueuePayload;
  return queue.cards.flatMap(card=>card.reasons.map(reason=>reason.obligationId)).sort();
 },scope);
}

test('Today answers who to contact and why with stable grouped obligations',async({page},testInfo)=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1,name:'Who needs a call today?'})).toBeVisible();
 await expect(page.getByLabel('Daily work summary')).toBeVisible();
 const cards=page.locator('.queue-card');
 await expect(cards.first()).toBeVisible();
 await expect(cards.first().locator('.priority-label')).toHaveText('Immediate');
 await expect(cards.first()).toContainText(/client relationship|cancellation or replacement/i);

 const northstar=cards.filter({has:page.getByRole('heading',{name:'Maya Chen',exact:true})});
 await expect(northstar).toBeVisible();
 await expect(northstar).toContainText('trial decision is due');
 await expect(northstar).toContainText(/feedback is still missing|Outreach is .* overdue/i);

 const first=await obligationIds(page);
 const second=await obligationIds(page);
 expect(first.length).toBeGreaterThan(0);
 expect(second).toEqual(first);
 expect(new Set(first).size).toBe(first.length);

 await page.getByRole('button',{name:'Upcoming',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Next 45 days'})).toBeVisible();
 await expect(page.locator('.queue-card').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
 if(testInfo.project.name==='phone-390')await page.screenshot({path:'work/phase6-queue-phone.png',fullPage:false});
});

test('Today metrics filter the visible queue and past trials use historical wording',async({page})=>{
 await page.goto('/');
 const cards=page.locator('.queue-card');
 const immediate=page.getByRole('button',{name:/^Immediate: \d+ contacts?$/});
 const urgent=page.getByRole('button',{name:/^Urgent: \d+ contacts?$/});
 const overdue=page.getByRole('button',{name:/^Overdue: \d+ contacts?$/});
 const dueToday=page.getByRole('button',{name:/^Due today: \d+ contacts?$/});

 for(const metric of [immediate,urgent,overdue,dueToday]){
  const count=Number((await metric.getAttribute('aria-label'))?.match(/\d+/)?.[0]);
  await metric.click();
  await expect(metric).toHaveAttribute('aria-pressed','true');
  await expect(cards).toHaveCount(count);
  await page.getByRole('button',{name:'Clear filter'}).click();
 }

 const immediateCount=Number((await immediate.getAttribute('aria-label'))?.match(/\d+/)?.[0]);
 await immediate.click();
 await expect(cards.locator('.priority-label')).toHaveText(Array.from({length:immediateCount},()=>"Immediate"));
 await expect(cards.filter({hasText:'Jordan Lee'})).toContainText(/Trial ended on [A-Z][a-z]{2} \d{1,2}, 2026/);
 const urgentCount=Number((await urgent.getAttribute('aria-label'))?.match(/\d+/)?.[0]);
 await urgent.click();
 await expect(cards.locator('.priority-label')).toHaveText(Array.from({length:urgentCount},()=>"Urgent"));
});

test('placement detail exposes its generated due and upcoming work',async({page})=>{
 await page.goto('/placements');
 await expect(page.getByText('30 placements',{exact:true})).toBeVisible();
 await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Daniel Reyes',exact:true})}).click();
 await expect(page.getByRole('heading',{name:'Due and upcoming'})).toBeVisible();
 await expect(page.getByText('client feedback',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('trial review',{exact:true})).toBeVisible();
});
