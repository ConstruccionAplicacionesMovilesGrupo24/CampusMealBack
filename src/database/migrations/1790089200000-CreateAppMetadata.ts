import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foundation migration (Issue #1). Creates an infrastructure-only key/value
 * table so the migration pipeline can be applied and reverted end to end.
 * It holds no business data.
 */
export class CreateAppMetadata1790089200000 implements MigrationInterface {
  name = 'CreateAppMetadata1790089200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "app_metadata" (
        "key" character varying(100) NOT NULL,
        "value" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_metadata_key" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_metadata"`);
  }
}
