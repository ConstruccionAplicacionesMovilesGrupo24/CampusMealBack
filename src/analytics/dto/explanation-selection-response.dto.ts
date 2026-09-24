import { ApiProperty } from '@nestjs/swagger';
import { ExplanationType } from '../../recommendations/enums/explanation-type.enum';

export class ExplanationSelectionResultDto {
  @ApiProperty({
    enum: ExplanationType,
    example: ExplanationType.EXPIRATION_PRIORITY,
  })
  explanationType: ExplanationType;

  @ApiProperty({
    example: 20,
    description:
      'Distinct recommendations of this explanation type that were displayed.',
  })
  impressions: number;

  @ApiProperty({
    example: 14,
    description:
      'Distinct displayed recommendations of this type that were selected.',
  })
  selections: number;

  @ApiProperty({
    example: 0.7,
    description:
      'selections ÷ impressions, 0 to 1, rounded to 4 decimals; 0 when impressions = 0.',
  })
  selectionRate: number;
}

export class ExplanationSelectionResponseDto {
  @ApiProperty({ example: '2026-09-01' })
  from: string;

  @ApiProperty({ example: '2026-09-30' })
  to: string;

  @ApiProperty({ type: ExplanationSelectionResultDto, isArray: true })
  results: ExplanationSelectionResultDto[];
}
