import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRestaurantAnalyticsZone1791000000000 implements MigrationInterface {
  name = 'AddRestaurantAnalyticsZone1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "restaurants"
      ADD COLUMN "analytics_zone" character varying(64)
    `);
    await queryRunner.query(`
      UPDATE "restaurants"
      SET "analytics_zone" = 'bogota-centro'
      WHERE ("name", "address") IN (
        ('Green Bowl', 'Calle 18A #1-10, Bogotá'),
        ('The Garden', 'Carrera 1 #19-20, Bogotá'),
        ('Andean Flavor', 'Carrera 4 #18-50, Bogotá'),
        ('Sushi Rápido', 'Calle 19 #2-30, Bogotá'),
        ('Quinoa Corner', 'Calle 20 #3-15, Bogotá')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "restaurants" DROP COLUMN "analytics_zone"
    `);
  }
}
