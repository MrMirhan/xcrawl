import { Controller, Post, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserAuthService } from './user-auth.service';
import { SignupDto, SigninDto, UpdateSettingsDto } from './dto/auth.dto';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('User Auth')
@Controller('user')
export class UserAuthController {
  constructor(private userAuth: UserAuthService) {}

  @Post('signup')
  @UseGuards(ApiKeyRateLimitGuard)
  async signup(@Body() dto: SignupDto) {
    return this.userAuth.signup(dto);
  }

  @Post('signin')
  @UseGuards(ApiKeyRateLimitGuard)
  async signin(@Body() dto: SigninDto) {
    return this.userAuth.signin(dto);
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req: { user: { userId: string } }) {
    return this.userAuth.getProfile(req.user.userId);
  }

  @Get('settings')
  @UseGuards(AuthGuard('jwt'))
  async getSettings(@Req() req: { user: { userId: string } }) {
    return this.userAuth.getSettings(req.user.userId);
  }

  @Patch('settings')
  @UseGuards(AuthGuard('jwt'))
  async updateSettings(
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.userAuth.updateSettings(req.user.userId, dto);
  }

  @Post('test-llm')
  @UseGuards(AuthGuard('jwt'))
  async testLlm(
    @Body() body: { baseUrl?: string; apiKey?: string; model?: string },
  ) {
    return this.userAuth.testLlmConnection(body);
  }
}
