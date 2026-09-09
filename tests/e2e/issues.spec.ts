import { expect,test } from '@playwright/test';
import postgres from 'postgres';

test('issue moves from report through two recovery checks to verified closure',async({page},testInfo)=>{
 test.setTimeout(90000);
 const description='Two client deliverables missed their agreed review dates.';
 await page.goto('/issues');await expect(page.getByRole('button',{name:'Report issue'})).toBeVisible();
 await page.getByRole('button',{name:'Report issue'}).click();const create=page.locator('form.issue-form');
 await create.locator('select[required]').selectOption({index:7});await create.getByLabel('Reported by').selectOption('client');await create.getByLabel('Category').selectOption('performance');await create.getByLabel('Impact').selectOption('high');await create.getByLabel('What happened').fill(description);await create.getByRole('button',{name:'Create issue'}).click();
 let card=page.locator('article.issue-card').filter({hasText:description});await expect(card).toBeVisible();
 await card.getByRole('button',{name:'Agree recovery plan'}).click();let command=card.locator('form.issue-command-form');const target=await command.getByLabel('Target date').getAttribute('min');if(!target)throw new Error('Expected server operating date');
 await command.getByLabel('Responsible person').fill('Aarav Joshi');await command.getByLabel('Target date').fill(target);await command.getByLabel('Expected change').fill('Submit work one business day before each client deadline.');await command.getByLabel('How improvement will be verified').fill('The next two deliverables enter client review on time.');await command.getByRole('button',{name:'Save update'}).click();
 card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByRole('button',{name:'Report fix'})).toBeVisible();await card.getByRole('button',{name:'Report fix'}).click();command=card.locator('form.issue-command-form');await command.getByLabel('Evidence').fill('The shared deadline tracker and earlier internal review are active.');await command.getByRole('button',{name:'Save update'}).click();
 card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByText('monitoring',{exact:true})).toBeVisible();await expect(card.getByRole('heading',{name:'Recovery checks'})).toBeVisible();
 if(testInfo.project.name==='phone-390')await page.screenshot({path:'work/phase6-issue-phone.png',fullPage:false});
 const rawId=await card.getAttribute('id');if(!rawId?.startsWith('issue-'))throw new Error('Expected issue identifier');const issueId=rawId.slice(6);
 const admin=postgres(process.env.TEST_DATABASE_URL!,{max:1,onnotice:()=>{}});
 try{
  await admin`update f5.verifications set due_at=now()-interval '1 minute' where issue_id=${issueId} and window_name='initial'`;
  await page.reload();card=page.locator('article.issue-card').filter({hasText:description});let initial=card.locator('.verification-row').filter({hasText:'Initial check'});await initial.getByRole('button',{name:'Record verification'}).click();command=card.locator('form.issue-command-form');await command.getByLabel('Result').selectOption('pass');await command.getByLabel('Confirmed by').selectOption('client');await command.getByLabel('Verification evidence').fill('The client confirmed the first observed deadline was met.');await command.getByRole('button',{name:'Save update'}).click();await expect(command).toHaveCount(0);
  card=page.locator('article.issue-card').filter({hasText:description});initial=card.locator('.verification-row').filter({hasText:'Initial check'});await expect(initial.getByText('pass',{exact:true})).toBeVisible();await expect(card.getByText('monitoring',{exact:true})).toBeVisible();
  await admin`update f5.verifications set due_at=now()-interval '1 minute' where issue_id=${issueId} and window_name='sustained'`;
  await page.reload();card=page.locator('article.issue-card').filter({hasText:description});const sustained=card.locator('.verification-row').filter({hasText:'Sustained check'});await sustained.getByRole('button',{name:'Record verification'}).click();command=card.locator('form.issue-command-form');await command.getByLabel('Result').selectOption('pass');await command.getByLabel('Confirmed by').selectOption('client');await command.getByLabel('Verification evidence').fill('The client confirmed both observation periods passed without another missed deadline.');await command.getByRole('button',{name:'Save update'}).click();await expect(command).toHaveCount(0);
  await page.reload();await page.getByRole('button',{name:'Verified closed'}).click();card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByText('verified closed',{exact:true})).toBeVisible();await expect(card.getByRole('heading',{name:'Verified closure'})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Verified closed'}).click();card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByText('The client confirmed both observation periods passed without another missed deadline.',{exact:true})).toBeVisible();
 }finally{await admin.end();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
});

test('senior acknowledgment and decision preserve the underlying issue',async({page})=>{
 await page.goto('/issues');const description='Client requested replacement after repeated late submissions.';let card=page.locator('article.issue-card').filter({hasText:description});await expect(card).toBeVisible();
 await expect(card.getByText('Retention or replacement risk',{exact:true})).toBeVisible();await card.getByRole('button',{name:'Acknowledge review'}).click();
 card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByText('acknowledged',{exact:true})).toBeVisible();await expect(card.locator('.card-top .status-pill').first()).toHaveText('open');
 await card.getByRole('button',{name:'Record decision'}).click();const form=card.locator('form.issue-command-form');await form.getByLabel('Decision').fill('Proceed with a managed replacement while stabilizing current delivery.');await form.getByLabel('Follow-up owner').fill('Alex Morgan');await form.getByLabel('Responsible follow-up').fill('Share the transition plan with the client by end of day.');await form.getByRole('button',{name:'Save update'}).click();
 card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByText('decision recorded',{exact:true})).toBeVisible();await expect(card.locator('.card-top .status-pill').first()).toHaveText('open');await expect(card.getByText('Decision: Proceed with a managed replacement while stabilizing current delivery.',{exact:true})).toBeVisible();
 await page.reload();card=page.locator('article.issue-card').filter({hasText:description});await expect(card.getByText(/Follow-up:.*Alex Morgan/)).toBeVisible();await expect(card.getByText('Share the transition plan with the client by end of day.',{exact:false})).toBeVisible();
});
