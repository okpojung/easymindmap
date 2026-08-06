import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import type { AppEnv } from '../config/env.validation';
import { AttachmentsService } from './attachments.service';
import { ChunkUploadService } from './chunk-upload.service';
import { StartUploadDto } from './dto/start-upload.dto';

/**
 * /v1/attachments — 첨부 저장소 (B9).
 * 다운로드(GET)는 <a href>/fetch 로 열리므로 Authorization 헤더 대신
 * `?access_token=` 쿼리도 허용한다 (auth.guard 참조).
 */
@Controller('attachments')
@UseGuards(AuthGuard)
export class AttachmentsController {
  private readonly maxBytes: number;

  constructor(
    private readonly attachments: AttachmentsService,
    private readonly chunks: ChunkUploadService,
    config: ConfigService<AppEnv, true>,
  ) {
    this.maxBytes = config.get('ATTACHMENT_MAX_MB', { infer: true }) * 1024 * 1024;
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('mapId') mapId?: string,
  ) {
    if (!file) throw new BadRequestException('file 필드에 파일을 첨부해 주세요.');
    if (file.size > this.maxBytes) {
      throw new BadRequestException(
        `첨부 1개는 최대 ${Math.round(this.maxBytes / 1024 / 1024)}MB 까지입니다.`,
      );
    }
    const meta = await this.attachments.upload(user.id, file, mapId || undefined);
    return { ...meta, url: `/v1/attachments/${meta.id}` };
  }

  @Get('quota')
  quota(@CurrentUser() user: AuthUser) {
    return this.attachments.usage(user.id);
  }

  // ── 대용량 첨부 — 청크 업로드 (§12) ───────────────────────────────
  // **`:id` 라우트보다 먼저** 선언한다 — 'uploads' 가 첨부 id 로 잡히지
  // 않도록. (`GET /attachments/uploads/:uploadId` 는 두 마디라 애초에
  // 겹치지 않지만, 순서를 지켜 두는 편이 나중에 안전하다.)

  @Post('uploads')
  startUpload(@CurrentUser() user: AuthUser, @Body() dto: StartUploadDto) {
    return this.chunks.start(user.id, dto);
  }

  /**
   * 조각 하나 — **본문을 메모리에 담지 않는다.** `@Req()` 로 받은 요청
   * 스트림을 그대로 파일로 흘린다.
   *
   * express 의 json·urlencoded 파서는 Content-Type 으로 걸러 동작하므로
   * `application/octet-stream` 본문은 건드리지 않고 지나간다. 그래도
   * 중간 미들웨어가 삼켜 버린 경우를 대비해 한 번 확인한다 — 삼켜진 채로
   * 진행하면 **0바이트 조각**이 조용히 쌓인다.
   */
  @Put('uploads/:uploadId/parts/:index')
  putPart(
    @CurrentUser() user: AuthUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('index', ParseIntPipe) index: number,
    @Req() req: Request,
  ) {
    if (req.readableEnded || (req as { body?: unknown }).body instanceof Buffer) {
      throw new BadRequestException(
        '조각 본문을 읽을 수 없습니다 — Content-Type 을 application/octet-stream 으로 보내 주세요.',
      );
    }
    return this.chunks.putPart(user.id, uploadId, index, req);
  }

  @Get('uploads/:uploadId')
  uploadStatus(
    @CurrentUser() user: AuthUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    return this.chunks.status(user.id, uploadId);
  }

  @Post('uploads/:uploadId/complete')
  async completeUpload(
    @CurrentUser() user: AuthUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    const meta = await this.chunks.complete(user.id, uploadId);
    // 단일 업로드(POST /attachments)와 **같은 모양**으로 돌려준다 —
    // 호출부가 두 경로를 구분하지 않아도 되게.
    return { ...meta, url: `/v1/attachments/${meta.id}` };
  }

  @Delete('uploads/:uploadId')
  @HttpCode(204)
  async abortUpload(
    @CurrentUser() user: AuthUser,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ) {
    await this.chunks.abort(user.id, uploadId);
  }

  @Get(':id')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const att = await this.attachments.open(user.id, id);
    res.setHeader('Content-Type', att.mime);
    res.setHeader('Content-Length', String(att.sizeBytes));
    // RFC 5987 — 한글 파일명 안전 전달
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(att.name)}`,
    );
    att.stream.pipe(res);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.attachments.remove(user.id, id);
  }
}
