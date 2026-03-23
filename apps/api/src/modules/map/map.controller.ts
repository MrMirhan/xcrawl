import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { MapService } from './map.service';
import { MapRequestDto } from './dto/map-request.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Map')
@Controller('map')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class MapController {
  constructor(private mapService: MapService) {}

  @Post()
  async map(@Body() dto: MapRequestDto) {
    return this.mapService.map(dto);
  }
}
