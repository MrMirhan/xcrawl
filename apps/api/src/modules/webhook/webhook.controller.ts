import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class WebhookController {
  constructor(private webhookService: WebhookService) {}

  @Post()
  async create(
    @Body() body: { url: string; events: string[]; secret?: string },
    @Req() req: { apiKeyId?: string; userId?: string },
  ) {
    return this.webhookService.createWebhook(body, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get()
  async list(@Req() req: { apiKeyId?: string; userId?: string }) {
    return this.webhookService.listWebhooks({ userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Req() req: { apiKeyId?: string; userId?: string },
    @Body() body: { url?: string; events?: string[]; secret?: string; active?: boolean },
  ) {
    return this.webhookService.updateWebhook(id, body, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.webhookService.deleteWebhook(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }
}
