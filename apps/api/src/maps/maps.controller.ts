import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { MapsService } from './maps.service';
import { CreateMapDto } from './dto/create-map.dto';
import { UpdateMapDto } from './dto/update-map.dto';
import { SaveDocumentDto } from './dto/save-document.dto';
import { EditSessionDto } from './dto/edit-session.dto';
import {
  browserFromUa, clientIpOf, platformFromUa, sanitizeLabel,
} from '../common/client-info';

/**
 * /v1/maps — 맵 CRUD. 모든 엔드포인트는 인증 필요.
 * (AuthGuard — AUTH_MODE=dev 스텁 / supabase JWT 검증, Phase 3)
 */
@Controller('maps')
@UseGuards(AuthGuard)
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
    @Query('folder') folder?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    // 문서함 내용 검색 (2026-08-08) — 제목 + 맵 안(노드·노트·태그)
    @Query('q') q?: string,
  ) {
    return this.maps.list(user.id, {
      q: typeof q === 'string' ? q.slice(0, 200) : undefined,
      deleted: deleted === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      folder,
      sort: (['title', 'createdAt', 'updatedAt', 'nodeCount',
              'docBytes', 'attachCount', 'attachBytes'] as const)
        .find((k) => k === sort) ?? 'updatedAt',
      order: order === 'asc' ? 'asc' : 'desc',
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
    @Req() req: { ip?: string; ips?: string[]; headers?: Record<string, unknown> },
  ) {
    // 저장한 자리(기기·브라우저·IP) — 히스토리 버전에만 기록된다.
    // IP 는 **서버가 정한다**(클라이언트가 보낸 값은 믿지 않는다).
    // 플랫폼·브라우저는 클라이언트가 알려준 값이 우선 — UA 문자열로는
    // Windows 10/11 이 갈리지 않는다. 없으면 UA 로 추정한다.
    const ua = String(req?.headers?.['user-agent'] ?? '');
    return this.maps.saveDocument(
      user.id, id, dto.doc, dto.title, dto.keepVersion ?? false, dto.editSession,
      dto.allowEmpty ?? false,
      {
        platform: sanitizeLabel(dto.client?.platform) ?? platformFromUa(ua),
        browser: sanitizeLabel(dto.client?.browser) ?? browserFromUa(ua),
        ip: clientIpOf(req),
      });
  }

  // editSession(탭 고유 키)을 주면 편집 잠금을 시도하고 결과를
  // editLock: 'acquired' | 'busy' 로 돌려준다 (단일 세션 편집 — 2026-08-04)
  @Get(':id/document')
  getDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('editSession') editSession?: string,
  ) {
    return this.maps.getDocument(user.id, id, editSession?.slice(0, 64));
  }

  @Post(':id/edit-heartbeat')
  @HttpCode(200)
  editHeartbeat(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditSessionDto,
  ) {
    return this.maps.editHeartbeat(user.id, id, dto.sessionKey);
  }

  @Post(':id/edit-release')
  @HttpCode(200)
  editRelease(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditSessionDto,
  ) {
    return this.maps.editRelease(user.id, id, dto.sessionKey);
  }

  // ── 히스토리: 저장 시점별 문서 버전 (B8) ─────────────────────
  @Get(':id/versions')
  listVersions(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.maps.listVersions(user.id, id);
  }

  @Get(':id/versions/:version')
  getVersion(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.maps.getVersion(user.id, id, version);
  }
}
