import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../constants/permissions';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionRequirement {
  mode: 'all' | 'any';
  permissions: Permission[];
}

/** The user must hold every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata<string, PermissionRequirement>(PERMISSIONS_KEY, {
    mode: 'all',
    permissions,
  });

/** The user must hold at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata<string, PermissionRequirement>(PERMISSIONS_KEY, {
    mode: 'any',
    permissions,
  });
