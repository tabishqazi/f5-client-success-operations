import { expect, test } from '@playwright/test';

test('client directory is searchable, paginated, and opens the complete relationship view', async ({ page }) => {
  await page.goto('/clients');
  await expect(page.getByText('12 clients', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await page.getByLabel('Find a client').fill('Daniel Reyes');
  await expect(page.locator('.client-card')).toHaveCount(1);
  await page.locator('.client-card').click();
  const placements = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Placements', exact: true }) });
  await expect(placements.getByRole('heading', { name: 'Placements', exact: true })).toBeVisible();
  await expect(placements.getByText('Daniel Reyes', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contact history', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Placement feedback', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('a client-only monthly outcome remains available in client history', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.queue-card').filter({ hasText: 'Client relationship check-in' }).first();
  await expect(card).toBeVisible();
  const clientHref = await card.getByRole('link', { name: 'View client' }).getAttribute('href');
  if (!clientHref) throw new Error('Expected a client detail link');
  await card.getByRole('button', { name: 'Record outcome' }).click();
  const form = card.locator('form');
  await form.getByRole('checkbox', { name: /Client relationship check-in/i }).check();
  const note = 'Completed the client relationship review and confirmed the monthly cadence.';
  await form.getByLabel('Conversation notes').fill(note);
  await form.getByRole('button', { name: 'Save outcome' }).click();
  await expect(page.getByText(/Outcome saved for/)).toBeVisible();
  await page.goto(clientHref);
  await expect(page.getByRole('heading', { name: 'Contact history', exact: true })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('date language becomes a confirmed structured follow-up', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.queue-card').filter({ hasText: /client feedback|relationship check-in|Professional check-in/i }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Record outcome' }).click();
  const form = card.locator('form');
  await form.getByLabel('Conversation notes').fill('The client will connect with us on Monday.');
  const suggestion = form.locator('.date-suggestion');
  await expect(suggestion).toContainText('Possible follow-up date');
  await suggestion.getByRole('button', { name: /^Use / }).click();
  await expect(form.getByLabel('Outcome')).toHaveValue('rescheduled');
  await expect(form.getByLabel('New contact date')).not.toHaveValue('');
  await expect(suggestion).toContainText('Confirmed');
  await form.locator('input[type="checkbox"]').first().check();
  const selectedDate = await form.getByLabel('New contact date').inputValue();
  await form.getByRole('button', { name: 'Save outcome' }).click();
  await expect(page.getByText(/Outcome saved for/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Next contact is scheduled for ${selectedDate}.`, { exact: false })).toBeVisible();
});
