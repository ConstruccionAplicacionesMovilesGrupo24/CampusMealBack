import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #3: user inventory for BQ2 (items expiring within N days).
 * - expiration_date is a calendar date (`date`), never a timestamp.
 * - Items are deleted with their user (ON DELETE CASCADE); the API only deactivates them.
 * - The composite index matches the BQ2 filter: user_id + active + expiration_date range.
 * - No uniqueness on (user_id, name): the same product may be stored twice.
 */
export class CreateInventoryItems1790262000000 implements MigrationInterface {
  name = 'CreateInventoryItems1790262000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "inventory_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "quantity" double precision NOT NULL,
        "unit" character varying(30) NOT NULL,
        "expiration_date" date NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_inventory_items_name_not_blank" CHECK (length(btrim("name")) > 0),
        CONSTRAINT "CHK_inventory_items_unit_not_blank" CHECK (length(btrim("unit")) > 0),
        CONSTRAINT "CHK_inventory_items_quantity_non_negative" CHECK ("quantity" >= 0 AND "quantity" < 'Infinity'::double precision),
        CONSTRAINT "PK_inventory_items_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_items_user_active_expiration" ON "inventory_items" ("user_id", "active", "expiration_date")`,
    );
    await queryRunner.query(`
      ALTER TABLE "inventory_items"
        ADD CONSTRAINT "FK_inventory_items_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_items" DROP CONSTRAINT "FK_inventory_items_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_inventory_items_user_active_expiration"`,
    );
    await queryRunner.query(`DROP TABLE "inventory_items"`);
  }
}
