import { test as base, expect } from '@playwright/test';
import { chaos, type ChaosController } from '../dist/index.js';

export const test = base.extend<{ chaos: ChaosController }>({
  chaos: async ({ page }, use) => {
    const experiment = chaos(page);
    await use(experiment);
    await experiment.restore();
  }
});

export { expect };