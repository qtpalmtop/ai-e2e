import { Module } from '@nestjs/common';
import { FormSchemasService } from './form-schemas.service';
import { FormSchemasController } from './form-schemas.controller';

@Module({
  controllers: [FormSchemasController],
  providers: [FormSchemasService],
  exports: [FormSchemasService],
})
export class FormSchemasModule {}
