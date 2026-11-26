import { MigrationInterface, QueryRunner } from 'typeorm';

/** Permissions every full-access role had before `orders.reopen` existed. */
const FULL_ACCESS_BEFORE = [
  'dashboard.view',
  'pos.access',
  'orders.create',
  'orders.serve',
  'orders.manage_all',
  'orders.cancel_items',
  'orders.cancel',
  'orders.transfer',
  'orders.discount',
  'orders.pay',
  'shifts.view',
  'shifts.manage',
  'menu.view',
  'menu.manage',
  'stock.view',
  'stock.manage',
  'reports.view',
  'team.view',
  'team.manage',
  'halls.manage',
  'settings.manage',
];

/**
 * - Daily order numbers (#1, #2 … restarting every business day) with an
 *   atomic per-day counter; existing orders are numbered by opening time.
 * - Returning a paid order to work: audit columns on orders and storno
 *   (reversal) payment rows with a negative amount.
 */
export class OrderNumbersAndReversals1794414870571 implements MigrationInterface {
  name = 'OrderNumbersAndReversals1794414870571';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const timeZone = process.env.APP_TIMEZONE || 'Asia/Tashkent';

    await queryRunner.query(
      `CREATE TABLE "order_counters" ("day" date NOT NULL, "last_number" integer NOT NULL, CONSTRAINT "PK_c626c2e32e2c4a226a66bd4224f" PRIMARY KEY ("day"))`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "business_date" date`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "number" integer`);
    await queryRunner.query(
      `UPDATE "orders" SET "business_date" = ("created_at" AT TIME ZONE $1)::date`,
      [timeZone],
    );
    await queryRunner.query(
      `UPDATE "orders" o SET "number" = n.rn
         FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "business_date" ORDER BY "created_at", "id") AS rn
                 FROM "orders") n
        WHERE n."id" = o."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "business_date" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "number" SET NOT NULL`,
    );
    await queryRunner.query(
      `INSERT INTO "order_counters" ("day", "last_number")
       SELECT "business_date", MAX("number") FROM "orders" GROUP BY "business_date"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_orders_day_number" ON "orders" ("business_date", "number") `,
    );

    await queryRunner.query(
      `ALTER TABLE "orders" ADD "reopened_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "reopened_by_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "reopen_reason" character varying(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "reopen_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_6d07da6a93f8fed39301173cfdc" FOREIGN KEY ("reopened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "payments" ADD "is_reversal" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "chk_payments_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount" CHECK (("is_reversal" AND "amount" < 0) OR (NOT "is_reversal" AND "amount" > 0))`,
    );

    // Full-access roles stay full-access; everyone else gets it explicitly.
    await queryRunner.query(
      `UPDATE "roles" SET "permissions" = array_append("permissions", 'orders.reopen')
        WHERE NOT ('orders.reopen' = ANY("permissions"))
          AND "permissions" @> $1::text[]`,
      [FULL_ACCESS_BEFORE],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "roles" SET "permissions" = array_remove("permissions", 'orders.reopen')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "chk_payments_amount"`,
    );
    await queryRunner.query(`DELETE FROM "payments" WHERE "is_reversal"`);
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount" CHECK ("amount" > 0)`,
    );
    await queryRunner.query(`ALTER TABLE "payments" DROP COLUMN "is_reversal"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_6d07da6a93f8fed39301173cfdc"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "reopen_count"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "reopen_reason"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "reopened_by_id"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "reopened_at"`);
    await queryRunner.query(`DROP INDEX "public"."uq_orders_day_number"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "number"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "business_date"`);
    await queryRunner.query(`DROP TABLE "order_counters"`);
  }
}
