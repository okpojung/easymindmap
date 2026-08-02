// 첨부 저장소 추상화 (B9 — 방식 A).
//
// 앱 코드는 이 추상 클래스만 사용한다 — 파일이 실제로 어디에 저장되는지
// (로컬 디스크·NFS 마운트·S3 호환 오브젝트 스토리지)는 드라이버가 정한다.
//   · STORAGE_DRIVER=local (기본) : STORAGE_LOCAL_DIR 디렉터리에 파일로 저장.
//     dev 서버는 이 디렉터리를 NAS 의 NFS 마운트(/mnt/nas/...)로 두면
//     데이터가 NAS 에 쌓인다 — 드라이버는 디렉터리가 SSD 인지 NFS 인지
//     구분하지 않는다 (docs/05-implementation/dev-server-runbook.md).
//   · S3 호환 드라이버는 향후 추가 (MinIO·R2·클라우드 오브젝트 스토리지) —
//     이 인터페이스 구현체 하나만 더 만들면 앱 코드는 그대로다.
//
// key 는 서버가 UUID 로만 조립한다 (사용자 입력이 경로에 들어가지 않음).

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import type { AppEnv } from '../config/env.validation';

const STORAGE_HINT =
  '첨부 저장소에 접근할 수 없습니다. 서버 저장소 디렉터리(STORAGE_LOCAL_DIR)와 ' +
  'NFS 마운트 상태를 확인해 주세요.';

export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract stream(key: string): Promise<ReadStream>;
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class LocalDiskStorage extends StorageService {
  private readonly baseDir: string;

  constructor(config: ConfigService<AppEnv, true>) {
    super();
    this.baseDir = config.get('STORAGE_LOCAL_DIR', { infer: true });
  }

  // key 가 baseDir 밖을 가리키지 못하게 한다 (../ 차단) — key 는 서버가
  // UUID 로 만들지만, 방어선은 저장소 계층에도 둔다.
  private pathOf(key: string): string {
    const p = normalize(join(this.baseDir, key));
    if (!p.startsWith(normalize(this.baseDir))) {
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
    return p;
  }

  async put(key: string, data: Buffer): Promise<void> {
    try {
      const p = this.pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, data);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
  }

  async stream(key: string): Promise<ReadStream> {
    try {
      const p = this.pathOf(key);
      await stat(p); // 없으면 여기서 throw — createReadStream 은 늦게 터진다
      return createReadStream(p);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.pathOf(key), { force: true });
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
  }
}
