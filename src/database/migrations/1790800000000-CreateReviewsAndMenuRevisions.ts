import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 / S4-03 (BQ13). Additive only: two new tables, no change to existing ones, so the
 * deployed Android 0.4.0 and Swift clients keep working.
 *
 * - restaurant_reviews: structured self-reported reviews, one per author/restaurant/Bogotá day,
 *   idempotent per author by client_review_id.
 * - menu_revisions: append-only history of meaningful menu/price changes. It starts empty:
 *   history before this migration is unknown and is not backfilled from created_at/updated_at.
 */
export class CreateReviewsAndMenuRevisions1790800000000 implements MigrationInterface {
  name = 'CreateReviewsAndMenuRevisions1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "restaurant_reviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_review_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "restaurant_id" uuid NOT NULL,
        "overall" smallint NOT NULL,
        "portion" smallint NOT NULL,
        "taste" smallint NOT NULL,
        "freshness" smallint NOT NULL,
        "value" smallint NOT NULL,
        "wait_minutes" integer NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "review_date" date NOT NULL,
        "synthetic" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_restaurant_reviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_restaurant_reviews_scores_range" CHECK ("overall" BETWEEN 1 AND 5 AND "portion" BETWEEN 1 AND 5 AND "taste" BETWEEN 1 AND 5 AND "freshness" BETWEEN 1 AND 5 AND "value" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_restaurant_reviews_wait_minutes_range" CHECK ("wait_minutes" BETWEEN 0 AND 180),
        CONSTRAINT "FK_restaurant_reviews_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_restaurant_reviews_restaurant_id" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_restaurant_reviews_user_client_review" ON "restaurant_reviews" ("user_id", "client_review_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_restaurant_reviews_user_restaurant_day" ON "restaurant_reviews" ("user_id", "restaurant_id", "review_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_restaurant_reviews_restaurant_date" ON "restaurant_reviews" ("restaurant_id", "review_date")`,
    );

    await queryRunner.query(`
      CREATE TABLE "menu_revisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "restaurant_id" uuid NOT NULL,
        "meal_id" uuid,
        "meal_name" character varying(150) NOT NULL,
        "change_type" character varying(40) NOT NULL,
        "previous_value" jsonb,
        "new_value" jsonb,
        "changed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "source" character varying(40) NOT NULL,
        "note" character varying(200),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_menu_revisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_menu_revisions_change_type" CHECK ("change_type" IN ('MENU_ITEM_ADDED', 'MENU_ITEM_REMOVED', 'PRICE_CHANGED', 'AVAILABILITY_CHANGED')),
        CONSTRAINT "CHK_menu_revisions_source" CHECK ("source" IN ('MAINTENANCE_SCRIPT', 'SYNTHETIC_SEED')),
        CONSTRAINT "FK_menu_revisions_restaurant_id" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_menu_revisions_meal_id" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_menu_revisions_restaurant_changed_at" ON "menu_revisions" ("restaurant_id", "changed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_menu_revisions_restaurant_changed_at"`,
    );
    await queryRunner.query(`DROP TABLE "menu_revisions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_restaurant_reviews_restaurant_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_restaurant_reviews_user_restaurant_day"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_restaurant_reviews_user_client_review"`,
    );
    await queryRunner.query(`DROP TABLE "restaurant_reviews"`);
  }
}
