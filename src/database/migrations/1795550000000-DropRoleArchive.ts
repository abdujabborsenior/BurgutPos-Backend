import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roles are no longer archived: a role in use is kept, an unused one is
 * deleted. Every role becomes a plain role again — nothing is lost.
 */
export class DropRoleArchive1795550000000 implements MigrationInterface {
  name = 'DropRoleArchive1795550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "roles" DROP COLUMN "is_active"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles" ADD "is_active" boolean NOT NULL DEFAULT true`,
    );
  }
}
