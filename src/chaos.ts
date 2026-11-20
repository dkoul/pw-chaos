import type { Page } from '@playwright/test';
import { recipes } from './recipes.js';
import type { AppliedRecipe, OptionlessRecipeName, RecipeDefinition, RecipeName, RecipeOptionsMap } from './types.js';

export class ChaosConflictError extends Error {
  constructor(resource: string, existing: string, incoming: string) {
    super(`Chaos resource "${resource}" is already owned by "${existing}", cannot apply "${incoming}".`);
    this.name = 'ChaosConflictError';
  }
}

type ApplyArgs<K extends RecipeName> = RecipeOptionsMap[K] extends Record<string, never>
  ? [options?: RecipeOptionsMap[K]]
  : [options: RecipeOptionsMap[K]];

export class ChaosController {
  private readonly applied: AppliedRecipe[] = [];
  private readonly owners = new Map<string, string>();

  constructor(private readonly page: Page) {}

  async apply<K extends RecipeName>(name: K, ...args: ApplyArgs<K>): Promise<void> {
    const recipe = recipes.find(item => item.name === name);
    if (!recipe) {
      throw new Error(`Unknown chaos recipe "${name}". Available: ${recipes.map(r => r.name).join(', ')}`);
    }
    const options = (args[0] ?? {}) as RecipeOptionsMap[K];
    await this.applyDefinition(recipe as RecipeDefinition<RecipeOptionsMap[K]>, name, options);
  }

  async applyMany(names: OptionlessRecipeName[]): Promise<void> {
    for (const name of names) await this.apply(name);
  }

  async restore(): Promise<void> {
    const errors: unknown[] = [];
    for (const item of [...this.applied].reverse()) {
      try {
        await item.cleanup?.();
      } catch (error) {
        errors.push(error);
      }
      for (const resource of item.resources) {
        if (this.owners.get(resource) === item.name) this.owners.delete(resource);
      }
    }
    this.applied.length = 0;
    if (errors.length) {
      throw new AggregateError(errors, 'One or more chaos recipes failed to restore.');
    }
  }

  async list(): Promise<RecipeName[]> {
    return this.applied.map(item => item.name as RecipeName);
  }

  private async applyDefinition<K extends RecipeName>(
    recipe: RecipeDefinition<RecipeOptionsMap[K]>,
    name: K,
    options: RecipeOptionsMap[K]
  ): Promise<void> {
    recipe.validate?.(options);
    const resources = recipe.resources?.(options) ?? [];
    for (const resource of resources) {
      const owner = this.owners.get(resource);
      if (owner) throw new ChaosConflictError(resource, owner, recipe.name);
    }

    for (const resource of resources) this.owners.set(resource, recipe.name);
    try {
      const result = await recipe.apply(this.page, options);
      const cleanup = typeof result === 'function' ? result : undefined;
      this.applied.push({ name, cleanup, resources });
    } catch (error) {
      for (const resource of resources) this.owners.delete(resource);
      throw error;
    }
  }
}

export function chaos(page: Page): ChaosController {
  return new ChaosController(page);
}