import { ApiProperty } from '@nestjs/swagger';

export class ZoneDemandTotalsDto {
  @ApiProperty({ type: Number, nullable: true })
  searches: number | null;

  @ApiProperty({ type: Number, nullable: true })
  detailOpenings: number | null;

  @ApiProperty({ type: Number, nullable: true })
  selections: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctUsers: number | null;

  @ApiProperty()
  suppressed: boolean;
}

export class ZoneDemandCategoryDto {
  @ApiProperty()
  category: string;

  @ApiProperty({ type: Number, nullable: true })
  selections: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctUsers: number | null;

  @ApiProperty({ type: Boolean })
  suppressed: boolean;
}

export class ZoneDemandSearchedBudgetRangeDto {
  @ApiProperty()
  range: string;

  @ApiProperty({ type: Number, nullable: true })
  searches: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctUsers: number | null;

  @ApiProperty({ type: Boolean })
  suppressed: boolean;
}

export class ZoneDemandInteractionPriceRangeDto {
  @ApiProperty()
  range: string;

  @ApiProperty({ type: Number, nullable: true })
  detailOpenings: number | null;

  @ApiProperty({ type: Number, nullable: true })
  selections: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctUsers: number | null;

  @ApiProperty({ type: Boolean })
  suppressed: boolean;
}

export class ZoneDemandHourDto {
  @ApiProperty({ minimum: 0, maximum: 23 })
  hour: number;

  @ApiProperty({ type: Number, nullable: true })
  selections: number | null;

  @ApiProperty({ type: Number, nullable: true })
  distinctUsers: number | null;

  @ApiProperty({ type: Boolean })
  suppressed: boolean;

  @ApiProperty({ type: Number, nullable: true })
  searches: number | null;

  @ApiProperty({ type: Number, nullable: true })
  detailOpenings: number | null;
}

export class ZoneDemandZoneDto {
  @ApiProperty()
  zone: string;

  @ApiProperty({ type: ZoneDemandTotalsDto })
  totals: ZoneDemandTotalsDto;

  @ApiProperty({ type: [ZoneDemandCategoryDto] })
  categories: ZoneDemandCategoryDto[];

  @ApiProperty({ type: [ZoneDemandSearchedBudgetRangeDto] })
  searchedBudgetRanges: ZoneDemandSearchedBudgetRangeDto[];

  @ApiProperty({ type: [ZoneDemandInteractionPriceRangeDto] })
  interactionPriceRanges: ZoneDemandInteractionPriceRangeDto[];

  @ApiProperty({ type: [ZoneDemandHourDto] })
  hours: ZoneDemandHourDto[];
}

export class ZoneDemandResponseDto {
  @ApiProperty({ example: 1 })
  contractVersion: number;

  @ApiProperty({ example: '2026-10-01' })
  from: string;

  @ApiProperty({ example: '2026-10-31' })
  to: string;

  @ApiProperty({ example: 'America/Bogota' })
  timezone: string;

  @ApiProperty({ example: '2026-10-28T20:00:00.000Z' })
  generatedAt: string;

  @ApiProperty({ example: 5 })
  minDistinctUsersPerCell: number;

  @ApiProperty()
  containsSyntheticData: boolean;

  @ApiProperty({
    example: 'INTEREST_INDICATORS_NOT_VERIFIED_PURCHASES',
  })
  interpretation: string;

  @ApiProperty()
  suppressedCells: number;

  @ApiProperty({ type: [ZoneDemandZoneDto] })
  zones: ZoneDemandZoneDto[];
}
