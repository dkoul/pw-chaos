import type { Page } from '@playwright/test';
import { recipes } from './recipes.js';
import type { AppliedRecipe, RecipeDefinition } from './types.js';

export class ChaosConflictError extends Error {
  constructor(resource: string, existing: string, incoming: string) {
    super(`Chaos resource "${resource}" is already owned by "${existing}", cannot apply "${incoming}".`);
    this.name = 'ChaosConflictError';
  }
}

export class ChaosController {
  private readonly applied: AppliedRecipe[] = [];
  private readonly owners = new Map<string, string>();

  constructor(private readonly page: Page) {}

  async apply(name: string, options: unknown = {}): Promise<void> {
    const recipe = recipes.find(item => item.name === name);
    if (!recipe) {
      throw new Error(`Unknown chaos recipe "${name}". Available: ${recipes.map(r => r.name).join(', ')}`);
    }
    await this.applyDefinition(recipe, options);
  }

  async applyMany(names: string[]): Promise<void> {
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

  async list(): Promise<string[]> {
    return this.applied.map(item => item.name);
  }

  private async applyDefinition(
    recipe: RecipeDefinition<any>,
    options: unknown
  ): Promise<void> {
    const resources = recipe.resources?.(options) ?? [];
    for (const resource of resources) {
      const owner = this.owners.get(resource);
      if (owner) throw new ChaosConflictError(resource, owner, recipe.name);
    }

    // Reserve resources before applying to prevent partial concurrent ownership.
    for (const resource of resources) this.owners.set(resource, recipe.name);
    try {
      const result = await recipe.apply(this.page, options);
      const cleanup = typeof result === 'function' ? result : undefined;
      this.applied.push({ name: recipe.name, cleanup, resources });
    } catch (error) {
      for (const resource of resources) this.owners.delete(resource);
      throw error;
    }
  }
}

export function chaos(page: Page): ChaosController {
  return new ChaosController(page);
}
