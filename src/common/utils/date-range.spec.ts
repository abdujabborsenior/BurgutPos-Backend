import { BadRequestException } from '@nestjs/common';
import { optionalDateRange, resolveDateRange } from './date-range';

const TZ = 'Asia/Tashkent';

describe('resolveDateRange', () => {
  it('turns whole days into minute bounds with an exclusive end', () => {
    expect(
      resolveDateRange({ from: '2026-11-01', to: '2026-11-11' }, TZ),
    ).toEqual({
      from: '2026-11-01T00:00',
      to: '2026-11-11T23:59',
      until: '2026-11-12T00:00',
      fromDate: '2026-11-01',
      toDate: '2026-11-11',
    });
  });

  it('keeps picked minutes and includes the last one', () => {
    const range = resolveDateRange(
      { from: '2026-11-11T08:30', to: '2026-11-12T02:15' },
      TZ,
    );
    expect(range.until).toBe('2026-11-12T02:16');
    expect(range.toDate).toBe('2026-11-12');
  });

  it('rolls over months and years when closing the last minute', () => {
    expect(
      resolveDateRange({ from: '2026-12-31', to: '2026-12-31T23:59' }, TZ)
        .until,
    ).toBe('2027-01-01T00:00');
  });

  it('treats a lone bound as the rest of / the start of that day', () => {
    expect(resolveDateRange({ from: '2026-11-11T18:00' }, TZ)).toMatchObject({
      from: '2026-11-11T18:00',
      to: '2026-11-11T23:59',
    });
    expect(resolveDateRange({ to: '2026-11-11T09:00' }, TZ)).toMatchObject({
      from: '2026-11-11T00:00',
      to: '2026-11-11T09:00',
    });
  });

  it.each([
    [{ from: '2026-11-11T24:00' }],
    [{ from: '2026-11-11T10:60' }],
    [{ from: '2026-02-30' }],
    [{ from: '2026-11-11T12:00', to: '2026-11-11T11:59' }],
    [{ from: '2025-01-01', to: '2026-02-01' }],
  ])('rejects %j', (input) => {
    expect(() => resolveDateRange(input, TZ)).toThrow(BadRequestException);
  });
});

describe('optionalDateRange', () => {
  it('leaves missing sides open', () => {
    expect(optionalDateRange({})).toEqual({
      from: undefined,
      until: undefined,
    });
    expect(optionalDateRange({ to: '2026-11-11' })).toEqual({
      from: undefined,
      until: '2026-11-12T00:00',
    });
  });
});
