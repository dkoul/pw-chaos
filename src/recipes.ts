import type { Page, Route } from '@playwright/test';
import type { Cleanup, RecipeDefinition } from './types.js';

type RouteOptions = { url: string; times?: number };
type StatusOptions = RouteOptions & { status?: number; body?: unknown };
type DelayOptions = RouteOptions & { ms?: number };
type SelectorOptions = { selector: string };
type StorageOptions = { keys?: string[] };

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  };
}

function routeRecipe<T extends RouteOptions>(
  name: string,
  description: string,
  handlerFactory: (options: T) => (route: Route) => Promise<void>
): RecipeDefinition<T> {
  return {
    name,
    description,
    resources: options => [`route:${options.url}`],
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

export const recipes: RecipeDefinition<any>[] = [
  routeRecipe<StatusOptions>(
    'api.status',
    'Return a chosen HTTP status and JSON payload.',
    options => async route => {
      await route.fulfill(jsonResponse(
        options.status ?? 500,
        options.body ?? { error: 'Chaos injected' }
      ));
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
    async apply(page, options: SelectorOptions) {
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
  {
    name: 'storage.clear',
    description: 'Clear selected localStorage keys on the current origin.',
    resources: () => ['storage:local'],
    async apply(page, options: StorageOptions = {}) {
      const snapshot = await page.evaluate(() => {
        const values: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key !== null) values[key] = localStorage.getItem(key) ?? '';
        }
        return values;
      });
      await page.evaluate(keys => {
        if (!keys?.length) localStorage.clear();
        else keys.forEach(key => localStorage.removeItem(key));
      }, options.keys);
      return async () => {
        await page.evaluate(values => {
          localStorage.clear();
          for (const [key, value] of Object.entries(values)) {
            localStorage.setItem(key, value);
          }
        }, snapshot);
      };
    }
  } satisfies RecipeDefinition<StorageOptions>
];


/** Register a third-party recipe before creating a ChaosController. */
export function registerRecipe(recipe: RecipeDefinition<any>): void {
  if (recipes.some(existing => existing.name === recipe.name)) {
    throw new Error(`A chaos recipe named "${recipe.name}" is already registered.`);
  }
  recipes.push(recipe);
}
