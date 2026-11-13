import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma.service';

export const SESSION_COOKIE = 'mb_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_CATEGORIES: { name: string; kind: 'INCOME' | 'EXPENSE' }[] = [
  { name: 'Sueldo', kind: 'INCOME' },
  { name: 'Ingresos extra', kind: 'INCOME' },
  { name: 'Alimentación', kind: 'EXPENSE' },
  { name: 'Transporte', kind: 'EXPENSE' },
  { name: 'Vivienda', kind: 'EXPENSE' },
  { name: 'Servicios', kind: 'EXPENSE' },
  { name: 'Salud', kind: 'EXPENSE' },
  { name: 'Entretenimiento', kind: 'EXPENSE' },
  { name: 'Otros gastos', kind: 'EXPENSE' },
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private newSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    return { token, data: { userId, tokenHash: this.hashToken(token), expiresAt } };
  }

  sessionCookieOptions() {
    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: SESSION_TTL_MS,
    };
  }

  csrfCookieOptions() {
    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    };
  }

  private async startSession(userId: string) {
    const { token, data } = this.newSession(userId);
    await this.prisma.session.create({ data });
    return token;
  }

  async register(input: { email: string; password: string; name: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new UnauthorizedException('No se pudo completar el registro.');
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: input.name.trim(),
        categories: {
          create: DEFAULT_CATEGORIES,
        },
      },
    });
    const token = await this.startSession(user.id);
    return { user, token };
  }

  async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Mensaje genérico: no revela si el correo existe.
    if (!user) throw new UnauthorizedException('Credenciales inválidas.');
    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas.');
    const token = await this.startSession(user.id);
    return { user, token };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  sanitizeUser(user: {
    id: string;
    email: string;
    name: string;
    mainCurrency: string;
    timezone: string;
    locale: string;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      mainCurrency: user.mainCurrency,
      timezone: user.timezone,
      locale: user.locale,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
