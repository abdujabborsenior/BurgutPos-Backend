import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderPrints1795072021635 implements MigrationInterface {
  name = 'OrderPrints1795072021635';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."order_print_kind" AS ENUM('PRECHECK', 'RECEIPT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_prints" ("id" SERIAL NOT NULL, "order_id" integer NOT NULL, "kind" "public"."order_print_kind" NOT NULL, "printer_id" integer, "printer_name" character varying(60), "printed_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c8228b3e0d94ad8e90c2b741b25" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_order_prints_order" ON "order_prints" ("order_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "order_prints" ADD CONSTRAINT "FK_f23c63dd261c8ec7e0a58beceab" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_prints" ADD CONSTRAINT "FK_c5a776564a1f7bf615dfd3780c2" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_prints" ADD CONSTRAINT "FK_bad375cb45796c39c32295fa8a1" FOREIGN KEY ("printed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_prints" DROP CONSTRAINT "FK_bad375cb45796c39c32295fa8a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_prints" DROP CONSTRAINT "FK_c5a776564a1f7bf615dfd3780c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_prints" DROP CONSTRAINT "FK_f23c63dd261c8ec7e0a58beceab"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_order_prints_order"`);
    await queryRunner.query(`DROP TABLE "order_prints"`);
    await queryRunner.query(`DROP TYPE "public"."order_print_kind"`);
  }
}
