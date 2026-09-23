import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../users/enums/user-role.enum';

export class CurrentUserDto {
  @ApiProperty({
    example: '3f0c6f5e-1b2a-4c3d-9e8f-7a6b5c4d3e2f',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ example: 'CampusMeal Demo' })
  name: string;

  @ApiProperty({ example: 'demo@campusmeal.local' })
  email: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.USER })
  role: UserRole;
}
