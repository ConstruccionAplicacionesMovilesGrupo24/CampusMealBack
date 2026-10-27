import { Check, Column, Entity, PrimaryColumn } from 'typeorm';
import { CatalogRecipe } from '../recipe-catalog.types';

/** The only allowed primary key: the table holds at most one catalog. */
export const RECIPE_CATALOG_ROW_ID = 1;

/**
 * The current recipe catalog (BQ3) as a single row: version metadata plus the recipes as JSONB.
 * Written only by the recipes seed; read by GET /recipes. No per-user data.
 */
@Entity({ name: 'recipe_catalog' })
@Check('CHK_recipe_catalog_single_row', `"id" = 1`)
@Check(
  'CHK_recipe_catalog_version_not_blank',
  `length(btrim("catalog_version")) > 0`,
)
@Check('CHK_recipe_catalog_recipes_array', `jsonb_typeof("recipes") = 'array'`)
export class RecipeCatalogRow {
  @PrimaryColumn({
    type: 'smallint',
    primaryKeyConstraintName: 'PK_recipe_catalog_id',
  })
  id: number;

  @Column({ name: 'catalog_version', type: 'varchar', length: 40 })
  catalogVersion: string;

  @Column({ name: 'generated_at', type: 'timestamptz' })
  generatedAt: Date;

  @Column({ type: 'jsonb' })
  recipes: CatalogRecipe[];
}
