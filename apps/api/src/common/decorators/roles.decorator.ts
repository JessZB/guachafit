import { SetMetadata } from '@nestjs/common';
import { Rol } from '@guachafit/shared';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Rol[]) => SetMetadata(ROLES_KEY, roles);
