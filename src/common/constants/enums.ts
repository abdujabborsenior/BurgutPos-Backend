export enum PaymentMethodType {
  Cash = 'CASH',
  Card = 'CARD',
  Online = 'ONLINE',
  Other = 'OTHER',
}

export enum OrderType {
  Table = 'TABLE',
  Takeaway = 'TAKEAWAY',
  Delivery = 'DELIVERY',
  Hall = 'HALL',
}

export enum OrderStatus {
  Open = 'OPEN',
  Paid = 'PAID',
  Cancelled = 'CANCELLED',
  /** Lines were moved into another order (tables joined). Not revenue, not a cancellation. */
  Merged = 'MERGED',
}

export enum OrderItemStatus {
  Active = 'ACTIVE',
  Cancelled = 'CANCELLED',
}

export enum DiscountType {
  Percent = 'PERCENT',
  Amount = 'AMOUNT',
}

/** Sales unit of a dish. Fractional quantities are allowed only for KG and L. */
export enum DishUnit {
  Piece = 'PCS',
  Portion = 'PORTION',
  Kilogram = 'KG',
  Liter = 'L',
}

export const FRACTIONAL_DISH_UNITS: readonly DishUnit[] = [
  DishUnit.Kilogram,
  DishUnit.Liter,
];

export enum IngredientUnit {
  Kilogram = 'KG',
  Gram = 'G',
  Liter = 'L',
  Milliliter = 'ML',
  Piece = 'PCS',
}

export enum StockItemType {
  Dish = 'DISH',
  Ingredient = 'INGREDIENT',
}

/** Where a dish's stock lives: on sale (bar/fridge/kitchen) or in the warehouse. */
export enum StockLocation {
  Sale = 'SALE',
  Warehouse = 'WAREHOUSE',
}

export enum StockMovementType {
  Receipt = 'RECEIPT',
  ReceiptCancel = 'RECEIPT_CANCEL',
  Sale = 'SALE',
  SaleReturn = 'SALE_RETURN',
  Transfer = 'TRANSFER',
  WriteOff = 'WRITE_OFF',
  Adjustment = 'ADJUSTMENT',
}

export enum ShiftStatus {
  Open = 'OPEN',
  Closed = 'CLOSED',
}

/** How a printer is reached from the venue's print server. */
export enum PrinterConnection {
  /** Network printer: has an address and a port. */
  Lan = 'LAN',
  /** Plugged into the terminal. */
  Usb = 'USB',
}

/** What the login log records: a sign-in or a sign-out. */
export enum LoginEventType {
  In = 'IN',
  Out = 'OUT',
}

/** What was printed for an order: the bill before payment or the receipt after it. */
export enum OrderPrintKind {
  Precheck = 'PRECHECK',
  Receipt = 'RECEIPT',
}

export enum CashOperationType {
  In = 'IN',
  Out = 'OUT',
}
