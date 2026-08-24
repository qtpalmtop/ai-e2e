import { IsOptional, IsString, Length } from 'class-validator';

export class CreateSpaceDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;
}
