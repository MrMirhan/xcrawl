import { Controller, Post, Get, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ProxyService } from './proxy.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Proxies')
@Controller('proxies')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class ProxyController {
  constructor(private proxyService: ProxyService) {}

  @Post()
  async add(@Body() body: { url: string; protocol?: string; country?: string }) {
    return this.proxyService.addProxy(body);
  }

  @Get()
  async list() {
    return this.proxyService.listProxies();
  }

  @Delete()
  async clearAll() {
    return this.proxyService.clearAllProxies();
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.proxyService.removeProxy(id);
  }

  @Post('test')
  async test(@Body() body: { url: string }) {
    return this.proxyService.testProxy(body.url);
  }
}
