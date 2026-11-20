# PW Chaos

Deterministic failure injection for Playwright tests you already have. Point a recipe at one request, the network, a control, or `localStorage`, assert the degraded UI, then restore the page.

No Playwright config changes. The library uses the `page` fixture you already receive.

Requires Node 20+ and `@playwright/test` in the project under test.

## Add it to a test project

From the Playwright project (the one that contains `playwright.config`):

```bash
npm install playwright-chaos-recipes
```

To try this checkout before it is published:

```bash
npm install /absolute/path/to/pw-chaos
```

Leave `playwright.config.ts` as it is. Import the helper in a spec or in your existing fixture file.

## Change one test

Apply a network recipe **before** the action that sends the request. Keep the rest of the test the same, and assert the UI your app shows for that failure.

```ts
import { test, expect } from '@playwright/test';
import { chaos } from 'playwright-chaos-recipes';

test('checkout explains a failed order', async ({ page }) => {
  const experiment = chaos(page);

  await page.goto('/checkout');
  await experiment.apply('api.status', {
    url: '**/api/orders',
    status: 503,
    body: { error: 'maintenance' }
  });

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Unable to place your order')).toBeVisible();

  await experiment.restore();
});
```

`url` is a Playwright route pattern, the same glob you would pass to `page.route()`.

Call `restore()` before a later step in the **same** test needs the healthy app again (a retry, a second assertion, a cleared storage key). Playwright already gives each test a new page, so a route from one test does not carry into the next. `browser.offline`, `storage.clear`, and `ui.hide` still change the current page until `restore()` runs.

## Restore from a fixture

If you add chaos to more than a couple of tests, extend your fixture once. Teardown runs even when the assertion fails.

New fixture file, for a suite that imports `test` from `@playwright/test` today:

```ts
// fixtures.ts
import { test as base, expect } from '@playwright/test';
import { chaos, type ChaosController } from 'playwright-chaos-recipes';

export const test = base.extend<{ chaos: ChaosController }>({
  chaos: async ({ page }, use) => {
    const experiment = chaos(page);
    await use(experiment);
    await experiment.restore();
  }
});

export { expect };
```

Already have `export const test = base.extend(...)`? Add the `chaos` fixture to that same `extend` call, and keep importing `{ test, expect }` from your fixture module.

```ts
import { test, expect } from './fixtures';

test('checkout explains a failed order', async ({ page, chaos }) => {
  await page.goto('/checkout');
  await chaos.apply('api.status', {
    url: '**/api/orders',
    status: 503,
    body: { error: 'maintenance' }
  });

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Unable to place your order')).toBeVisible();
});
```

Happy-path tests stay untouched. Pass `chaos` only in the tests that inject a failure.

## When to call `apply`

| What you are breaking | Call `apply` |
| --- | --- |
| A request fired by a click, submit, or refresh | After `page.goto()`, before that action |
| The request the page makes while it loads | Before `page.goto()` |
| A control on screen (`ui.hide`) | After the page that contains it has loaded |
| `localStorage` (`storage.clear`) | After navigation to that origin |
| The whole browser context (`browser.offline`) | Before the requests that should fail |

Network recipes use `page.route()`, so they stay in effect across navigations on that page. `ui.hide` injects a style tag into the current document; a full navigation drops it, and you apply it again on the new page.

`api.delay` defaults to 2 seconds and `api.timeout` defaults to 5 seconds. Pass a short `ms` so the suite stays fast:

```ts
await chaos.apply('api.delay', { url: '**/api/orders', ms: 300 });
```

## Recipes

| Recipe | What the app sees | Options |
| --- | --- | --- |
| `api.status` | An HTTP status and a JSON or raw body | `url`, `status` (default `500`), `body`, `rawBody`, `contentType`, `times` |
| `api.delay` | The real request, after a pause | `url`, `ms` (default `2000`), `times` |
| `api.abort` | A failed network request | `url`, `times` |
| `api.timeout` | A pause, then a timed-out request | `url`, `ms` (default `5000`), `times` |
| `api.empty` | `200` and `{}` | `url`, `times` |
| `api.corrupt-json` | `200` and truncated JSON | `url`, `times` |
| `api.rate-limit` | HTTP `429` with optional `Retry-After` | `url`, `retryAfterMs`, `times` |
| `api.intermittent` | Randomly abort or pass through (see `probability`) | `url`, `probability` (default `0.5`, range `0`–`1`), `times` |
| `browser.offline` | Every request in the browser context fails | none |
| `ui.hide` | The selector stays in the DOM with `visibility: hidden` | `selector` |
| `storage.clear` | `localStorage` keys removed on the current origin | `keys` (omit to clear all) |
| `sessionStorage.clear` | `sessionStorage` keys removed on the current origin | `keys` (omit to clear all) |

`times` limits how many matching requests the recipe handles. Omit it to keep the recipe active until `restore()`.

Several recipes can be active together when they own different resources. Two route recipes can use different `url` patterns. The same `url` pattern, a second `browser.offline`, a second `storage.clear` / `sessionStorage.clear` on the same storage bucket, or the same `ui.hide` selector throws `ChaosConflictError`. Missing `url` or `selector` throws `ChaosValidationError`.

```ts
await chaos.apply('api.delay', { url: '**/api/orders', ms: 300 });
await chaos.apply('api.status', { url: '**/api/inventory', status: 500 });
```

`applyMany(['browser.offline'])` applies recipes that take no options. Recipes that need a `url` or `selector` go through `apply(name, options)`.

## Patterns you can paste

Initial load returns 503:

```ts
test('dashboard shows a recovery message', async ({ page, chaos }) => {
  await chaos.apply('api.status', {
    url: '**/api/services',
    status: 503,
    body: { error: 'Service unavailable' }
  });

  await page.goto('/');
  await expect(page.getByText('Unable to refresh service health. Please try again.')).toBeVisible();
});
```

First attempt fails, then the test checks the healthy retry. `times: 1` stops the recipe after one match; `restore()` also removes it if you want the route gone immediately.

```ts
test('retry succeeds after a single failure', async ({ page, chaos }) => {
  await page.goto('/checkout');
  await chaos.apply('api.abort', { url: '**/api/orders', times: 1 });

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Unable to place your order')).toBeVisible();

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Order confirmed')).toBeVisible();
});
```

The browser is offline:

```ts
await chaos.apply('browser.offline');
await page.getByRole('button', { name: 'Refresh status' }).click();
```

`browser.offline` covers the whole browser context, including any other pages that test opens.

A control is hidden. Assert with `toBeHidden()`; the node is still in the DOM.

```ts
await page.goto('/');
await chaos.apply('ui.hide', { selector: '#refresh' });
await expect(page.locator('#refresh')).toBeHidden();
```

Saved client state is missing. Call this after `goto` so the evaluation runs on the app origin. `restore()` writes the captured `localStorage` snapshot back.

```ts
await page.goto('/');
await chaos.apply('storage.clear', { keys: ['session'] });
```

## Custom recipes

Register extra recipes once, in the fixture module or a setup file that loads before tests call `chaos(page)`. Each name must be unique. `resources` is how the engine detects collisions. Route recipes should use `route:${url}` so they collide with a built-in recipe on the same pattern. Optional `validate(options)` runs before `apply` — use it the same way as built-in recipes. For `ui.hide`-style recipes, only pass trusted selectors; unsanitized values can inject CSS.

```ts
import type { Route } from '@playwright/test';
import { registerRecipe } from 'playwright-chaos-recipes';

registerRecipe({
  name: 'billing.gateway-maintenance',
  description: 'Billing gateway returns 503',
  resources: options => [`route:${options.url}`],
  async apply(page, options: { url: string }) {
    const handler = async (route: Route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Gateway maintenance' })
      });
    };

    await page.route(options.url, handler);
    return async () => {
      await page.unroute(options.url, handler);
    };
  }
});
```

```ts
await chaos.apply('billing.gateway-maintenance', { url: '**/api/billing/**' });
```

## API

```ts
import {
  chaos,
  ChaosConflictError,
  ChaosValidationError,
  registerRecipe,
  type RecipeName,
  type RecipeOptionsMap
} from 'playwright-chaos-recipes';

const experiment = chaos(page);

await experiment.apply('api.empty', { url: '**/api/orders' });
await experiment.list();    // RecipeName[]
await experiment.restore(); // runs cleanups in reverse order
```

`apply(name, options)` is typed from `RecipeOptionsMap`, so built-in recipe names and options are checked at compile time.

Non-JSON error pages:

```ts
await chaos.apply('api.status', {
  url: '**/maintenance',
  status: 503,
  contentType: 'text/html',
  rawBody: '<h1>Down for maintenance</h1>'
});
```

`restore()` removes every recipe applied on that controller. If a cleanup throws, the controller still clears its list and then throws an `AggregateError`.

## Develop this repository

```bash
npm install
npx playwright install chromium
npm run lint
npm test
```

`npm run demo` serves the sample dashboard under `examples/dashboard/` (see `examples/dashboard/main.ts`). The specs in `tests/` import the compiled `dist/` entry, matching what consumers get from npm. `tests/fixtures.ts` shows the auto-`restore` fixture pattern from above.

## License

MIT
