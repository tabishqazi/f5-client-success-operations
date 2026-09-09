import { expect, test } from '@playwright/test';

const emptyQueue = (hasPlacements: boolean) => ({
  asOf: '2026-09-09',
  scope: 'today',
  hasPlacements,
  counts: { immediate: 0, urgent: 0, overdue: 0, dueToday: 0 },
  cards: [],
});

test('placements paginate and search across the complete workspace', async ({ page }) => {
  await page.goto('/placements');
  await expect(page.getByText('30 placements', { exact: true })).toBeVisible();
  await expect(page.locator('.placement-card')).toHaveCount(9);
  await expect(page.getByText('Page 1 of 4', { exact: true })).toBeVisible();
  const firstPageNames = await page.locator('.placement-card h2').allTextContents();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible();
  const secondPageNames = await page.locator('.placement-card h2').allTextContents();
  expect(secondPageNames.every(name => !firstPageNames.includes(name))).toBe(true);
  await page.getByLabel('Find a placement').fill('Daniel Reyes');
  await expect(page.getByText('1 placement', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daniel Reyes', exact: true })).toBeVisible();
  await expect(page.getByLabel('Placement pages')).toHaveCount(0);
});

test('no placements and an all-clear day have distinct actions', async ({ page }) => {
  let hasPlacements = false;
  await page.route('**/api/queue?scope=today', route => route.fulfill({ status: 200, json: emptyQueue(hasPlacements) }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No placements yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add placement' })).toBeVisible();
  hasPlacements = true;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You’re all clear today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review placements' })).toBeVisible();
});

test('queue loading, session expiry and refresh failure remain truthful', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/queue?scope=today', async route => { await pending; await route.continue(); });
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Loading workspace' })).toBeVisible();
  await expect(page.locator('.skeleton-card')).toHaveCount(2);
  release();
  await expect(page.locator('.queue-card').first()).toBeVisible();
  await page.unroute('**/api/queue?scope=today');

  await page.route('**/api/queue?scope=today', route => route.fulfill({ status: 503, json: { error: { message: 'Connection unavailable. Please retry.' } } }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('main').getByRole('alert')).toContainText('Connection unavailable');
  await expect(page.locator('.queue-card').first()).toBeVisible();
  await expect(page.locator('main').getByRole('alert')).toContainText('last successful load');
  await page.unroute('**/api/queue?scope=today');

  await page.route('**/api/queue?scope=today', route => route.fulfill({ status: 403, json: { error: { message: 'Unavailable' } } }));
  await page.reload();
  await expect(page.locator('main').getByRole('alert')).toContainText('session has expired or is unavailable');
  await expect(page.locator('main').getByRole('alert')).toContainText('Reload this page');
});

test('a stale placement save keeps every entered value for review and retry', async ({ page }, testInfo) => {
  await page.goto('/placements');
  await page.getByLabel('Find a placement').fill('Daniel Reyes');
  await page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Daniel Reyes', exact: true }) }).click();
  await page.getByRole('button', { name: 'Edit placement', exact: true }).click();
  const revisedName = `Daniel Conflict ${testInfo.project.name}`;
  await page.getByLabel('Full name', { exact: true }).fill(revisedName);
  let conflicted = false;
  await page.route('**/api/placements/*', async route => {
    if (route.request().method() === 'PATCH' && !conflicted) {
      conflicted = true;
      await route.fulfill({ status: 409, json: { error: { message: 'This record changed. Refresh it and review your update before saving again.' } } });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('This record changed');
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(revisedName);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: revisedName, exact: true })).toBeVisible();
});

test('keyboard focus and primary touch targets remain visible and usable', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
  for (const control of await page.locator('.nav-item, .button').all()) {
    if (await control.isVisible()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
