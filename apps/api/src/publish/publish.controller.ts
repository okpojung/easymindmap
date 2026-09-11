import {
  BadRequestException,
  Body,
  Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, Res,
  StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UPLOAD_LIMITS } from '../common/upload-limits';
import type { Request, Response } from 'express';
import { AttachmentsService } from '../attachments/attachments.service';
import { sendAttachment } from '../attachments/attachments.controller';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { PublishService, type PublishVisibility } from './publish.service';
import { buildOgFragment } from './og-tags';

/**
 * 퍼블리싱 · 중단 · 상태 — **맵 주인의 조작**이라 인증이 필요하다.
 * 비인증 조회는 별도 컨트롤러다 (`public-publish.controller.ts`).
 */
@Controller('maps')
@UseGuards(AuthGuard)
export class PublishController {
  constructor(private readonly publish: PublishService) {}

  /**
   * 퍼블리싱 **등록**. `visibility` 를 주면 그 상태로 등록한다
   * (기본은 `public` = 무료공개 — 지금까지의 동작 그대로다).
   */
  @Post(':id/publish')
  @HttpCode(200)
  publishMap(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body?: { visibility?: string },
  ) {
    return this.publish.publish(user.id, id, (body?.visibility ?? 'public') as PublishVisibility);
  }

  /**
   * 상태 전환 (비공개 ↔ 무료공개) — **주소는 그대로다.**
   *
   * `POST` 와 나눈 이유: 등록과 노출은 다른 일이다. 하나로 묶으면
   * "다시 눌렀더니 주소가 바뀌었다" 같은 사고가 생길 자리가 남는다.
   */
  @Patch(':id/publish')
  setVisibility(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { visibility?: string },
  ) {
    if (!body?.visibility) throw new BadRequestException('visibility 를 주세요 (private | public).');
    return this.publish.setVisibility(user.id, id, body.visibility as PublishVisibility);
  }

  /** 퍼블리싱 **등록 취소** — 주소가 죽는다(다시 등록하면 새 주소) */
  @Delete(':id/publish')
  @HttpCode(204)
  unpublishMap(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publish.unpublish(user.id, id);
  }

  @Get(':id/publish-status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publish.status(user.id, id);
  }

  /**
   * 주인이 보는 미리보기 — **비공개(보관)여도 열린다.**
   * 대화상자가 `<img>` 대신 이 응답을 받아 blob 으로 그린다(헤더가 필요해서).
   */
  @Get(':id/publish/preview')
  async ownerPreview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const stream = await this.publish.openOwnerPreview(user.id, id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(stream);
  }

  /**
   * 미리보기 실루엣 올리기 (27a §2) — 저자의 브라우저가 만든 PNG.
   * 서버는 그림을 만들지 않는다(헤드리스 브라우저도 이미지 라이브러리도
   * 없다). 여기서 하는 일은 **받아서 두는 것**뿐이다.
   */
  @Put(':id/publish/preview')
  @UseInterceptors(FileInterceptor('file', { limits: UPLOAD_LIMITS }))
  putPreview(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('file 필드에 이미지를 첨부해 주세요.');
    return this.publish.putPreview(user.id, id, file.buffer);
  }
}

/**
 * **인증 없이** 열리는 유일한 맵 경로다.
 *
 * 그래서 `AuthGuard` 를 붙이지 않는 것이 실수처럼 보이지 않도록 컨트롤러를
 * 따로 뒀다 — 인증이 필요한 경로와 한 파일 안에 섞여 있으면, 나중에 이
 * 클래스에 경로 하나를 더 얹는 사람이 **자기 경로도 공개된다는 사실을
 * 모른 채** 얹게 된다.
 *
 * 여기에 새 경로를 더할 때는 "로그인하지 않은 사람에게 보여도 되는가"를
 * 먼저 답해야 한다.
 */
@Controller('published')
export class PublicPublishController {
  constructor(
    private readonly publish: PublishService,
    private readonly attachments: AttachmentsService,
  ) {}

  /** 슬러그 모양이 아니면 DB 에 묻지도 않는다 — 공개 경로라 아무나 두드린다 */
  private static slug(publishId: string): string {
    if (!/^[a-z0-9]{6,20}$/.test(publishId)) {
      throw new BadRequestException('잘못된 퍼블리싱 링크입니다.');
    }
    return publishId;
  }

  /**
   * ★ **링크 카드·검색이 읽는 `<head>` 조각** (2026-09-06, `og-tags.ts`).
   *
   * nginx 가 `/p/{id}` 를 낼 때 **SSI 로 이것만 끼워 넣는다.** 페이지를
   * 통째로 서버가 만들지 않는 이유는 번들 파일 이름(해시)을 서버가 알
   * 필요가 없게 하기 위해서다.
   *
   * 여는 조건은 본문과 같다 — **무료공개 중**일 때만. 아니면 404 이고,
   * nginx 는 `ssi_silent_errors` 로 조용히 넘어간다(지금과 같은 화면).
   *
   * 주소는 **배포가 알려 준다**(`PUBLIC_APP_URL`·`PUBLIC_API_URL`).
   * 없으면 프록시가 준 `X-Forwarded-*` 로 짐작한다 — 그 헤더는 우리
   * nginx 가 붙인다. 둘 다 없으면 상대 경로가 되어 카드가 그림을 못 받는데,
   * 그때는 **없는 것보다 나쁘지 않다**(글자 카드는 뜬다).
   */
  @Get(':publishId/og.html')
  async og(
    @Param('publishId') publishId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const slug = PublicPublishController.slug(publishId);
    const src = await this.publish.ogSource(slug);
    const hdr = (n: string) => {
      const v = req.headers[n];
      return (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim() ?? '';
    };
    const proto = hdr('x-forwarded-proto') || 'https';
    const appOrigin = (process.env.PUBLIC_APP_URL
      || (hdr('x-forwarded-host') ? `${proto}://${hdr('x-forwarded-host')}` : '')).replace(/\/+$/, '');
    const apiOrigin = (process.env.PUBLIC_API_URL
      || (req.headers.host ? `${proto}://${req.headers.host}` : '')).replace(/\/+$/, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // 저자가 이름을 고치면 카드도 따라와야 한다 — 길게 캐시하지 않는다.
    res.setHeader('Cache-Control', 'public, max-age=60');
    return buildOgFragment({
      publishId: slug,
      title: src.title,
      doc: src.doc,
      hasPreview: src.hasPreview,
      appOrigin,
      apiOrigin,
    });
  }

  /**
   * 퍼블리싱된 맵의 **사진·첨부** — `:publishId` 보다 **먼저** 선언한다.
   * 아래에 두면 `abc/attachments/…` 가 `:publishId` 로 잡히지는 않지만,
   * 순서를 지켜 두는 편이 나중에 안전하다(attachments 컨트롤러와 같은 규칙).
   *
   * 이 문이 없으면 퍼블리싱된 맵은 **사진 자리마다 깨진 채로** 열린다 —
   * 사진은 이제 대부분 서버 저장소에 있고 그 주소는 인증을 요구한다.
   * 여는 조건은 `openPublished` 한 곳에 있다.
   */
  @Get(':publishId/attachments/:attachmentId')
  async attachment(
    @Param('publishId') publishId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const slug = PublicPublishController.slug(publishId);
    await sendAttachment(req, res,
      (range) => this.attachments.openPublished(slug, attachmentId, range));
  }

  /**
   * 미리보기 실루엣 — **비인증**. 링크 카드(Open Graph)와 목록 썸네일이
   * 이 주소를 그대로 쓴다. `:publishId` 보다 먼저 선언한다.
   *
   * 캐시를 길게 잡지 않는다 — 저자가 "다시 만들기" 를 누르면 **같은
   * 주소의 내용이 바뀐다.** 오래 캐시하면 낡은 그림이 남는다.
   */
  @Get(':publishId/preview.png')
  async preview(@Param('publishId') publishId: string, @Res() res: Response) {
    const stream = await this.publish.openPreview(PublicPublishController.slug(publishId));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    stream.pipe(res);
  }

  @Get(':publishId')
  getPublished(@Param('publishId') publishId: string) {
    return this.publish.getPublished(PublicPublishController.slug(publishId));
  }
}
