// 角色装饰器：标注接口需要的角色
// 用法：@Roles(SpaceRole.OWNER, SpaceRole.EDITOR)
import { SetMetadata } from '@nestjs/common';
import { SpaceRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: SpaceRole[]) => SetMetadata(ROLES_KEY, roles);
