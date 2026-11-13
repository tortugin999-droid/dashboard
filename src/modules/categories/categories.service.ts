import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  toDto(c: Category) {
    return {
      id: c.id,
      name: c.name,
      kind: c.kind,
      archived: c.archived,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  async list(userId: string, query: { kind?: 'INCOME' | 'EXPENSE'; includeArchived?: boolean }) {
    return this.prisma.category.findMany({
      where: {
        userId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.includeArchived ? {} : { archived: false }),
      },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const dup = await this.prisma.category.findFirst({
      where: { userId, name: dto.name.trim(), kind: dto.kind },
    });
    if (dup) throw new ConflictException('Ya existe una categoría con ese nombre y tipo.');
    return this.prisma.category.create({
      data: { userId, name: dto.name.trim(), kind: dto.kind },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({ where: { id, userId } });
    if (!category) throw new NotFoundException('Categoría no encontrada.');
    return this.prisma.category.update({ where: { id }, data: dto });
  }
}
