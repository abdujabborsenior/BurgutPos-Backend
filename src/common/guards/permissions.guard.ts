import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { type AuthUser, hasPermission } from '../types/auth-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const requirement = this.reflector.getAllAndOverride<
      PermissionRequirement | undefined
    >(PERMISSIONS_KEY, targets);
    if (!requirement || requirement.permissions.length === 0) return true;

    const user = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException('Недостаточно прав');

    const check = (permission: (typeof requirement.permissions)[number]) =>
      hasPermission(user, permission);
    const allowed =
      requirement.mode === 'all'
        ? requirement.permissions.every(check)
        : requirement.permissions.some(check);

    if (!allowed) {
      throw new ForbiddenException('Недостаточно прав для этого действия');
    }
    return true;
  }
}
