import { test, expect } from '@playwright/test';
import { chaos } from '../src/index.js';

test('dashboard loads service health', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Identity API')).toBeVisible();
  await expect(page.getByText('Operational').first()).toBeVisible();
});

test('dashboard shows recovery message when API returns 503', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.status', {
    url: '**/api/services',
    status: 503,
    body: { error: 'Service unavailable' }
  });

  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('dashboard handles delayed API responses', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.delay', {
    url: '**/api/services',
    ms: 100
  });

  await page.goto('/');
  await expect(page.getByText('Identity API')).toBeVisible();
  await experiment.restore();
});

test('UI recipe can hide a dashboard control', async ({ page }) => {
  const experiment = chaos(page);
  await page.goto('/');
  await experiment.apply('ui.hide', { selector: '#refresh' });
  await expect(page.locator('#refresh')).toBeHidden();
  await experiment.restore();
  await expect(page.locator('#refresh')).toBeVisible();
});
