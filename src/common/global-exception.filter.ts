import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    const body = this.buildBody(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    res.status(status).json(body);
  }

  private buildBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let message = exception.message;
      let details: unknown;
      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        message = typeof r.message === 'string' ? r.message : Array.isArray(r.message) ? r.message.join('; ') : message;
        if (r.error !== undefined && r.error !== 'Error') details = r.error;
        if (r.details !== undefined) details = r.details;
        if (Array.isArray(r.message)) details = r.message;
      }
      return {
        error: {
          code: CODE_BY_STATUS[status] ?? 'ERROR',
          message,
          details: details ?? {},
        },
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          error: {
            code: 'CONFLICT',
            message: 'El registro ya existe o la operación se duplicó.',
            details: { target: exception.meta?.target ?? [] },
          },
        };
      }
      if (exception.code === 'P2025') {
        return {
          error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.', details: {} },
        };
      }
    }
    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error interno del servidor.',
        details: {},
      },
    };
  }
}
