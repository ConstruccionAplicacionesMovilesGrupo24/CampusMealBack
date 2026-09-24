import { ApiProperty } from '@nestjs/swagger';

/** Matches the Android `InventoryItemDto`: exactly these seven fields, all required. */
export class InventoryItemResponseDto {
  @ApiProperty({
    example: 'f870e006-aacf-4a16-b7ee-0566a91555aa',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ example: 'Whole milk' })
  name: string;

  @ApiProperty({ example: 1.0 })
  quantity: number;

  @ApiProperty({ example: 'L' })
  unit: string;

  @ApiProperty({
    example: '2026-09-25',
    description: 'Calendar date `YYYY-MM-DD`.',
  })
  expirationDate: string;

  @ApiProperty({
    example: 1,
    description:
      'Calculated by the backend against today in America/Bogota: 0 expires today, 1 tomorrow, negative already expired. Clients must not recompute it.',
  })
  remainingDays: number;

  @ApiProperty({ example: true })
  active: boolean;
}

export class InventoryItemsResponseDto {
  @ApiProperty({
    type: [InventoryItemResponseDto],
    description:
      'In backend priority order (soonest expiration first). Empty array when nothing matches.',
  })
  items: InventoryItemResponseDto[];
}
