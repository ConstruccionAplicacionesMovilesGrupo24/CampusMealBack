import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipeCatalogRow } from './entities/recipe-catalog.entity';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';

/** S3-04 / BQ3: read-only recipe catalog. The data is written only by the recipes seed. */
@Module({
  imports: [TypeOrmModule.forFeature([RecipeCatalogRow])],
  controllers: [RecipesController],
  providers: [RecipesService],
})
export class RecipesModule {}
