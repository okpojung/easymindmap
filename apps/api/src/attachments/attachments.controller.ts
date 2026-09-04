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

/**
 * `Range: bytes=시작-끝` 한 구간만 해석한다 (RFC 9110 §14.1.1).
 *
 * 반환값
 *   · `null`      — Range 헤더가 없거나 bytes 단위가 아니다 → 전체 응답
 *   · `'invalid'` — 파일 범위를 벗어났다 → 416
 *   · `{start,end}` — 그 구간만 (end 포함)
 *
 * 다중 구간(`bytes=0-10,20-30`)은 지원하지 않는다 — 브라우저의 미디어
 * 재생은 항상 한 구간만 요청하고, multipart/byteranges 응답은 이 용도에
 * 필요 없다. 그런 요청이 오면 전체를 보낸다(허용된 동작이다).
 */
export function parseByteRange(
  header: string | string[] | undefined,
  size: number,
): { start: number; end: number } | null | 'invalid' {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if (!m) return null;                       // 다중 구간·다른 단위 → 전체
  const [, s1, s2] = m;
  if (s1 === '' && s2 === '') return null;
  if (size <= 0) return 'invalid';

  let start: number;
  let end: number;
  if (s1 === '') {
    // `bytes=-500` = 마지막 500바이트
    const len = Number(s2);
    if (!Number.isFinite(len) || len <= 0) return 'invalid';
    start = Math.max(0, size - len);
    end = size - 1;
  } else {
    start = Number(s1);
    end = s2 === '' ? size - 1 : Number(s2);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
    if (end > size - 1) end = size - 1;      // 끝 초과는 잘라 준다(관례)
  }
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}
import { StartUploadDto } from './dto/start-upload.dto';
import { FromUrlDto } from './dto/from-url.dto';
import { BlockedUrlError, fetchRemoteImage, RemoteFetchError } from './remote-image';

/**
 * 첨부 하나를 응답으로 흘린다 — **인증 경로와 공개 경로가 같은 코드를
 * 쓴다** (2026-09-04).
 *
 * Range·Content-Disposition·416 처리를 두 벌로 두면 언젠가 한쪽만 고쳐진다.
 * 다른 것은 **누구에게 열어 주는가** 하나뿐이므로, 그 판정만 `open` 콜백으로
 * 받는다.
 */
export async function sendAttachment(
  req: Request,
  res: Response,
  open: (range?: { start: number; end: number }) => Promise<{
    name: string; mime: string; sizeBytes: number; stream: NodeJS.ReadableStream & { destroy: () => void };
  }>,
): Promise<void> {
  // 크기·이름을 먼저 알아야 범위를 계산할 수 있다 — 스트림은 그다음
  const head = await open();
  const size = head.sizeBytes;
  res.setHeader('Content-Type', head.mime);
  // RFC 5987 — 한글 파일명 안전 전달
  res.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(head.name)}`,
  );
  res.setHeader('Accept-Ranges', 'bytes');

  const parsed = parseByteRange(req.headers.range, size);
  if (parsed === 'invalid') {
    head.stream.destroy();
    res.setHeader('Content-Range', `bytes */${size}`);
    res.status(416).end();
    return;
  }
  if (!parsed) {
    res.setHeader('Content-Length', String(size));
    head.stream.pipe(res);
    return;
  }

  // 구간 요청 — 앞서 연 전체 스트림은 버리고 그 구간만 다시 연다
  head.stream.destroy();
  const part = await open(parsed);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`);
  res.setHeader('Content-Length', String(parsed.end - parsed.start + 1));
  part.stream.pipe(res);
}

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

  /**
   * **원격 사진 대리 다운로드** (2026-08-20, B16 ② 슬라이스 3 · D-1).
   *
   * `POST /v1/attachments/from-url  { url, mapId? }` → 단일 업로드와
   * **같은 모양**의 응답. 호출부(붙여넣기)가 두 경로를 구분하지 않아도 된다.
   *
   * 프런트가 직접 받지 못하는 이유는 CORS 다 — 남의 사이트가 우리에게
   * 사진을 내줄 이유가 없다. 서버는 CORS 를 받지 않는다.
   *
   * ★ **`:id` 라우트보다 위**에 둔다. `@Get(':id')` 와는 메서드가 달라
   *   지금은 겹치지 않지만, 순서를 지켜 두는 편이 나중에 안전하다.
   *
   * 실패는 **전부 400** 이다. 서버가 못 받았다는 사실만 중요하고, 프런트는
   * 그 메시지를 그대로 보여 준 뒤 **data URL 폴백**으로 넘어간다.
   */
  @Post('from-url')
  async fromUrl(@CurrentUser() user: AuthUser, @Body() dto: FromUrlDto) {
    try {
      // `store: false` — 저장하지 않고 바이트만 (리치 노트 HTML 용, DTO 참조)
      if (dto.store === false) {
        const img = await fetchRemoteImage(dto.url);
        return {
          mime: img.mime,
          sizeBytes: img.bytes.length,
          dataUrl: `data:${img.mime};base64,${img.bytes.toString('base64')}`,
        };
      }
      const meta = await this.attachments.uploadFromUrl(
        user.id, dto.url, dto.mapId || undefined,
      );
      return { ...meta, url: `/v1/attachments/${meta.id}` };
    } catch (err) {
      if (err instanceof BlockedUrlError || err instanceof RemoteFetchError) {
        throw new BadRequestException(err.message);
      }
      throw err; // 쿼터 초과(413) 등은 그대로 올린다 — 삼키면 한도를 넘긴다
    }
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

  /**
   * 첨부 내려받기 — **HTTP Range 를 지원한다** (2026-08-07).
   *
   * 왜 필요했나: 브라우저는 `<video>`/`<audio>` 를 재생할 때 Range 로
   * 앞부분만 먼저 받고, 구간을 옮기면 그 지점부터 다시 받는다. 서버가
   * 전체를 200 으로만 주면 **구간 이동이 안 되고**, 큰 파일은 재생이
   * 시작조차 안 되는 것처럼 보인다 (2026-08-07 보고: 884MB 동영상을
   * 첨부한 뒤 Play 를 눌러도 빈 창만 떴다).
   *
   * `Accept-Ranges: bytes` 를 항상 알려 주고, `Range: bytes=시작-끝` 이
   * 오면 **206 + Content-Range** 로 그 구간만 보낸다. 범위가 파일을
   * 벗어나면 **416** 이다(RFC 9110).
   */
  @Get(':id')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await sendAttachment(req, res, (range) => this.attachments.open(user.id, id, range));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.attachments.remove(user.id, id);
  }
}
