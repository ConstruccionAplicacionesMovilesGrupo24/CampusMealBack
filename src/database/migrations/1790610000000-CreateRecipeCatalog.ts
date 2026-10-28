import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 3 / issue S3-04 (BQ3): the recipe catalog served by GET /recipes.
 * - A single row (CHECK id = 1) with the catalog version, its fixed production instant and the
 *   recipes as a JSONB array. The catalog is small, read-only and replaced as a whole.
 * - No user data and no foreign keys. Rows are written only by the recipes seed.
 * - Additive: no existing table changes.
 */
export class CreateRecipeCatalog1790610000000 implements MigrationInterface {
  name = 'CreateRecipeCatalog1790610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recipe_catalog" (
        "id" smallint NOT NULL,
        "catalog_version" character varying(40) NOT NULL,
        "generated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "recipes" jsonb NOT NULL,
        CONSTRAINT "CHK_recipe_catalog_single_row" CHECK ("id" = 1),
        CONSTRAINT "CHK_recipe_catalog_version_not_blank" CHECK (length(btrim("catalog_version")) > 0),
        CONSTRAINT "CHK_recipe_catalog_recipes_array" CHECK (jsonb_typeof("recipes") = 'array'),
        CONSTRAINT "PK_recipe_catalog_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "recipe_catalog"`);
  }
}
