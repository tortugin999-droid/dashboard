import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class WrapInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        const res = context.switchToHttp().getResponse();
        if (data === undefined || res.statusCode === 204) return data;
        if (
          data &&
          typeof data === 'object' &&
          'data' in (data as Record<string, unknown>) &&
          'meta' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return { data };
      }),
    );
  }
}
