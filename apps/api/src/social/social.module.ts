import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';

/** 소셜 로그인 보조 (카카오·네이버·구글, 2026-11-28) — social.controller.ts */
@Module({ controllers: [SocialController] })
export class SocialModule {}
