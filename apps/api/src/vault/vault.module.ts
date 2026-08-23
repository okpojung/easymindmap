// vault 미러 (셀프호스트 전용) — docs/04-extensions/vault-mirror.md
//
// `VAULT_DIR` 이 비어 있으면 **아무것도 하지 않는다.** 클라우드 배포에는
// 사용자의 디스크가 없으므로 켤 수 없다 (§2).

import { Module } from '@nestjs/common';
import { VaultService } from './vault.service';

@Module({
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
