import {
  addQty,
  money,
  mulMoney,
  percentOf,
  qty,
  subMoney,
  sumMoney,
} from './money';

describe('money helpers', () => {
  it('avoids binary floating point errors', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(subMoney(0.3, 0.1)).toBe(0.2);
    expect(addQty(0.1, 0.2)).toBe(0.3);
  });

  it('rounds half-up', () => {
    expect(money(1.005)).toBe(1.01);
    expect(qty(0.0375)).toBe(0.038);
    expect(percentOf(141750, 10)).toBe(14175);
    expect(mulMoney(45000, 1.5)).toBe(67500);
  });
});
