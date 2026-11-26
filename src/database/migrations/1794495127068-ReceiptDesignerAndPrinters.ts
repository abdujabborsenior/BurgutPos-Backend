import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Настройки as in the reference: a receipt designer (which lines the guest
 * bill and the kitchen ticket show, and how) with a logo, and printers that
 * know how they are connected and which one is the default.
 */
export class ReceiptDesignerAndPrinters1794495127068 implements MigrationInterface {
  name = 'ReceiptDesignerAndPrinters1794495127068';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."printer_connection" AS ENUM('LAN', 'USB')`,
    );
    await queryRunner.query(
      `ALTER TABLE "printers" ADD "connection" "public"."printer_connection" NOT NULL DEFAULT 'LAN'`,
    );
    await queryRunner.query(
      `ALTER TABLE "printers" ADD "host" character varying(120)`,
    );
    await queryRunner.query(`ALTER TABLE "printers" ADD "port" integer`);
    await queryRunner.query(
      `ALTER TABLE "printers" ADD "is_default" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ADD "logo_url" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ADD "order_check" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" ADD "dish_check" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_printers_default" ON "printers" ("is_default") WHERE "is_default"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_printers_default"`);
    await queryRunner.query(
      `ALTER TABLE "app_settings" DROP COLUMN "dish_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" DROP COLUMN "order_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "app_settings" DROP COLUMN "logo_url"`,
    );
    await queryRunner.query(`ALTER TABLE "printers" DROP COLUMN "is_default"`);
    await queryRunner.query(`ALTER TABLE "printers" DROP COLUMN "port"`);
    await queryRunner.query(`ALTER TABLE "printers" DROP COLUMN "host"`);
    await queryRunner.query(`ALTER TABLE "printers" DROP COLUMN "connection"`);
    await queryRunner.query(`DROP TYPE "public"."printer_connection"`);
  }
}
