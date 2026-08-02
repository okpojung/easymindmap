import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import type { AppEnv } from '../config/env.validation';
import { AttachmentsService } from './attachments.service';

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
