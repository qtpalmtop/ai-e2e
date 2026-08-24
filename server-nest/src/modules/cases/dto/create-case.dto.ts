import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateCaseDto {
  @IsString()
  @Length(1, 64)
  spaceId!: string;

  @IsString()
  @Length(1, 128)
  name!: string;

  @IsOptional()
  @IsObject()
  schema?: Record<string, any>;
}
