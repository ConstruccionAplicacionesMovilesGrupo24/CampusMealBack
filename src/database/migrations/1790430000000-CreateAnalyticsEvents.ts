import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #7: analytics events for BQ8 (explanation selection rate).
 * - client_event_id is unique so client retries never create duplicate rows.
 * - No coordinates, tokens or passwords are stored.
 * - The explanation category is not duplicated here; BQ8 joins recommendation_runs.
 * - Reuses the meal_alternative enum type created by Issue #6.
 */
export class CreateAnalyticsEvents1790430000000 implements MigrationInterface {
  name = 'CreateAnalyticsEvents1790430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."analytics_event_type" AS ENUM('RECOMMENDATION_IMPRESSION', 'RECOMMENDATION_SELECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."client_platform" AS ENUM('ANDROID', 'IOS')`,
    );
    await queryRunner.query(`
      CREATE TABLE "analytics_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_event_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "recommendation_id" uuid NOT NULL,
        "event_type" "public"."analytics_event_type" NOT NULL,
        "selected_alternative" "public"."meal_alternative",
        "platform" "public"."client_platform" NOT NULL,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_analytics_events_selection_alternative" CHECK (
          ("event_type" = 'RECOMMENDATION_SELECTED' AND "selected_alternative" IS NOT NULL)
          OR ("event_type" = 'RECOMMENDATION_IMPRESSION' AND "selected_alternative" IS NULL)
        ),
        CONSTRAINT "PK_analytics_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_analytics_events_client_event_id" ON "analytics_events" ("client_event_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_recommendation_id" ON "analytics_events" ("recommendation_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analytics_events_occurred_at" ON "analytics_events" ("occurred_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "analytics_events"
        ADD CONSTRAINT "FK_analytics_events_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "analytics_events"
        ADD CONSTRAINT "FK_analytics_events_recommendation_id"
        FOREIGN KEY ("recommendation_id") REFERENCES "recommendation_runs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "analytics_events" DROP CONSTRAINT "FK_analytics_events_recommendation_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "analytics_events" DROP CONSTRAINT "FK_analytics_events_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_analytics_events_occurred_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_analytics_events_recommendation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_analytics_events_client_event_id"`,
    );
    await queryRunner.query(`DROP TABLE "analytics_events"`);
    await queryRunner.query(`DROP TYPE "public"."client_platform"`);
    await queryRunner.query(`DROP TYPE "public"."analytics_event_type"`);
  }
}
