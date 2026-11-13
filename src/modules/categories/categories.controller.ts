import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/current-user.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, ListCategoriesQuery, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista de categorías del usuario.' })
  async list(@CurrentUser() user: AuthUser, @Query() query: ListCategoriesQuery) {
    const rows = await this.categories.list(user.id, query);
    return { data: rows.map((c) => this.categories.toDto(c)), meta: { page: 1, pageSize: rows.length, total: rows.length } };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una categoría.' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.toDto(await this.categories.create(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombra o archiva una categoría.' })
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.toDto(await this.categories.update(user.id, id, dto));
  }
}
