import { DiscountType } from '../../common/constants/enums';
import { calculateOrderTotals } from './order-calculator';

describe('calculateOrderTotals', () => {
  const base = {
    discountType: null,
    discountValue: 0,
    servicePercent: 0,
    deliveryFee: 0,
  };

  it('returns the subtotal when there is nothing else', () => {
    expect(calculateOrderTotals({ ...base, subtotal: 132000 })).toEqual({
      subtotal: 132000,
      discountAmount: 0,
      serviceAmount: 0,
      total: 132000,
    });
  });

  it('applies the service charge after the discount', () => {
    const totals = calculateOrderTotals({
      ...base,
      subtotal: 157500,
      discountType: DiscountType.Percent,
      discountValue: 10,
      servicePercent: 10,
    });
    expect(totals.discountAmount).toBe(15750);
    expect(totals.serviceAmount).toBe(14175);
    expect(totals.total).toBe(155925);
  });

  it('caps a fixed discount by the subtotal and a percent discount at 100%', () => {
    expect(
      calculateOrderTotals({
        ...base,
        subtotal: 10000,
        discountType: DiscountType.Amount,
        discountValue: 50000,
      }).total,
    ).toBe(0);
    expect(
      calculateOrderTotals({
        ...base,
        subtotal: 10000,
        discountType: DiscountType.Percent,
        discountValue: 150,
      }).discountAmount,
    ).toBe(10000);
  });

  it('adds the delivery fee without charging service on it', () => {
    const totals = calculateOrderTotals({
      ...base,
      subtotal: 18000,
      servicePercent: 10,
      deliveryFee: 15000,
    });
    expect(totals.serviceAmount).toBe(1800);
    expect(totals.total).toBe(34800);
  });

  it('rounds half-up to two decimals without float drift', () => {
    const totals = calculateOrderTotals({
      ...base,
      subtotal: 0.1 + 0.2,
      servicePercent: 12.5,
    });
    expect(totals.subtotal).toBe(0.3);
    expect(totals.serviceAmount).toBe(0.04);
    expect(totals.total).toBe(0.34);
  });
});
