import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  RestaurantDetailResponseDto,
  RestaurantSearchResponseDto,
} from './dto/restaurant-response.dto';
import { SearchRestaurantsDto } from './dto/search-restaurants.dto';
import { RestaurantsService } from './restaurants.service';

@ApiTags('Restaurants')
@Controller('restaurants')
@Auth()
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Find context-compatible restaurants',
    description:
      'Filters active restaurants by request time, budget and dietary preferences, then obtains walking estimates through RouteProviderPort. Provider failure keeps otherwise-usable restaurants with null route values.',
  })
  @ApiOkResponse({ type: RestaurantSearchResponseDto })
  search(
    @Body() dto: SearchRestaurantsDto,
  ): Promise<RestaurantSearchResponseDto> {
    return this.restaurantsService.search(dto);
  }

  @Get(':restaurantId')
  @ApiOperation({
    summary: 'Get restaurant details and available meals',
  })
  @ApiOkResponse({ type: RestaurantDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Restaurant not found.' })
  getDetail(
    @Param('restaurantId', new ParseUUIDPipe())
    restaurantId: string,
  ): Promise<RestaurantDetailResponseDto> {
    return this.restaurantsService.getDetail(restaurantId);
  }
}
