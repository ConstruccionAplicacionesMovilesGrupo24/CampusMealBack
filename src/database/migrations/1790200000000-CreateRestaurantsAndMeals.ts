import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #4: restaurant catalog and meals.
 * - opening_hours is JSONB: an array of { dayOfWeek (0=Sunday..6=Saturday), opensAt, closesAt }
 *   in "HH:mm". Computing OPEN/CLOSING_SOON/CLOSED from it is issue #5 (BQ4).
 * - Meals are deleted with their restaurant (ON DELETE CASCADE).
 */
export class CreateRestaurantsAndMeals1790200000000
  implements MigrationInterface
{
  name = 'CreateRestaurantsAndMeals1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."dietary_tag" AS ENUM('VEGETARIAN', 'VEGAN', 'GLUTEN_FREE')`,
    );
    await queryRunner.query(`
      CREATE TABLE "restaurants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(150) NOT NULL,
        "category" character varying(100) NOT NULL,
        "address" character varying(255) NOT NULL,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "opening_hours" jsonb NOT NULL,
        "average_rating" double precision NOT NULL,
        "delivery_available" boolean NOT NULL DEFAULT false,
        "estimated_delivery_minutes" integer,
        "delivery_fee" integer,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_restaurants_name_not_blank" CHECK (length(btrim("name")) > 0),
        CONSTRAINT "CHK_restaurants_rating_range" CHECK ("average_rating" >= 0 AND "average_rating" <= 5),
        CONSTRAINT "CHK_restaurants_delivery_fields" CHECK (("delivery_available" = false) OR ("estimated_delivery_minutes" IS NOT NULL AND "delivery_fee" IS NOT NULL)),
        CONSTRAINT "PK_restaurants_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "meals" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "restaurant_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "price" integer NOT NULL,
        "dietary_tags" "public"."dietary_tag"[] NOT NULL DEFAULT '{}',
        "available" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_meals_name_not_blank" CHECK (length(btrim("name")) > 0),
        CONSTRAINT "CHK_meals_price_non_negative" CHECK ("price" >= 0),
        CONSTRAINT "PK_meals_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_meals_restaurant_id" ON "meals" ("restaurant_id")`,
    );
    await queryRunner.query(`
      ALTER TABLE "meals"
        ADD CONSTRAINT "FK_meals_restaurant_id"
        FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "meals" DROP CONSTRAINT "FK_meals_restaurant_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_meals_restaurant_id"`);
    await queryRunner.query(`DROP TABLE "meals"`);
    await queryRunner.query(`DROP TABLE "restaurants"`);
    await queryRunner.query(`DROP TYPE "public"."dietary_tag"`);
  }
}
