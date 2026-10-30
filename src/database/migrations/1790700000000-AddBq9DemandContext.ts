import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBq9DemandContext1790700000000 implements MigrationInterface {
  name = 'AddBq9DemandContext1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meals"
       ADD COLUMN "meal_category" character varying(40)`,
    );

    await queryRunner.query(
      `ALTER TABLE "recommendation_runs"
       ADD COLUMN "zone" character varying(64)`,
    );

    await queryRunner.query(
      `ALTER TABLE "recommendation_runs"
       ADD COLUMN "synthetic" boolean NOT NULL DEFAULT false`,
    );

    // Backfill the demo catalog already deployed in Neon.
    await queryRunner.query(
      `UPDATE "meals" SET "meal_category" = 'BOWLS'
       WHERE "name" IN ('Vegetarian bowl', 'Vegan power bowl')`,
    );

    await queryRunner.query(
      `UPDATE "meals" SET "meal_category" = 'HOME_STYLE'
       WHERE "name" IN ('Today''s vegetarian menu', 'Grilled chicken menu')`,
    );

    await queryRunner.query(
      `UPDATE "meals" SET "meal_category" = 'SOUPS'
       WHERE "name" = 'Ajiaco santafereño'`,
    );

    await queryRunner.query(
      `UPDATE "meals" SET "meal_category" = 'RICE_DISHES'
       WHERE "name" = 'Bandeja paisa'`,
    );

    await queryRunner.query(
      `UPDATE "meals" SET "meal_category" = 'SUSHI'
       WHERE "name" IN ('California roll combo', 'Vegetable roll combo')`,
    );

    await queryRunner.query(
      `UPDATE "meals" SET "meal_category" = 'SALADS'
       WHERE "name" = 'Quinoa salad'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recommendation_runs" DROP COLUMN "synthetic"`,
    );

    await queryRunner.query(
      `ALTER TABLE "recommendation_runs" DROP COLUMN "zone"`,
    );

    await queryRunner.query(`ALTER TABLE "meals" DROP COLUMN "meal_category"`);
  }
}
