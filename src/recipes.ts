import type { Page, Route } from '@playwright/test';
import {
  ChaosValidationError,
  type DelayOptions,
  type IntermittentOptions,
  type RateLimitOptions,
  type RecipeDefinition,
  type RouteOptions,
  type SelectorOptions,
  type StatusOptions,
  type StorageOptions
} from './types.js';

function requireUrl(options: { url?: string }, recipe: string): asserts options is { url: string } {
  if (!options.url?.trim()) {
    throw new ChaosValidationError(`Recipe "${recipe}" requires a non-empty "url" option.`);
  }
}

function requireSelector(options: { selector?: string }, recipe: string): asserts options is { selector: string } {
  if (!options.selector?.trim()) {
    throw new ChaosValidationError(`Recipe "${recipe}" requires a non-empty "selector" option.`);
  }
}

function requireProbability(options: IntermittentOptions, recipe: string): void {
  const p = options.probability ?? 0.5;
  if (p < 0 || p > 1) {
    throw new ChaosValidationError(`Recipe "${recipe}" requires "probability" between 0 and 1.`);
  }
}

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

async function restoreStorageWithSnapshot(
  page: Page,
  storage: 'local' | 'session',
  snapshot: Record<string, string>
): Promise<void> {
  if (page.isClosed()) return;
  try {
    await page.evaluate(
      ({ kind, values }) => {
        const store = kind === 'local' ? localStorage : sessionStorage;
        store.clear();
        for (const [key, value] of Object.entries(values)) {
          store.setItem(key, value);
        }
      },
      { kind: storage, values: snapshot }
    );
  } catch {
    if (page.isClosed()) return;
    throw new Error('Chaos cleanup failed: could not restore web storage (page may have navigated away).');
  }
}

function routeRecipe<T extends RouteOptions>(
  name: string,
  description: string,
  handlerFactory: (options: T) => (route: Route) => Promise<void>,
  validate?: (options: T) => void
): RecipeDefinition<T> {
  return {
    name,
    description,
    resources: options => [`route:${options.url}`],
    validate: options => {
      requireUrl(options, name);
      validate?.(options);
    },
    async apply(page, options) {
      const handler = handlerFactory(options);
      await page.route(options.url, handler, {
        times: options.times
      });
      return async () => {
        await page.unroute(options.url, handler);
      };
    }
  };
}

function webStorageRecipe(
  name: string,
  description: string,
  storage: 'local' | 'session',
  resourceKey: string
): RecipeDefinition<StorageOptions> {
  return {
    name,
    description,
    resources: () => [resourceKey],
    async apply(page, options: StorageOptions = {}) {
      const snapshot = await page.evaluate(kind => {
        const store = kind === 'local' ? localStorage : sessionStorage;
        const values: Record<string, string> = {};
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key !== null) values[key] = store.getItem(key) ?? '';
        }
        return values;
      }, storage);

      await page.evaluate(
        ({ kind, keyList }) => {
          const store = kind === 'local' ? localStorage : sessionStorage;
          if (!keyList?.length) store.clear();
          else keyList.forEach(key => store.removeItem(key));
        },
        { kind: storage, keyList: options.keys }
      );

      return async () => restoreStorageWithSnapshot(page, storage, snapshot);
    }
  };
}

export const recipes: RecipeDefinition<any>[] = [
  routeRecipe<StatusOptions>(
    'api.status',
    'Return a chosen HTTP status and JSON or raw payload.',
    options => async route => {
      if (options.rawBody !== undefined) {
        await route.fulfill({
          status: options.status ?? 500,
          contentType: options.contentType ?? 'text/plain',
          body: options.rawBody
        });
        return;
      }
      await route.fulfill({
        status: options.status ?? 500,
        contentType: options.contentType ?? 'application/json',
        body: JSON.stringify(options.body ?? { error: 'Chaos injected' })
      });
    }
  ),
  routeRecipe<DelayOptions>(
    'api.delay',
    'Delay a matching request before allowing it through.',
    options => async route => {
      await new Promise(resolve => setTimeout(resolve, options.ms ?? 2000));
      await route.continue();
    }
  ),
  routeRecipe<RouteOptions>(
    'api.abort',
    'Abort matching requests at the network layer.',
    () => async route => {
      await route.abort('failed');
    }
  ),
  routeRecipe<DelayOptions>(
    'api.timeout',
    'Hold a request for a duration, then abort it as timed out.',
    options => async route => {
      await new Promise(resolve => setTimeout(resolve, options.ms ?? 5000));
      await route.abort('timedout');
    }
  ),
  routeRecipe<RouteOptions>(
    'api.empty',
    'Return an empty JSON object for matching requests.',
    () => async route => {
      await route.fulfill(jsonResponse(200, {}));
    }
  ),
  routeRecipe<RouteOptions>(
    'api.corrupt-json',
    'Return malformed JSON for matching requests.',
    () => async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"chaos":'
      });
    }
  ),
  routeRecipe<RateLimitOptions>(
    'api.rate-limit',
    'Respond with HTTP 429 and an optional Retry-After header.',
    options => async route => {
      const headers: Record<string, string> = {};
      if (options.retryAfterMs !== undefined) {
        headers['Retry-After'] = String(Math.ceil(options.retryAfterMs / 1000));
      }
      await route.fulfill({
        status: 429,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rate limit exceeded' })
      });
    }
  ),
  routeRecipe<IntermittentOptions>(
    'api.intermittent',
    'Randomly abort or pass through matching requests (see "probability").',
    options => async route => {
      const p = options.probability ?? 0.5;
      if (Math.random() < p) await route.abort('failed');
      else await route.continue();
    },
    options => requireProbability(options, 'api.intermittent')
  ),
  {
    name: 'browser.offline',
    description: 'Put the browser context into offline mode.',
    resources: () => ['browser:offline'],
    async apply(page) {
      const context = page.context();
      await context.setOffline(true);
      return async () => context.setOffline(false);
    }
  } satisfies RecipeDefinition<Record<string, never>>,
  {
    name: 'ui.hide',
    description: 'Hide a matching UI element with an injected style.',
    resources: options => [`ui-style:${options.selector}`],
    validate: options => requireSelector(options, 'ui.hide'),
    async apply(page, options: SelectorOptions) {
      // Use trusted test selectors only; untrusted input in `selector` can inject CSS.
      const style = await page.addStyleTag({
        content: `${options.selector} { visibility: hidden !important; }`
      });
      return async () => {
        await style.evaluate(element => {
          element.parentNode?.removeChild(element);
        });
      };
    }
  } satisfies RecipeDefinition<SelectorOptions>,
  webStorageRecipe(
    'storage.clear',
    'Clear selected localStorage keys on the current origin.',
    'local',
    'storage:local'
  ),
  webStorageRecipe(
    'sessionStorage.clear',
    'Clear selected sessionStorage keys on the current origin.',
    'session',
    'storage:session'
  )
];

/** Register a third-party recipe before creating a ChaosController. */
export function registerRecipe(recipe: RecipeDefinition<any>): void {
  if (recipes.some(existing => existing.name === recipe.name)) {
    throw new Error(`A chaos recipe named "${recipe.name}" is already registered.`);
  }
  recipes.push(recipe);
}