import { expect,test } from '@playwright/test';

test('a failed no-answer save retains the form and retry keeps the feedback item open',async({page})=>{
 await page.goto('/');const card=page.locator('.queue-card').filter({has:page.getByRole('heading',{name:'Maya Chen',exact:true})});await expect(card).toBeVisible();
 await card.getByRole('button',{name:'Record outcome'}).click();const form=card.locator('form');
 await form.getByLabel('Outcome').selectOption('no_answer');await form.locator('input[type="checkbox"]').first().check();await form.getByLabel('Conversation notes').fill('Called for the scheduled feedback and could not reach the client.');
 let failed=false;await page.route('**/api/interactions',async route=>{if(!failed){failed=true;await route.fulfill({status:503,json:{error:{message:'Unable to save right now.'}}});}else await route.continue();});
 await form.getByRole('button',{name:'Save outcome'}).click();await expect(form.getByRole('alert')).toContainText('Your entries have been kept.');await expect(form.getByLabel('Conversation notes')).toHaveValue('Called for the scheduled feedback and could not reach the client.');
 await form.getByRole('button',{name:'Save outcome'}).click();await expect(page.getByText('Outcome saved for Maya Chen.',{exact:true})).toBeVisible();await expect(card).toBeVisible();await expect(card).toContainText(/response is due|feedback is still missing/i);
});

test('incoming client feedback completes selected work and creates a visible concern',async({page},testInfo)=>{
 await page.goto('/');const card=page.locator('.queue-card').filter({has:page.getByRole('heading',{name:'Olivia Brooks',exact:true})});await expect(card).toBeVisible();
 await card.getByRole('button',{name:'Record outcome'}).click();const form=card.locator('form');await form.getByLabel('Direction').selectOption('inbound');
 const monthly=form.getByRole('checkbox',{name:/Client relationship check-in/i});if(await monthly.count())await monthly.check();
 const placementFeedback=form.getByRole('checkbox',{name:/Client feedback.*Priya Shah/i});await placementFeedback.check();
 await form.getByLabel('Conversation notes').fill('The client called for the monthly review and raised a deliverable concern.');
 await form.getByLabel('Assessment').selectOption('concerned');await form.getByLabel('Rating').selectOption('3');await form.getByLabel('Feedback evidence').fill('The latest deliverable needed an additional quality review before approval.');
 if(testInfo.project.name==='phone-390')await page.screenshot({path:'work/phase6-outcome-phone.png',fullPage:false});
 await form.getByRole('button',{name:'Save outcome'}).click();await expect(page.getByText('Outcome saved for Olivia Brooks.',{exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Placements'}).click();await page.getByLabel('Find a placement').fill('Priya Shah');await page.getByRole('link').filter({has:page.getByRole('heading',{name:'Priya Shah',exact:true})}).click();
 const evidence='The latest deliverable needed an additional quality review before approval.';const feedbackSection=page.locator('section').filter({has:page.getByRole('heading',{name:'Client feedback'})});const issueSection=page.locator('section').filter({has:page.getByRole('heading',{name:'Issues'})});
 await expect(feedbackSection.getByText(evidence,{exact:true})).toBeVisible();await expect(issueSection.getByText(evidence,{exact:true})).toBeVisible();await expect(page.getByText('Needs attention',{exact:true})).toBeVisible();await expect(page.getByText('Conversation with Olivia Brooks recorded.',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
});
