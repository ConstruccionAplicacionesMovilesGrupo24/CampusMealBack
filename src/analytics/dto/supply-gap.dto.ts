import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { MealCategory } from '../../restaurants/enums/meal-category.enum';
import { AnalyticsZone } from '../enums/analytics-zone.enum';
import { ZoneDemandQueryDto } from './zone-demand-query.dto';

export const SUPPLY_ZONES = [
  AnalyticsZone.BOGOTA_CENTRO,
  AnalyticsZone.BOGOTA_CHAPINERO,
  AnalyticsZone.BOGOTA_TEUSAQUILLO,
] as const;
export type SupplyZone = (typeof SUPPLY_ZONES)[number];
export enum DemandDataset {
  REAL = 'REAL',
  SYNTHETIC = 'SYNTHETIC',
}

export class SupplyGapQueryDto extends ZoneDemandQueryDto {
  @ApiProperty({ enum: [...SUPPLY_ZONES] })
  @IsIn([...SUPPLY_ZONES])
  zone: SupplyZone;

  @ApiPropertyOptional({ enum: DemandDataset, default: DemandDataset.REAL })
  @IsOptional()
  @IsIn(Object.values(DemandDataset))
  dataset?: DemandDataset;
}

export enum GapStatus {
  GAP = 'GAP',
  NO_GAP = 'NO_GAP',
  NO_OBSERVATIONS = 'NO_OBSERVATIONS',
  SUPPRESSED = 'SUPPRESSED',
  UNKNOWN_SUPPLY = 'UNKNOWN_SUPPLY',
}

export class SupplyGapRowDto {
  @ApiProperty({ enum: MealCategory })
  category: MealCategory;
  @ApiProperty({ type: Number, nullable: true })
  searchIntents: number | null;
  @ApiProperty({ type: Number, nullable: true })
  distinctSearchers: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Fraction 0–1.' })
  demandShare: number | null;
  @ApiProperty({ type: Boolean, nullable: true })
  highDemand: boolean | null;
  @ApiProperty({ type: Number, nullable: true })
  availableRestaurants: number | null;
  @ApiProperty({ type: Boolean, nullable: true })
  lowSupply: boolean | null;
  @ApiProperty()
  suppressed: boolean;
  @ApiProperty({ enum: GapStatus })
  status: GapStatus;
}

export class SupplyGapResponseDto {
  @ApiProperty() contractVersion: number;
  @ApiProperty() policyVersion: number;
  @ApiProperty() generatedAt: string;
  @ApiProperty() asOf: string;
  @ApiProperty({ enum: [...SUPPLY_ZONES] }) zone: SupplyZone;
  @ApiProperty() from: string;
  @ApiProperty() to: string;
  @ApiProperty() synthetic: boolean;
  @ApiProperty({ type: Number, nullable: true })
  categorizedSearchIntents: number | null;
  @ApiProperty() mappedRestaurants: number;
  @ApiProperty() demandSuppressed: boolean;
  @ApiProperty({ type: [SupplyGapRowDto] }) rows: SupplyGapRowDto[];
  @ApiProperty({ type: [String] }) limitations: string[];
}
