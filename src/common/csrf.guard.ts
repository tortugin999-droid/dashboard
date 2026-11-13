import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from './public.decorator';

const CSRF_COOKIE = 'mb_csrf';
const CSRF_HEADER = 'x-csrf-token';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    void isPublic;
    const secret = this.config.getOrThrow<string>('CSRF_SECRET');
    const cookieValue = req.cookies?.[CSRF_COOKIE];
    const headerValue = req.headers[CSRF_HEADER];
    if (typeof cookieValue !== 'string' || typeof headerValue !== 'string') {
      throw new ForbiddenException('Falta el token CSRF. Obtén uno en GET /api/v1/auth/csrf.');
    }
    if (!safeEqual(cookieValue, headerValue)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }
    const idx = cookieValue.indexOf('.');
    if (idx <= 0) throw new ForbiddenException('Token CSRF inválido.');
    const token = cookieValue.slice(0, idx);
    const sig = cookieValue.slice(idx + 1);
    const expected = createHmac('sha256', secret).update(token).digest('base64url');
    if (!safeEqual(sig, expected)) {
      throw new ForbiddenException('Token CSRF inválido.');
    }
    return true;
  }
}

export function signCsrfToken(token: string, secret: string): string {
  return `${token}.${createHmac('sha256', secret).update(token).digest('base64url')}`;
}

export const CSRF_COOKIE_NAME = CSRF_COOKIE;
