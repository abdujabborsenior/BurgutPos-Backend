import type { Permission } from '../constants/permissions';

/** Identity attached to every authenticated request (request.user). */
export interface AuthUser {
  id: number;
  fullName: string;
  login: string;
  isSuperadmin: boolean;
  roleId: number | null;
  roleName: string | null;
  permissions: Permission[];
  sessionId: string;
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return user.isSuperadmin || user.permissions.includes(permission);
}
