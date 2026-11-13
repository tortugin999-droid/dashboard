import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

export interface Pagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const MAX_PAGE_SIZE = 100;

@Injectable()
export class PaginationPipe implements PipeTransform {
  transform(value: Record<string, string>, _metadata: ArgumentMetadata): Pagination {
    const page = Math.max(1, Number.parseInt(value.page ?? '1', 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(value.pageSize ?? '20', 10) || 20));
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  }
}

export function pageMeta(pagination: Pagination, total: number) {
  return { page: pagination.page, pageSize: pagination.pageSize, total };
}
