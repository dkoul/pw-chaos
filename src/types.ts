import type { Page } from '@playwright/test';

export type Cleanup = () => Promise<void>;

export interface RecipeDefinition<TOptions = unknown> {
  name: string;
  description: string;
  /** Resource keys prevent two recipes from silently owning the same browser feature. */
  resources?: (options: TOptions) => string[];
  apply(page: Page, options: TOptions): Promise<Cleanup | void>;
}

export interface AppliedRecipe {
  name: string;
  cleanup?: Cleanup;
  resources: string[];
}

export interface ChaosOptions {
  seed?: number;
}
