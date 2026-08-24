import { IsArray, IsObject, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FormAtomDto {
  @IsString() id!: string;
  @IsString() type!: string;
  @IsString() name!: string;
  @IsString() label!: string;
  @IsOptional() defaultValue?: any;
  @IsOptional() placeholder?: string;
  @IsOptional() help?: string;
  @IsOptional() required?: boolean;
  @IsOptional() options?: { label: string; value: any }[];
  @IsOptional() min?: number;
  @IsOptional() max?: number;
  @IsOptional() rules?: any[];
}

export class UpsertFormSchemaDto {
  @IsString() @Length(1, 32) nodeType!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FormAtomDto)
  atoms!: FormAtomDto[];
}
