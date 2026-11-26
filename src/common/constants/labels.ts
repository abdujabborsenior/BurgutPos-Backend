import {
  DishUnit,
  IngredientUnit,
  OrderStatus,
  OrderType,
  PaymentMethodType,
  StockLocation,
} from './enums';

export const DISH_UNIT_LABELS: Record<DishUnit, string> = {
  [DishUnit.Piece]: 'шт',
  [DishUnit.Portion]: 'порц.',
  [DishUnit.Kilogram]: 'кг',
  [DishUnit.Liter]: 'л',
};

export const INGREDIENT_UNIT_LABELS: Record<IngredientUnit, string> = {
  [IngredientUnit.Kilogram]: 'кг',
  [IngredientUnit.Gram]: 'г',
  [IngredientUnit.Liter]: 'л',
  [IngredientUnit.Milliliter]: 'мл',
  [IngredientUnit.Piece]: 'шт',
};

export const LOCATION_LABELS: Record<StockLocation, string> = {
  [StockLocation.Sale]: 'в продаже',
  [StockLocation.Warehouse]: 'на складе',
};

/** Quantity for human-readable messages: "1,5", "12", "0,125". */
export function formatQuantity(value: number): string {
  return Number(value.toFixed(3)).toString().replace('.', ',');
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  [OrderType.Table]: 'Стол',
  [OrderType.Takeaway]: 'С собой',
  [OrderType.Delivery]: 'Доставка',
  [OrderType.Hall]: 'Зал',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Open]: 'Открыт',
  [OrderStatus.Paid]: 'Оплачен',
  [OrderStatus.Cancelled]: 'Отменён',
  [OrderStatus.Merged]: 'Объединён',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentMethodType, string> = {
  [PaymentMethodType.Cash]: 'Наличные',
  [PaymentMethodType.Card]: 'Карта',
  [PaymentMethodType.Online]: 'Онлайн',
  [PaymentMethodType.Other]: 'Другое',
};
