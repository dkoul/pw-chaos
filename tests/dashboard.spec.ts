import { test, expect } from '@playwright/test';
import { chaos } from '../dist/index.js';

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

test('dashboard handles aborted API requests', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.abort', { url: '**/api/services' });
  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('dashboard handles API timeouts', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.timeout', { url: '**/api/services', ms: 50 });
  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('dashboard handles empty JSON payloads', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.empty', { url: '**/api/services' });
  await page.goto('/');
  await expect(page.getByText('Service data is temporarily unavailable.')).toBeVisible();
  await experiment.restore();
});

test('dashboard handles corrupt JSON payloads', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.corrupt-json', { url: '**/api/services' });
  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('dashboard handles rate limiting', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.rate-limit', { url: '**/api/services', retryAfterMs: 1000 });
  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('dashboard fails when intermittent recipe always aborts', async ({ page }) => {
  const experiment = chaos(page);
  await experiment.apply('api.intermittent', {
    url: '**/api/services',
    probability: 1
  });
  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('browser offline blocks refresh', async ({ page }) => {
  const experiment = chaos(page);
  await page.goto('/');
  await experiment.apply('browser.offline');
  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
  await experiment.restore();
});

test('storage.clear removes keys and restore brings them back', async ({ page }) => {
  const experiment = chaos(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('session', 'demo-token'));
  await experiment.apply('storage.clear', { keys: ['session'] });
  const cleared = await page.evaluate(() => localStorage.getItem('session'));
  expect(cleared).toBeNull();
  await experiment.restore();
  const restored = await page.evaluate(() => localStorage.getItem('session'));
  expect(restored).toBe('demo-token');
});

test('sessionStorage.clear removes keys and restore brings them back', async ({ page }) => {
  const experiment = chaos(page);
  await page.goto('/');
  await page.evaluate(() => sessionStorage.setItem('tab', 'ops'));
  await experiment.apply('sessionStorage.clear', { keys: ['tab'] });
  const cleared = await page.evaluate(() => sessionStorage.getItem('tab'));
  expect(cleared).toBeNull();
  await experiment.restore();
  const restored = await page.evaluate(() => sessionStorage.getItem('tab'));
  expect(restored).toBe('ops');
});