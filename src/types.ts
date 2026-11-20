import type { Page } from '@playwright/test';

export type Cleanup = () => Promise<void>;

export type RouteOptions = { url: string; times?: number };

export type StatusOptions = RouteOptions & {
  status?: number;
  body?: unknown;
  contentType?: string;
  rawBody?: string;
};

export type DelayOptions = RouteOptions & { ms?: number };

export type SelectorOptions = { selector: string };

export type StorageOptions = { keys?: string[] };

export type RateLimitOptions = RouteOptions & { retryAfterMs?: number };

export type IntermittentOptions = RouteOptions & { probability?: number };

/** Built-in recipe names and their option shapes. */
export interface RecipeOptionsMap {
  'api.status': StatusOptions;
  'api.delay': DelayOptions;
  'api.abort': RouteOptions;
  'api.timeout': DelayOptions;
  'api.empty': RouteOptions;
  'api.corrupt-json': RouteOptions;
  'api.rate-limit': RateLimitOptions;
  'api.intermittent': IntermittentOptions;
  'browser.offline': Record<string, never>;
  'ui.hide': SelectorOptions;
  'storage.clear': StorageOptions;
  'sessionStorage.clear': StorageOptions;
}

export type RecipeName = keyof RecipeOptionsMap;

/** Recipes that `applyMany` can enable without per-recipe options. */
export type OptionlessRecipeName = 'browser.offline';

export interface RecipeDefinition<TOptions = unknown> {
  name: string;
  description: string;
  /** Resource keys prevent two recipes from silently owning the same browser feature. */
  resources?: (options: TOptions) => string[];
  validate?: (options: TOptions) => void;
  apply(page: Page, options: TOptions): Promise<Cleanup | void>;
}

export interface AppliedRecipe {
  name: string;
  cleanup?: Cleanup;
  resources: string[];
}

export class ChaosValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChaosValidationError';
  }
}