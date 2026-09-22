import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #2: users and refresh sessions.
 * - Email uniqueness and normalization are enforced by PostgreSQL itself.
 * - Passwords are stored only as Argon2id hashes; refresh tokens only as HMAC-SHA-256 hashes.
 * - Sessions are deleted with their user (ON DELETE CASCADE).
 * gen_random_uuid() is built into PostgreSQL 13+.
 */
export class CreateUsersAndRefreshSessions1790094600000 implements MigrationInterface {
  name = 'CreateUsersAndRefreshSessions1790094600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_role" AS ENUM('USER', 'ANALYST')`,
    );
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(100) NOT NULL,
        "email" character varying(254) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "role" "public"."user_role" NOT NULL DEFAULT 'USER',
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "CHK_users_name_not_blank" CHECK (length(btrim("name")) > 0),
        CONSTRAINT "CHK_users_email_normalized" CHECK ("email" = lower(btrim("email"))),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "refresh_sessions" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_sessions_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_sessions_user_id" ON "refresh_sessions" ("user_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "refresh_sessions"
        ADD CONSTRAINT "FK_refresh_sessions_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" DROP CONSTRAINT "FK_refresh_sessions_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_sessions_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
  }
}
