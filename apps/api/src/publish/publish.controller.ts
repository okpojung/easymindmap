import {
  BadRequestException,
  Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AttachmentsService } from '../attachments/attachments.service';
import { sendAttachment } from '../attachments/attachments.controller';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { PublishService } from './publish.service';

/**
 * 게시 · 게시 취소 · 상태 — **맵 주인의 조작**이라 인증이 필요하다.
 * 공개 조회는 인증 없는 별도 컨트롤러다 (`public-publish.controller.ts`).
 */
@Controller('maps')
@UseGuards(AuthGuard)
export class PublishController {
  constructor(private readonly publish: PublishService) {}

  @Post(':id/publish')
  @HttpCode(200)
  publishMap(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publish.publish(user.id, id);
  }

  @Delete(':id/publish')
  @HttpCode(204)
  unpublishMap(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publish.unpublish(user.id, id);
  }

  @Get(':id/publish-status')
  status(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.publish.status(user.id, id);
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
      throw new BadRequestException('잘못된 공개 링크입니다.');
    }
    return publishId;
  }

  /**
   * 공개된 맵의 **사진·첨부** — `:publishId` 보다 **먼저** 선언한다.
   * 아래에 두면 `abc/attachments/…` 가 `:publishId` 로 잡히지는 않지만,
   * 순서를 지켜 두는 편이 나중에 안전하다(attachments 컨트롤러와 같은 규칙).
   *
   * 이 문이 없으면 공개된 맵은 **사진 자리마다 깨진 채로** 열린다 —
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

  @Get(':publishId')
  getPublished(@Param('publishId') publishId: string) {
    return this.publish.getPublished(PublicPublishController.slug(publishId));
  }
}
