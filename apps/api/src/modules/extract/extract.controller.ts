import { Controller, Post, Get, Delete, Param, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ExtractService } from './extract.service';
import { ExtractRequestDto } from './dto/extract-request.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('Extract')
@Controller('extract')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
@ApiSecurity('api-key')
export class ExtractController {
  constructor(private extractService: ExtractService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startExtract(@Body() dto: ExtractRequestDto, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.extractService.startExtract(dto, req.apiKeyId, req.userId);
  }

  @Get(':id')
  async getStatus(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.extractService.getExtractStatus(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Delete(':id')
  async cancel(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.extractService.cancelExtract(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }
}
