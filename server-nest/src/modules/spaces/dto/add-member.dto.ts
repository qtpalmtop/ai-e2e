import { IsEnum, IsString, Length } from 'class-validator';
import { SpaceRole } from '@prisma/client';

export class AddMemberDto {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsEnum(SpaceRole, { message: 'role 必须是 SpaceRole 枚举值' })
  role!: SpaceRole;
}
