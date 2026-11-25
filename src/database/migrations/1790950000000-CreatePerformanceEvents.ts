import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 / S4-09 (BQ1). Additive only: one new table. `usage_events` and its strict DTO do not
 * change, so the deployed Android 0.4.0 and Swift clients keep working.
 *
 * Uniqueness (all inserts use ON CONFLICT DO NOTHING):
 * - (user_id, client_event_id): a retry or an outbox replay is stored once.
 * - (user_id, session_id, event_type) for sessions and crashes: a session counts once.
 * - (user_id, load_id) for comparison loads: the first terminal outcome wins.
 */
export class CreatePerformanceEvents1790950000000 implements MigrationInterface {
  name = 'CreatePerformanceEvents1790950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "performance_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "client_event_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "event_type" character varying(40) NOT NULL,
        "session_id" uuid,
        "load_id" uuid,
        "platform" "public"."client_platform" NOT NULL,
        "device_model" character varying(80) NOT NULL,
        "os_version" character varying(40) NOT NULL,
        "app_version" character varying(40) NOT NULL,
        "screen" character varying(40),
        "exception_class" character varying(200),
        "duration_ms" integer,
        "outcome" character varying(40),
        "injected" boolean NOT NULL DEFAULT false,
        "synthetic" boolean NOT NULL DEFAULT false,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_performance_events_type" CHECK ("event_type" IN ('SESSION_START', 'FATAL_CRASH', 'COMPARISON_LOAD')),
        CONSTRAINT "CHK_performance_events_shape" CHECK (
          ("event_type" = 'SESSION_START' AND "session_id" IS NOT NULL AND "load_id" IS NULL AND "exception_class" IS NULL AND "duration_ms" IS NULL AND "outcome" IS NULL AND NOT "injected")
          OR ("event_type" = 'FATAL_CRASH' AND "session_id" IS NOT NULL AND "load_id" IS NULL AND "duration_ms" IS NULL AND "outcome" IS NULL)
          OR ("event_type" = 'COMPARISON_LOAD' AND "load_id" IS NOT NULL AND "outcome" IS NOT NULL AND "exception_class" IS NULL AND NOT "injected")
        ),
        CONSTRAINT "CHK_performance_events_duration" CHECK ("duration_ms" IS NULL OR "duration_ms" BETWEEN 0 AND 600000),
        CONSTRAINT "FK_performance_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_performance_events_user_client_event" ON "performance_events" ("user_id", "client_event_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_performance_events_user_session_type" ON "performance_events" ("user_id", "session_id", "event_type") WHERE "event_type" IN ('SESSION_START', 'FATAL_CRASH')`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_performance_events_user_load" ON "performance_events" ("user_id", "load_id") WHERE "event_type" = 'COMPARISON_LOAD'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_performance_events_type_occurred_at" ON "performance_events" ("event_type", "occurred_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_performance_events_type_occurred_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_performance_events_user_load"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_performance_events_user_session_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_performance_events_user_client_event"`,
    );
    await queryRunner.query(`DROP TABLE "performance_events"`);
  }
}
