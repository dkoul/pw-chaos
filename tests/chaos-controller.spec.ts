import { test, expect } from '@playwright/test';
import {
  ChaosConflictError,
  ChaosController,
  ChaosValidationError,
  registerRecipe
} from '../dist/index.js';
import type { Page, Route } from '@playwright/test';

function createMockPage(overrides?: Partial<Page>): Page {
  const handlers = new Map<string, (route: Route) => Promise<void>>();
  const routes: { pattern: string; handler: (route: Route) => Promise<void> }[] = [];
  const page = {
    isClosed: () => false,
    context: () => ({
      setOffline: async () => {}
    }),
    route: async (
      pattern: string,
      handler: (route: Route) => Promise<void>,
      _options?: { times?: number }
    ) => {
      routes.push({ pattern, handler });
      handlers.set(pattern, handler);
    },
    unroute: async (pattern: string, handler: (route: Route) => Promise<void>) => {
      const index = routes.findIndex(entry => entry.pattern === pattern && entry.handler === handler);
      if (index >= 0) routes.splice(index, 1);
    },
    evaluate: async () => ({}),
    addStyleTag: async () => ({ evaluate: async () => {} }),
    ...overrides
  } as unknown as Page;

  return page;
}

test('apply rejects unknown recipes', async () => {
  const controller = new ChaosController(createMockPage());
  await expect(controller.apply('not-a-recipe' as 'api.abort', { url: '**' })).rejects.toThrow(/Unknown chaos recipe/);
});

test('apply validates required url', async () => {
  const controller = new ChaosController(createMockPage());
  await expect(controller.apply('api.status', { url: '' })).rejects.toBeInstanceOf(ChaosValidationError);
});

test('apply detects resource conflicts', async () => {
  const controller = new ChaosController(createMockPage());
  await controller.apply('api.status', { url: '**/same', status: 500 });
  await expect(
    controller.apply('api.delay', { url: '**/same', ms: 1 })
  ).rejects.toBeInstanceOf(ChaosConflictError);
  await controller.restore();
});

test('failed apply releases reserved resources', async () => {
  let routeAttempts = 0;
  const page = createMockPage({
    route: async () => {
      routeAttempts += 1;
      if (routeAttempts === 1) throw new Error('route failed');
    }
  });
  const controller = new ChaosController(page);
  await expect(controller.apply('api.status', { url: '**/x', status: 500 })).rejects.toThrow(/route failed/);
  await controller.apply('api.status', { url: '**/x', status: 503 });
  await expect(controller.list()).resolves.toEqual(['api.status']);
  await controller.restore();
});

test('restore aggregates cleanup failures', async () => {
  const page = createMockPage();
  const controller = new ChaosController(page);
  await controller.apply('browser.offline');

  const applied = (controller as unknown as { applied: { cleanup?: () => Promise<void> }[] }).applied;
  if (applied[0]) {
    applied[0].cleanup = async () => {
      throw new Error('cleanup blew up');
    };
  }

  await expect(controller.restore()).rejects.toBeInstanceOf(AggregateError);
  await expect(controller.list()).resolves.toEqual([]);
});

test('registerRecipe rejects duplicate names', async () => {
  registerRecipe({
    name: 'test.duplicate-guard',
    description: 'once',
    async apply() {
      return async () => {};
    }
  });
  expect(() =>
    registerRecipe({
      name: 'test.duplicate-guard',
      description: 'twice',
      async apply() {
        return async () => {};
      }
    })
  ).toThrow(/already registered/);
});