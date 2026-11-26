/**
 * Human readable messages for named database constraints. The database is the
 * last line of defence against races (two cashiers opening the same table at
 * the same millisecond); these messages make that defence user friendly.
 */
export const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_users_login_lower: 'Этот логин уже занят',
  uq_roles_name: 'Роль с таким названием уже существует',
  uq_orders_open_table: 'Этот стол уже занят другим заказом',
  uq_shifts_single_open: 'Смена уже открыта',
  uq_dish_ingredients_pair: 'Ингредиент уже добавлен в техкарту',
  uq_dining_tables_hall_name: 'Стол с таким названием уже есть в этом зале',
  chk_dishes_stock_non_negative: 'Недостаточно остатка на складе',
};
