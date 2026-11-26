import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Команда and Столы и залы as in the reference: a login log, roles that can be
 * archived and show their author, tables that remember who added them, and a
 * service charge per hall.
 */
export class TeamAndHallSettings1794492380381 implements MigrationInterface {
  name = 'TeamAndHallSettings1794492380381';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."login_event_type" AS ENUM('IN', 'OUT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "login_events" ("id" SERIAL NOT NULL, "user_id" integer NOT NULL, "type" "public"."login_event_type" NOT NULL, "ip" character varying(64), "user_agent" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_5cd6102474db62bc181590b9902" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_login_events_user" ON "login_events" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_login_events_created" ON "login_events" ("created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD "is_active" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`ALTER TABLE "roles" ADD "created_by_id" integer`);
    await queryRunner.query(
      `ALTER TABLE "halls" ADD "service_percent" numeric(5,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "dining_tables" ADD "created_by_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "FK_4a4bff0f02e88cbdf770241ca8f" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dining_tables" ADD CONSTRAINT "FK_9da1e2115de43865e5d64e8115a" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "login_events" ADD CONSTRAINT "FK_2b138d5dad9a7f8d09a35e24d47" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "login_events" DROP CONSTRAINT "FK_2b138d5dad9a7f8d09a35e24d47"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dining_tables" DROP CONSTRAINT "FK_9da1e2115de43865e5d64e8115a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "FK_4a4bff0f02e88cbdf770241ca8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dining_tables" DROP COLUMN "created_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "halls" DROP COLUMN "service_percent"`,
    );
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "created_by_id"`);
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "is_active"`);
    await queryRunner.query(`DROP INDEX "public"."ix_login_events_created"`);
    await queryRunner.query(`DROP INDEX "public"."ix_login_events_user"`);
    await queryRunner.query(`DROP TABLE "login_events"`);
    await queryRunner.query(`DROP TYPE "public"."login_event_type"`);
  }
}
