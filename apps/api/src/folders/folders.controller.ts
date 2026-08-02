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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { FoldersService } from './folders.service';
import { CreateFolderDto, UpdateFolderDto } from './dto/folder.dto';

/** /v1/folders — 문서함(폴더). 모든 엔드포인트 인증 필요. */
@Controller('folders')
@UseGuards(AuthGuard)
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.folders.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto) {
    return this.folders.create(user.id, dto.name, dto.parentId ?? null);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFolderDto,
  ) {
    return this.folders.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.folders.remove(user.id, id);
  }
}
