import { test, expect } from './fixtures.js';

test('chaos fixture restores after the test body', async ({ page, chaos }) => {
  await page.goto('/');
  await chaos.apply('ui.hide', { selector: '#refresh' });
  await expect(page.locator('#refresh')).toBeHidden();
});

test('chaos fixture leaves page healthy for the next test', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#refresh')).toBeVisible();
});