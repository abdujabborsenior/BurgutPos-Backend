export const Permission = {
  DashboardView: 'dashboard.view',
  PosAccess: 'pos.access',
  OrdersCreate: 'orders.create',
  OrdersServe: 'orders.serve',
  OrdersManageAll: 'orders.manage_all',
  OrdersCancelItems: 'orders.cancel_items',
  OrdersCancel: 'orders.cancel',
  OrdersTransfer: 'orders.transfer',
  OrdersDiscount: 'orders.discount',
  OrdersPay: 'orders.pay',
  OrdersReopen: 'orders.reopen',
  ShiftsView: 'shifts.view',
  ShiftsManage: 'shifts.manage',
  MenuView: 'menu.view',
  MenuManage: 'menu.manage',
  StockView: 'stock.view',
  StockManage: 'stock.manage',
  ReportsView: 'reports.view',
  TeamView: 'team.view',
  TeamManage: 'team.manage',
  HallsManage: 'halls.manage',
  SettingsManage: 'settings.manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: Permission[] = Object.values(Permission);

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: Permission; label: string; description: string }[];
}

/** Catalog rendered by the role editor. Order matters — it is the UI order. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'pos',
    label: 'Касса и заказы',
    permissions: [
      {
        key: Permission.PosAccess,
        label: 'Доступ к столам и заказам',
        description: 'Просмотр столов, заказов на вынос, доставки и зала',
      },
      {
        key: Permission.OrdersCreate,
        label: 'Создание заказов',
        description: 'Открытие заказов и добавление блюд',
      },
      {
        key: Permission.OrdersServe,
        label: 'Официант',
        description:
          'Может быть назначен официантом заказа и получает процент обслуживания',
      },
      {
        key: Permission.OrdersManageAll,
        label: 'Заказы других сотрудников',
        description: 'Изменение заказов, которые обслуживают другие официанты',
      },
      {
        key: Permission.OrdersCancelItems,
        label: 'Отмена блюд',
        description:
          'Отмена уже отправленных позиций заказа с указанием причины',
      },
      {
        key: Permission.OrdersCancel,
        label: 'Отмена заказов',
        description: 'Полная отмена открытого заказа с указанием причины',
      },
      {
        key: Permission.OrdersTransfer,
        label: 'Перенос заказов',
        description: 'Перенос заказа на другой стол и смена официанта',
      },
      {
        key: Permission.OrdersDiscount,
        label: 'Скидки',
        description: 'Назначение скидки на заказ',
      },
      {
        key: Permission.OrdersPay,
        label: 'Приём оплаты',
        description: 'Закрытие заказов и приём оплаты',
      },
      {
        key: Permission.OrdersReopen,
        label: 'Возврат оплаченных заказов',
        description:
          'Отмена оплаты: заказ снова становится открытым, оплата сторнируется в текущей смене',
      },
    ],
  },
  {
    key: 'shifts',
    label: 'Смены',
    permissions: [
      {
        key: Permission.ShiftsView,
        label: 'Просмотр смен',
        description: 'Текущая смена и история смен',
      },
      {
        key: Permission.ShiftsManage,
        label: 'Управление сменой',
        description: 'Открытие и закрытие смены, внесение и изъятие наличных',
      },
    ],
  },
  {
    key: 'menu',
    label: 'Меню',
    permissions: [
      {
        key: Permission.MenuView,
        label: 'Просмотр меню',
        description: 'Блюда и категории',
      },
      {
        key: Permission.MenuManage,
        label: 'Управление меню',
        description: 'Создание и изменение блюд, категорий и техкарт',
      },
    ],
  },
  {
    key: 'stock',
    label: 'Склад',
    permissions: [
      {
        key: Permission.StockView,
        label: 'Просмотр склада',
        description: 'Остатки, приходы, ингредиенты и история движений',
      },
      {
        key: Permission.StockManage,
        label: 'Управление складом',
        description: 'Приход, перемещение, списание и инвентаризация',
      },
    ],
  },
  {
    key: 'analytics',
    label: 'Аналитика',
    permissions: [
      {
        key: Permission.DashboardView,
        label: 'Дашборд',
        description: 'Ключевые показатели за день',
      },
      {
        key: Permission.ReportsView,
        label: 'Отчёты',
        description: 'Все отчёты по продажам, сотрудникам и сменам',
      },
    ],
  },
  {
    key: 'administration',
    label: 'Администрирование',
    permissions: [
      {
        key: Permission.TeamView,
        label: 'Просмотр команды',
        description: 'Сотрудники и роли',
      },
      {
        key: Permission.TeamManage,
        label: 'Управление командой',
        description: 'Создание сотрудников, ролей и прав доступа',
      },
      {
        key: Permission.HallsManage,
        label: 'Столы и залы',
        description: 'Настройка залов и столов',
      },
      {
        key: Permission.SettingsManage,
        label: 'Настройки',
        description: 'Общие настройки, способы оплаты и принтеры',
      },
    ],
  },
];

const ORDER_PERMISSIONS: Permission[] = [
  Permission.OrdersCreate,
  Permission.OrdersServe,
  Permission.OrdersManageAll,
  Permission.OrdersCancelItems,
  Permission.OrdersCancel,
  Permission.OrdersTransfer,
  Permission.OrdersDiscount,
  Permission.OrdersPay,
  Permission.OrdersReopen,
];

const IMPLIED: [Permission, Permission][] = [
  [Permission.MenuManage, Permission.MenuView],
  [Permission.StockManage, Permission.StockView],
  [Permission.ShiftsManage, Permission.ShiftsView],
  [Permission.TeamManage, Permission.TeamView],
  ...ORDER_PERMISSIONS.map(
    (permission) =>
      [permission, Permission.PosAccess] as [Permission, Permission],
  ),
];

/**
 * Drops unknown keys and adds implied permissions (e.g. "manage" implies
 * "view", any order action implies POS access), so a role can never end up
 * in a half-configured state.
 */
export function normalizePermissions(input: readonly string[]): Permission[] {
  const known = new Set<string>(ALL_PERMISSIONS);
  const result = new Set<Permission>(
    input.filter((key): key is Permission => known.has(key)),
  );
  for (const [permission, implied] of IMPLIED) {
    if (result.has(permission)) result.add(implied);
  }
  return ALL_PERMISSIONS.filter((permission) => result.has(permission));
}

export const DEFAULT_ROLES: {
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    name: 'Администратор',
    description: 'Полный доступ ко всем разделам системы',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Кассир',
    description: 'Касса, заказы, смены, меню и склад',
    permissions: normalizePermissions([
      Permission.DashboardView,
      // Reversing a payment moves money: granted to cashiers explicitly.
      ...ORDER_PERMISSIONS.filter(
        (permission) => permission !== Permission.OrdersReopen,
      ),
      Permission.ShiftsManage,
      Permission.MenuManage,
      Permission.StockManage,
    ]),
  },
  {
    name: 'Официант',
    description: 'Обслуживание столов и приём заказов',
    permissions: normalizePermissions([
      Permission.OrdersCreate,
      Permission.OrdersServe,
    ]),
  },
];
