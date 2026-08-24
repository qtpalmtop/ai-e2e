import { IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  @Length(1, 128)
  name?: string;

  @IsOptional()
  @IsObject()
  schema?: Record<string, any>;
}
