import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'username 只能包含字母/数字/下划线/连字符',
  })
  username!: string;

  @IsString()
  @Length(6, 64)
  password!: string;

  @IsString()
  @Length(1, 64)
  nickname?: string;
}
