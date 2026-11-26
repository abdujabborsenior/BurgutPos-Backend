import { DiscountType } from '../../common/constants/enums';
import { addMoney, money, percentOf, subMoney } from '../../common/utils/money';

export interface OrderTotalsInput {
  subtotal: number;
  discountType: DiscountType | null;
  discountValue: number;
  servicePercent: number;
  deliveryFee: number;
}

export interface OrderTotals {
  subtotal: number;
  discountAmount: number;
  serviceAmount: number;
  total: number;
}

/**
 * The single place where order money is computed.
 *   discount = % of subtotal, or a fixed amount capped by subtotal
 *   service  = % of (subtotal − discount)
 *   total    = subtotal − discount + service + delivery fee
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = money(input.subtotal);
  let discountAmount = 0;
  if (input.discountType === DiscountType.Percent) {
    discountAmount = percentOf(
      subtotal,
      Math.min(Math.max(input.discountValue, 0), 100),
    );
  } else if (input.discountType === DiscountType.Amount) {
    discountAmount = money(
      Math.min(Math.max(input.discountValue, 0), subtotal),
    );
  }
  const base = subMoney(subtotal, discountAmount);
  const serviceAmount = percentOf(base, Math.max(input.servicePercent, 0));
  const total = addMoney(
    addMoney(base, serviceAmount),
    Math.max(input.deliveryFee, 0),
  );
  return { subtotal, discountAmount, serviceAmount, total };
}
