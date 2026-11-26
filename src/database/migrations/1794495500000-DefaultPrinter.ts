import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every venue needs one default station: tickets for dishes without their own
 * printer go there. Picks the first active printer, and only when no default
 * has been chosen yet — safe to run on a fresh and on a working database.
 */
export class DefaultPrinter1794495500000 implements MigrationInterface {
  name = 'DefaultPrinter1794495500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "printers" SET "is_default" = true
        WHERE NOT EXISTS (SELECT 1 FROM "printers" WHERE "is_default")
          AND "id" = (SELECT "id" FROM "printers" WHERE "is_active"
                       ORDER BY "sort_order", "id" LIMIT 1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "printers" SET "is_default" = false`);
  }
}
