import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #6: BQ5 Cook-Walk-Order recommendations.
 * - Exact user coordinates are never stored (architecture doc §7) — only availableMinutes
 *   and maximumBudget, the context needed to audit a decision.
 * - explanation_type is nullable: a run with zero available alternatives has no dominant
 *   strategy.
 * - Alternatives are deleted with their run (ON DELETE CASCADE).
 */
export class CreateRecommendations1790350000000
  implements MigrationInterface
{
  name = 'CreateRecommendations1790350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."meal_alternative" AS ENUM('COOK', 'WALK', 'ORDER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."explanation_type" AS ENUM('TIME_PRIORITY', 'BUDGET_PRIORITY', 'EXPIRATION_PRIORITY', 'CONTEXT_COMPATIBILITY')`,
    );
    await queryRunner.query(`
      CREATE TABLE "recommendation_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "available_minutes" integer NOT NULL,
        "maximum_budget" integer NOT NULL,
        "explanation_type" "public"."explanation_type",
        "main_explanation" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_recommendation_runs_minutes_positive" CHECK ("available_minutes" > 0),
        CONSTRAINT "CHK_recommendation_runs_budget_non_negative" CHECK ("maximum_budget" >= 0),
        CONSTRAINT "PK_recommendation_runs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_recommendation_runs_user_id" ON "recommendation_runs" ("user_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "recommendation_runs"
        ADD CONSTRAINT "FK_recommendation_runs_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      CREATE TABLE "recommendation_alternatives" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "recommendation_id" uuid NOT NULL,
        "type" "public"."meal_alternative" NOT NULL,
        "rank" integer NOT NULL,
        "score" double precision NOT NULL,
        "recommended" boolean NOT NULL,
        "estimated_minutes" integer NOT NULL,
        "estimated_cost" integer NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_recommendation_alternatives_rank_positive" CHECK ("rank" > 0),
        CONSTRAINT "CHK_recommendation_alternatives_score_range" CHECK ("score" >= 0 AND "score" <= 100),
        CONSTRAINT "PK_recommendation_alternatives_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_recommendation_alternatives_recommendation_id" ON "recommendation_alternatives" ("recommendation_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "recommendation_alternatives"
        ADD CONSTRAINT "FK_recommendation_alternatives_recommendation_id"
        FOREIGN KEY ("recommendation_id") REFERENCES "recommendation_runs"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recommendation_alternatives" DROP CONSTRAINT "FK_recommendation_alternatives_recommendation_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_recommendation_alternatives_recommendation_id"`,
    );
    await queryRunner.query(`DROP TABLE "recommendation_alternatives"`);
    await queryRunner.query(
      `ALTER TABLE "recommendation_runs" DROP CONSTRAINT "FK_recommendation_runs_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_recommendation_runs_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "recommendation_runs"`);
    await queryRunner.query(`DROP TYPE "public"."explanation_type"`);
    await queryRunner.query(`DROP TYPE "public"."meal_alternative"`);
  }
}
