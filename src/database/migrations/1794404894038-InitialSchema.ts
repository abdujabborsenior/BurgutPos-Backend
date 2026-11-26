import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1794404894038 implements MigrationInterface {
  name = 'InitialSchema1794404894038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" SERIAL NOT NULL, "name" character varying(64) NOT NULL, "description" character varying(255), "permissions" text array NOT NULL DEFAULT '{}', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_roles_name" ON "roles" ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" SERIAL NOT NULL, "full_name" character varying(120) NOT NULL, "login" character varying(64) NOT NULL, "password_hash" character varying(100) NOT NULL, "phone" character varying(32), "role_id" integer, "is_superadmin" boolean NOT NULL DEFAULT false, "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_users_role" ON "users" ("role_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_login_lower" ON "users" (lower("login"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ingredient_unit" AS ENUM('KG', 'G', 'L', 'ML', 'PCS')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ingredients" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "unit" "public"."ingredient_unit" NOT NULL, "quantity" numeric(14,3) NOT NULL DEFAULT '0', "min_quantity" numeric(14,3) NOT NULL DEFAULT '0', "cost_price" numeric(14,2) NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9240185c8a5507251c9f15e0649" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "printers" ("id" SERIAL NOT NULL, "name" character varying(60) NOT NULL, "description" character varying(255), "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_036bb976f205339f632e2eb0642" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dish_categories" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f36318db9c4d5e3d50303b5900d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dish_ingredients" ("id" SERIAL NOT NULL, "dish_id" integer NOT NULL, "ingredient_id" integer NOT NULL, "quantity" numeric(14,4) NOT NULL, CONSTRAINT "PK_0c1cc40f8fc05334e8cb958b60d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_dish_ingredients_ingredient" ON "dish_ingredients" ("ingredient_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_dish_ingredients_pair" ON "dish_ingredients" ("dish_id", "ingredient_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dish_unit" AS ENUM('PCS', 'PORTION', 'KG', 'L')`,
    );
    await queryRunner.query(
      `CREATE TABLE "dishes" ("id" SERIAL NOT NULL, "name" character varying(150) NOT NULL, "category_id" integer NOT NULL, "printer_id" integer, "price" numeric(14,2) NOT NULL DEFAULT '0', "cost_price" numeric(14,2) NOT NULL DEFAULT '0', "unit" "public"."dish_unit" NOT NULL DEFAULT 'PCS', "sort_order" integer NOT NULL DEFAULT '0', "is_available" boolean NOT NULL DEFAULT true, "track_stock" boolean NOT NULL DEFAULT false, "sale_qty" numeric(14,3) NOT NULL DEFAULT '0', "warehouse_qty" numeric(14,3) NOT NULL DEFAULT '0', "image_url" character varying(255), "is_active" boolean NOT NULL DEFAULT true, "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f4748c8e8382ad34ef517520b7b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_dishes_category" ON "dishes" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."stock_item_type" AS ENUM('DISH', 'INGREDIENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."stock_location" AS ENUM('SALE', 'WAREHOUSE')`,
    );
    await queryRunner.query(`CREATE TABLE "stock_receipts" ("id" SERIAL NOT NULL, "item_type" "public"."stock_item_type" NOT NULL, "dish_id" integer, "ingredient_id" integer, "location" "public"."stock_location", "quantity" numeric(14,3) NOT NULL DEFAULT '0', "purchase_price" numeric(14,2) NOT NULL DEFAULT '0', "sale_price" numeric(14,2), "total" numeric(14,2) NOT NULL DEFAULT '0', "comment" character varying(500), "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "is_archived" boolean NOT NULL DEFAULT false, "archived_at" TIMESTAMP WITH TIME ZONE, "archived_by_id" integer, "archive_reason" character varying(500), CONSTRAINT "chk_stock_receipts_quantity" CHECK ("quantity" > 0), CONSTRAINT "chk_stock_receipts_item" CHECK (("item_type" = 'DISH' AND "dish_id" IS NOT NULL AND "ingredient_id" IS NULL AND "location" IS NOT NULL)
   OR ("item_type" = 'INGREDIENT' AND "ingredient_id" IS NOT NULL AND "dish_id" IS NULL AND "location" IS NULL)), CONSTRAINT "PK_6f49d1b67edbd0e5bb63b215748" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE INDEX "ix_stock_receipts_dish" ON "stock_receipts" ("dish_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_stock_receipts_ingredient" ON "stock_receipts" ("ingredient_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_stock_receipts_created" ON "stock_receipts" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."stock_movement_type" AS ENUM('RECEIPT', 'RECEIPT_CANCEL', 'SALE', 'SALE_RETURN', 'TRANSFER', 'WRITE_OFF', 'ADJUSTMENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "stock_movements" ("id" BIGSERIAL NOT NULL, "item_type" "public"."stock_item_type" NOT NULL, "dish_id" integer, "ingredient_id" integer, "type" "public"."stock_movement_type" NOT NULL, "location" "public"."stock_location", "quantity" numeric(14,3) NOT NULL, "balance_after" numeric(14,3) NOT NULL, "order_id" integer, "receipt_id" integer, "comment" character varying(500), "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_57a26b190618550d8e65fb860e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_stock_movements_order" ON "stock_movements" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_stock_movements_ingredient" ON "stock_movements" ("ingredient_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_stock_movements_dish" ON "stock_movements" ("dish_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_stock_movements_created" ON "stock_movements" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shift_status" AS ENUM('OPEN', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shifts" ("id" SERIAL NOT NULL, "status" "public"."shift_status" NOT NULL DEFAULT 'OPEN', "opened_by_id" integer NOT NULL, "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "opening_cash" numeric(14,2) NOT NULL DEFAULT '0', "closed_by_id" integer, "closed_at" TIMESTAMP WITH TIME ZONE, "closing_cash" numeric(14,2), "expected_cash" numeric(14,2), "revenue" numeric(14,2), "open_comment" character varying(500), "close_comment" character varying(500), CONSTRAINT "PK_84d692e367e4d6cdf045828768c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_shifts_opened_at" ON "shifts" ("opened_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_shifts_single_open" ON "shifts" ("status") WHERE "status" = 'OPEN'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cash_operation_type" AS ENUM('IN', 'OUT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cash_operations" ("id" SERIAL NOT NULL, "shift_id" integer NOT NULL, "type" "public"."cash_operation_type" NOT NULL, "amount" numeric(14,2) NOT NULL DEFAULT '0', "comment" character varying(500) NOT NULL, "created_by_id" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_cash_operations_amount" CHECK ("amount" > 0), CONSTRAINT "PK_f318e464f8aac70cb64d8214b98" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_cash_operations_shift" ON "cash_operations" ("shift_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_type" AS ENUM('TABLE', 'TAKEAWAY', 'DELIVERY', 'HALL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("id" integer NOT NULL DEFAULT '1', "restaurant_name" character varying(120) NOT NULL DEFAULT 'BurgutPOS', "address" character varying(255), "phone" character varying(32), "receipt_header" text, "receipt_footer" text, "service_charge_percent" numeric(5,2) NOT NULL DEFAULT '0', "service_charge_order_types" "public"."order_type" array NOT NULL DEFAULT '{TABLE}', "waiter_commission_percent" numeric(5,2) NOT NULL DEFAULT '0', "allow_negative_stock" boolean NOT NULL DEFAULT false, "auto_print_kitchen_ticket" boolean NOT NULL DEFAULT false, "auto_print_receipt" boolean NOT NULL DEFAULT false, "updated_by_id" integer, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4800b266ba790931744b3e53a74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method_type" AS ENUM('CASH', 'CARD', 'ONLINE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_methods" ("id" SERIAL NOT NULL, "name" character varying(60) NOT NULL, "type" "public"."payment_method_type" NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_34f9b8c6dfb4ac3559f7e2820d1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "halls" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_by_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4665c2f3b1e718e12b06278bae8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "dining_tables" ("id" SERIAL NOT NULL, "hall_id" integer NOT NULL, "name" character varying(60) NOT NULL, "seats" integer, "sort_order" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_30bc22c71f39a9d32b7f7617757" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_dining_tables_hall" ON "dining_tables" ("hall_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_dining_tables_hall_name" ON "dining_tables" ("hall_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_item_status" AS ENUM('ACTIVE', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" SERIAL NOT NULL, "order_id" integer NOT NULL, "dish_id" integer NOT NULL, "name" character varying(150) NOT NULL, "category_id" integer, "category_name" character varying(100), "printer_id" integer, "printer_name" character varying(60), "unit" "public"."dish_unit" NOT NULL, "price" numeric(14,2) NOT NULL DEFAULT '0', "cost_price" numeric(14,2) NOT NULL DEFAULT '0', "quantity" numeric(14,3) NOT NULL DEFAULT '0', "total" numeric(14,2) NOT NULL DEFAULT '0', "comment" character varying(255), "status" "public"."order_item_status" NOT NULL DEFAULT 'ACTIVE', "created_by_id" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cancelled_by_id" integer, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancel_reason" character varying(500), "stock_returned" boolean, CONSTRAINT "chk_order_items_quantity" CHECK ("quantity" > 0), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_order_items_order" ON "order_items" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_order_items_dish" ON "order_items" ("dish_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_order_items_status_cancelled" ON "order_items" ("status", "cancelled_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status" AS ENUM('OPEN', 'PAID', 'CANCELLED', 'MERGED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."discount_type" AS ENUM('PERCENT', 'AMOUNT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" SERIAL NOT NULL, "type" "public"."order_type" NOT NULL, "status" "public"."order_status" NOT NULL DEFAULT 'OPEN', "table_id" integer, "waiter_id" integer, "created_by_id" integer NOT NULL, "shift_id" integer NOT NULL, "guests" integer, "customer_name" character varying(120), "customer_phone" character varying(32), "delivery_address" character varying(500), "comment" character varying(500), "subtotal" numeric(14,2) NOT NULL DEFAULT '0', "discount_type" "public"."discount_type", "discount_value" numeric(14,2) NOT NULL DEFAULT '0', "discount_amount" numeric(14,2) NOT NULL DEFAULT '0', "service_percent" numeric(5,2) NOT NULL DEFAULT '0', "service_amount" numeric(14,2) NOT NULL DEFAULT '0', "delivery_fee" numeric(14,2) NOT NULL DEFAULT '0', "total" numeric(14,2) NOT NULL DEFAULT '0', "paid_amount" numeric(14,2) NOT NULL DEFAULT '0', "received_amount" numeric(14,2) NOT NULL DEFAULT '0', "change_amount" numeric(14,2) NOT NULL DEFAULT '0', "waiter_percent" numeric(5,2) NOT NULL DEFAULT '0', "precheck_at" TIMESTAMP WITH TIME ZONE, "precheck_count" integer NOT NULL DEFAULT '0', "closed_by_id" integer, "closed_at" TIMESTAMP WITH TIME ZONE, "cancelled_by_id" integer, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancel_reason" character varying(500), "merged_into_id" integer, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_orders_table_type" CHECK (("type" = 'TABLE' AND "table_id" IS NOT NULL) OR ("type" <> 'TABLE' AND "table_id" IS NULL)), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_orders_waiter" ON "orders" ("waiter_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_orders_shift" ON "orders" ("shift_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_orders_created_at" ON "orders" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_orders_closed_at" ON "orders" ("closed_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_orders_status_type" ON "orders" ("status", "type") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_orders_open_table" ON "orders" ("table_id") WHERE "status" = 'OPEN' AND "table_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" SERIAL NOT NULL, "order_id" integer NOT NULL, "method_id" integer NOT NULL, "amount" numeric(14,2) NOT NULL DEFAULT '0', "shift_id" integer NOT NULL, "cashier_id" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "chk_payments_amount" CHECK ("amount" > 0), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payments_order" ON "payments" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payments_method" ON "payments" ("method_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payments_shift" ON "payments" ("shift_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payments_cashier" ON "payments" ("cashier_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_payments_created" ON "payments" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" integer NOT NULL, "token_hash" character varying(64) NOT NULL, "user_agent" character varying(255), "ip" character varying(64), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_sessions_user" ON "sessions" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_sessions_expires" ON "sessions" ("expires_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingredients" ADD CONSTRAINT "FK_a93afbe3cfa435ffc67e21ea609" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dish_categories" ADD CONSTRAINT "FK_097db38ddcdeb0366488fd8a677" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dish_ingredients" ADD CONSTRAINT "FK_39f8e6cc96a9d1cf6fc18d25b0e" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dish_ingredients" ADD CONSTRAINT "FK_67a8cf026a0b034af2709ce4215" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dishes" ADD CONSTRAINT "FK_078dfd20b43f0efe2b4e5fc520c" FOREIGN KEY ("category_id") REFERENCES "dish_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dishes" ADD CONSTRAINT "FK_ec6eed8347d90fc778e7c04ff75" FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dishes" ADD CONSTRAINT "FK_3245d62453a49d1390812e66b2f" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD CONSTRAINT "FK_52983c87de43f50861a76dd9385" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD CONSTRAINT "FK_99ce90f600f1437e345f2984811" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD CONSTRAINT "FK_4f160e2fbb4f529a3beda64f1a1" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" ADD CONSTRAINT "FK_800a7e84802911fb94143bcf435" FOREIGN KEY ("archived_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_4492ece5da7d07b09e0e9e7daa8" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_990da5f8a5976f2d02cf60fbdcb" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" ADD CONSTRAINT "FK_2dc9961e9ad4be45620ecf18c39" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" ADD CONSTRAINT "FK_fb8e3b93622469c211edbfce4b7" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" ADD CONSTRAINT "FK_921478e8b13671bc7da66a64fa4" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_operations" ADD CONSTRAINT "FK_8afe64d6a3e9c904878dde3c7c4" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_operations" ADD CONSTRAINT "FK_dbd4f21a939eb84d9f630c4e426" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "halls" ADD CONSTRAINT "FK_00a0758f6ef275014ca8cf58129" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dining_tables" ADD CONSTRAINT "FK_0c8d7961dd10633fe530c03c0ea" FOREIGN KEY ("hall_id") REFERENCES "halls"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_ee9bb257017dd6202e7c95ef5fe" FOREIGN KEY ("dish_id") REFERENCES "dishes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_6422629a97924b881214a6f42ab" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9654145667a113eb6088ff694a0" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_3d36410e89a795172fa6e0dd968" FOREIGN KEY ("table_id") REFERENCES "dining_tables"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_1aeeb86b9610f47f8a28e2be1db" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_f93cc7892226abb9c88e7131381" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a47d559598368bc78800dd5175b" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_273b0113c474cf70acb94640e60" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_2cc05592859eba0cf60c44b80d3" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_9200663684b981a7bd078895a0c" FOREIGN KEY ("method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_b9629005079d9c0ca515deb7956" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_1e37fcba92c50fe4977c5371ce5" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_085d540d9f418cfbdc7bd55bb19"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_1e37fcba92c50fe4977c5371ce5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_b9629005079d9c0ca515deb7956"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_9200663684b981a7bd078895a0c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_b2f7b823a21562eeca20e72b006"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_2cc05592859eba0cf60c44b80d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_273b0113c474cf70acb94640e60"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a47d559598368bc78800dd5175b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_f93cc7892226abb9c88e7131381"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_1aeeb86b9610f47f8a28e2be1db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_3d36410e89a795172fa6e0dd968"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9654145667a113eb6088ff694a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_6422629a97924b881214a6f42ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_ee9bb257017dd6202e7c95ef5fe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dining_tables" DROP CONSTRAINT "FK_0c8d7961dd10633fe530c03c0ea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "halls" DROP CONSTRAINT "FK_00a0758f6ef275014ca8cf58129"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_operations" DROP CONSTRAINT "FK_dbd4f21a939eb84d9f630c4e426"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_operations" DROP CONSTRAINT "FK_8afe64d6a3e9c904878dde3c7c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" DROP CONSTRAINT "FK_921478e8b13671bc7da66a64fa4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shifts" DROP CONSTRAINT "FK_fb8e3b93622469c211edbfce4b7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_2dc9961e9ad4be45620ecf18c39"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_990da5f8a5976f2d02cf60fbdcb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_movements" DROP CONSTRAINT "FK_4492ece5da7d07b09e0e9e7daa8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" DROP CONSTRAINT "FK_800a7e84802911fb94143bcf435"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" DROP CONSTRAINT "FK_4f160e2fbb4f529a3beda64f1a1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" DROP CONSTRAINT "FK_99ce90f600f1437e345f2984811"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_receipts" DROP CONSTRAINT "FK_52983c87de43f50861a76dd9385"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dishes" DROP CONSTRAINT "FK_3245d62453a49d1390812e66b2f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dishes" DROP CONSTRAINT "FK_ec6eed8347d90fc778e7c04ff75"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dishes" DROP CONSTRAINT "FK_078dfd20b43f0efe2b4e5fc520c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dish_ingredients" DROP CONSTRAINT "FK_67a8cf026a0b034af2709ce4215"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dish_ingredients" DROP CONSTRAINT "FK_39f8e6cc96a9d1cf6fc18d25b0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dish_categories" DROP CONSTRAINT "FK_097db38ddcdeb0366488fd8a677"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingredients" DROP CONSTRAINT "FK_a93afbe3cfa435ffc67e21ea609"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_sessions_expires"`);
    await queryRunner.query(`DROP INDEX "public"."ix_sessions_user"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(`DROP INDEX "public"."ix_payments_created"`);
    await queryRunner.query(`DROP INDEX "public"."ix_payments_cashier"`);
    await queryRunner.query(`DROP INDEX "public"."ix_payments_shift"`);
    await queryRunner.query(`DROP INDEX "public"."ix_payments_method"`);
    await queryRunner.query(`DROP INDEX "public"."ix_payments_order"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP INDEX "public"."uq_orders_open_table"`);
    await queryRunner.query(`DROP INDEX "public"."ix_orders_status_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_orders_closed_at"`);
    await queryRunner.query(`DROP INDEX "public"."ix_orders_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."ix_orders_shift"`);
    await queryRunner.query(`DROP INDEX "public"."ix_orders_waiter"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."discount_type"`);
    await queryRunner.query(`DROP TYPE "public"."order_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_order_items_status_cancelled"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_order_items_dish"`);
    await queryRunner.query(`DROP INDEX "public"."ix_order_items_order"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TYPE "public"."order_item_status"`);
    await queryRunner.query(`DROP INDEX "public"."uq_dining_tables_hall_name"`);
    await queryRunner.query(`DROP INDEX "public"."ix_dining_tables_hall"`);
    await queryRunner.query(`DROP TABLE "dining_tables"`);
    await queryRunner.query(`DROP TABLE "halls"`);
    await queryRunner.query(`DROP TABLE "payment_methods"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method_type"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP TYPE "public"."order_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_cash_operations_shift"`);
    await queryRunner.query(`DROP TABLE "cash_operations"`);
    await queryRunner.query(`DROP TYPE "public"."cash_operation_type"`);
    await queryRunner.query(`DROP INDEX "public"."uq_shifts_single_open"`);
    await queryRunner.query(`DROP INDEX "public"."ix_shifts_opened_at"`);
    await queryRunner.query(`DROP TABLE "shifts"`);
    await queryRunner.query(`DROP TYPE "public"."shift_status"`);
    await queryRunner.query(`DROP INDEX "public"."ix_stock_movements_created"`);
    await queryRunner.query(`DROP INDEX "public"."ix_stock_movements_dish"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_stock_movements_ingredient"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_stock_movements_order"`);
    await queryRunner.query(`DROP TABLE "stock_movements"`);
    await queryRunner.query(`DROP TYPE "public"."stock_movement_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_stock_receipts_created"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_stock_receipts_ingredient"`,
    );
    await queryRunner.query(`DROP INDEX "public"."ix_stock_receipts_dish"`);
    await queryRunner.query(`DROP TABLE "stock_receipts"`);
    await queryRunner.query(`DROP TYPE "public"."stock_location"`);
    await queryRunner.query(`DROP TYPE "public"."stock_item_type"`);
    await queryRunner.query(`DROP INDEX "public"."ix_dishes_category"`);
    await queryRunner.query(`DROP TABLE "dishes"`);
    await queryRunner.query(`DROP TYPE "public"."dish_unit"`);
    await queryRunner.query(`DROP INDEX "public"."uq_dish_ingredients_pair"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_dish_ingredients_ingredient"`,
    );
    await queryRunner.query(`DROP TABLE "dish_ingredients"`);
    await queryRunner.query(`DROP TABLE "dish_categories"`);
    await queryRunner.query(`DROP TABLE "printers"`);
    await queryRunner.query(`DROP TABLE "ingredients"`);
    await queryRunner.query(`DROP TYPE "public"."ingredient_unit"`);
    await queryRunner.query(`DROP INDEX "public"."ix_users_role"`);
    await queryRunner.query(`DROP INDEX "public"."uq_users_login_lower"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP INDEX "public"."uq_roles_name"`);
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}
