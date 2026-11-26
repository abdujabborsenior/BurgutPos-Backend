import {
  ALL_PERMISSIONS,
  normalizePermissions,
  Permission,
} from './permissions';

describe('normalizePermissions', () => {
  it('drops unknown keys and keeps catalog order', () => {
    expect(
      normalizePermissions(['menu.view', 'not.a.permission', 'dashboard.view']),
    ).toEqual([Permission.DashboardView, Permission.MenuView]);
  });

  it('adds view permissions implied by manage permissions', () => {
    const result = normalizePermissions([
      Permission.StockManage,
      Permission.TeamManage,
    ]);
    expect(result).toEqual(
      expect.arrayContaining([Permission.StockView, Permission.TeamView]),
    );
  });

  it('grants POS access to any order permission', () => {
    expect(normalizePermissions([Permission.OrdersPay])).toContain(
      Permission.PosAccess,
    );
  });

  it('keeps the full catalog intact', () => {
    expect(normalizePermissions(ALL_PERMISSIONS)).toEqual(ALL_PERMISSIONS);
  });
});
