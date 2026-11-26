import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthConfig } from '../../config/configuration';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { normalizeIp } from '../../common/utils/client-ip';
import { AuthService, type ClientMeta } from './auth.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';

export const REFRESH_COOKIE = 'bp_refresh';
const COOKIE_PATH = '/api/auth';

function clientMeta(request: Request): ClientMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: normalizeIp(request.ip),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 255) : null,
  };
}

function readRefreshCookie(request: Request): unknown {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  return cookies?.[REFRESH_COOKIE];
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieSecure = config.getOrThrow<AuthConfig>('auth').cookieSecure;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, clientMeta(request));
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.auth.refresh(
        readRefreshCookie(request),
        clientMeta(request),
      );
      this.setRefreshCookie(
        response,
        result.refreshToken,
        result.refreshExpiresAt,
      );
      return { accessToken: result.accessToken, user: result.user };
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request), clientMeta(request));
    this.clearRefreshCookie(response);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user);
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user, dto);
  }

  private setRefreshCookie(
    response: Response,
    token: string,
    expires: Date,
  ): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
    });
  }
}
