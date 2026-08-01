import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { NodesService } from './nodes.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { MoveNodeDto } from './dto/move-node.dto';
import { LayoutNodeDto } from './dto/layout-node.dto';
import { AutosaveDto } from './dto/autosave.dto';

/**
 * 노드 API — 맵 스코프(생성·autosave)와 노드 스코프(수정·삭제·이동·레이아웃)
 * 를 한 컨트롤러에서 처리. 전역 /v1 프리픽스 적용. 모든 엔드포인트 인증 필요.
 */
@Controller()
@UseGuards(AuthGuard)
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Post('maps/:mapId/nodes')
  create(
    @CurrentUser() user: AuthUser,
    @Param('mapId', ParseUUIDPipe) mapId: string,
    @Body() dto: CreateNodeDto,
  ) {
    return this.nodes.create(user.id, mapId, dto);
  }

  @Patch('maps/:mapId/nodes')
  autosave(
    @CurrentUser() user: AuthUser,
    @Param('mapId', ParseUUIDPipe) mapId: string,
    @Body() dto: AutosaveDto,
  ) {
    return this.nodes.autosave(user.id, mapId, dto);
  }

  @Patch('nodes/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNodeDto,
  ) {
    return this.nodes.update(user.id, id, dto);
  }

  @Delete('nodes/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.remove(user.id, id);
  }

  @Patch('nodes/:id/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveNodeDto,
  ) {
    return this.nodes.move(user.id, id, dto);
  }

  @Patch('nodes/:id/layout')
  layout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LayoutNodeDto,
  ) {
    return this.nodes.setLayout(user.id, id, dto.layoutType);
  }
}
