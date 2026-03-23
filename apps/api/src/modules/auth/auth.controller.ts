import { Controller, Post, Get, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('Auth')
@Controller('auth/keys')
@UseGuards(AuthGuard('jwt'))
@ApiSecurity('api-key')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post()
  async createKey(@Body() dto: CreateApiKeyDto, @Req() req: { user: { userId: string } }) {
    return this.authService.createApiKey(dto.name, req.user.userId);
  }

  @Get()
  async listKeys(@Req() req: { user: { userId: string } }) {
    return this.authService.listApiKeys(req.user.userId);
  }

  @Delete(':id')
  async revokeKey(@Param('id') id: string, @Req() req: { user: { userId: string } }) {
    return this.authService.revokeApiKey(id, req.user.userId);
  }
}
