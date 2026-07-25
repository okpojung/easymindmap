import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DevAuthGuard } from '../common/auth/dev-auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { MapsService } from './maps.service';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';
import { SaveDocumentDto } from './dto/save-document.dto';

/**
 * /v1/maps — 맵 CRUD. 모든 엔드포인트는 인증 필요.
 * (현재 DevAuthGuard = 개발 스텁, 다음 단계에서 Supabase 가드로 교체)
 */
@Controller('maps')
@UseGuards(DevAuthGuard)
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMapDto) {
    return this.maps.create(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('deleted') deleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.maps.list(user.id, {
      deleted: deleted === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.maps.getOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMapDto,
  ) {
    return this.maps.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.maps.remove(user.id, id);
  }

  // ── 전체 문서 스냅샷(클라우드 저장) ──────────────────────────
  @Put(':id/document')
  saveDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveDocumentDto,
  ) {
    return this.maps.saveDocument(user.id, id, dto.doc, dto.title);
  }

  @Get(':id/document')
  getDocument(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.maps.getDocument(user.id, id);
  }
}
