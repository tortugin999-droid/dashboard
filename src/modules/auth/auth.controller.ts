import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'node:crypto';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { Public } from '../../common/public.decorator';
import { signCsrfToken } from '../../common/csrf.guard';
import { AuthService, SESSION_COOKIE } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { PrismaService } from '../../common/prisma.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Emite la cookie CSRF (mb_csrf) y el token a enviar en X-CSRF-Token.' })
  csrf(@Res({ passthrough: true }) res: Response) {
    const secret = this.config.getOrThrow<string>('CSRF_SECRET');
    const token = signCsrfToken(randomBytes(24).toString('base64url'), secret);
    res.cookie('mb_csrf', token, this.auth.csrfCookieOptions());
    return { csrfToken: token };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Registro de usuario. Crea sesión (cookie HttpOnly).' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.register(dto);
    res.cookie(SESSION_COOKIE, token, this.auth.sessionCookieOptions());
    return { user: this.auth.sanitizeUser(user) };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Inicio de sesión. Crea sesión (cookie HttpOnly).' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.auth.login(dto);
    res.cookie(SESSION_COOKIE, token, this.auth.sessionCookieOptions());
    return { user: this.auth.sanitizeUser(user) };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoca la sesión actual y limpia la cookie.' })
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return undefined;
  }

  @Get('me')
  @ApiOperation({ summary: 'Sesión actual.' })
  async me(@CurrentUser() user: AuthUser) {
    const full = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { user: this.auth.sanitizeUser(full) };
  }
}
