import fs from 'node:fs';
import path from 'node:path';

export interface ShotRecipe {
  id: string;
  name: string;
  description: string;
  /** Engines that implement the recipe. Absent means the static-card engines (hyperframes, html). */
  engines?: string[];
  recommended_duration_seconds: [number, number];
  motion: Record<string, unknown>;
  layout: Record<string, unknown>;
}

export interface BoundSceneRecipe {
  recipe_id: string;
  recipe_name: string;
  duration_seconds: number;
  motion_params: Record<string, unknown>;
  layout_params: Record<string, unknown>;
  resolved_styles: {
    font_family?: string;
    primary_color?: string;
    accent_color?: string;
    background_color?: string;
  };
}

export class ShotRecipeRegistry {
  private recipesDir: string;
  private recipes: Map<string, ShotRecipe> = new Map();

  constructor(recipesDir = path.join(process.cwd(), 'styles', 'recipes')) {
    this.recipesDir = recipesDir;
    this.loadAll();
  }

  loadAll(): void {
    if (!fs.existsSync(this.recipesDir)) return;
    const files = fs.readdirSync(this.recipesDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const fullPath = path.join(this.recipesDir, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (parsed.id) {
          this.recipes.set(parsed.id, parsed);
        }
      } catch {
        // Skip malformed recipe files
      }
    }
  }

  getRecipe(id: string): ShotRecipe | undefined {
    return this.recipes.get(id);
  }

  listRecipes(): ShotRecipe[] {
    return Array.from(this.recipes.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  count(): number {
    return this.recipes.size;
  }

  /**
   * Binds recipe motion and layout rules to active brand tokens and target scene duration.
   */
  bindRecipe(
    recipeId: string,
    tokens: {
      colors?: { primary?: string; accent?: string; background?: string };
      typography?: { primary_font?: string };
    },
    requestedDurationSeconds?: number
  ): BoundSceneRecipe {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) {
      throw new Error(`Recipe not found: ${recipeId}`);
    }

    const [minDur, maxDur] = recipe.recommended_duration_seconds;
    const clampedDuration = requestedDurationSeconds
      ? Math.max(minDur, Math.min(maxDur, requestedDurationSeconds))
      : minDur;

    return {
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      duration_seconds: clampedDuration,
      motion_params: { ...recipe.motion },
      layout_params: { ...recipe.layout },
      resolved_styles: {
        font_family: tokens.typography?.primary_font || 'Inter, sans-serif',
        primary_color: tokens.colors?.primary || '#FFFFFF',
        accent_color: tokens.colors?.accent || '#FF4500',
        background_color: tokens.colors?.background || '#0F172A'
      }
    };
  }
}

