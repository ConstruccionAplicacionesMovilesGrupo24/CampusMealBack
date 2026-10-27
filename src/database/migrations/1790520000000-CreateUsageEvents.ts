import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 3 / issue S3-10 (BQ6): product usage events.
 * - UNIQUE (user_id, client_event_id): idempotent per account, so a retry or an outbox replay
 *   never creates a second row (analytics_events keeps its own global uniqueness for BQ8).
 * - occurred_at (device time, UTC) decides which month an event belongs to; received_at is
 *   only when the backend stored it, so late syncs land in the month they happened.
 * - No coordinates, tokens or free text. zone_id / food_category / budget_band are optional,
 *   coarse demand context shared with BQ9.
 * - synthetic marks demo data so reports can say so.
 */
export class CreateUsageEvents1790520000000 implements MigrationInterface {
  name = 'CreateUsageEvents1790520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."usage_event_type" AS ENUM('SESSION_STARTED', 'FEATURE_USED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."usage_feature" AS ENUM('INVENTORY', 'RECIPES', 'RESTAURANT_SEARCH', 'RESTAURANT_DETAIL', 'MEAL_COMPARISON')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."usage_budget_band" AS ENUM('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(`
      CREATE TABLE "usage_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_event_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "event_type" "public"."usage_event_type" NOT NULL,
        "feature" "public"."usage_feature",
        "platform" "public"."client_platform" NOT NULL,
        "zone_id" character varying(64),
        "food_category" character varying(40),
        "budget_band" "public"."usage_budget_band",
        "synthetic" boolean NOT NULL DEFAULT false,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_usage_events_feature_for_type" CHECK (
          ("event_type" = 'FEATURE_USED' AND "feature" IS NOT NULL)
          OR ("event_type" = 'SESSION_STARTED' AND "feature" IS NULL)
        ),
        CONSTRAINT "PK_usage_events_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_usage_events_user_client_event" ON "usage_events" ("user_id", "client_event_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_usage_events_occurred_at" ON "usage_events" ("occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_usage_events_user_occurred_at" ON "usage_events" ("user_id", "occurred_at")`,
    );
    await queryRunner.query(`
      ALTER TABLE "usage_events"
        ADD CONSTRAINT "FK_usage_events_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "usage_events" DROP CONSTRAINT "FK_usage_events_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_usage_events_user_occurred_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_usage_events_occurred_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_usage_events_user_client_event"`,
    );
    await queryRunner.query(`DROP TABLE "usage_events"`);
    await queryRunner.query(`DROP TYPE "public"."usage_budget_band"`);
    await queryRunner.query(`DROP TYPE "public"."usage_feature"`);
    await queryRunner.query(`DROP TYPE "public"."usage_event_type"`);
  }
}
