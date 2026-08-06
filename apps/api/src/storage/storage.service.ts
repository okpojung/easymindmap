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
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { AppEnv } from '../config/env.validation';

const STORAGE_HINT =
  '첨부 저장소에 접근할 수 없습니다. 서버 저장소 디렉터리(STORAGE_LOCAL_DIR)와 ' +
  'NFS 마운트 상태를 확인해 주세요.';

export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract stream(key: string): Promise<ReadStream>;
  abstract delete(key: string): Promise<void>;

  // ── 청크 업로드가 쓰는 스트림 계열 (2026-08-06, §12) ──────────────
  // 조각을 **메모리에 담지 않고** 흘려 보내기 위한 최소 집합이다.
  // S3 호환 드라이버는 이 다섯 개를 멀티파트 업로드로 구현하면 된다.

  /** 읽기 스트림을 그대로 key 에 쓴다 → 실제로 쓴 바이트 수 */
  abstract putStream(key: string, src: Readable): Promise<number>;
  /** key 의 크기 (없으면 null) */
  abstract size(key: string): Promise<number | null>;
  /** srcKeys 를 **순서대로 이어붙여** destKey 로 → 합친 바이트 수 */
  abstract concat(destKey: string, srcKeys: string[]): Promise<number>;
  /** 작은 파일 읽기 (meta.json 전용 — 큰 파일에 쓰지 말 것) */
  abstract readSmall(key: string): Promise<Buffer | null>;
  /** prefix 아래의 **바로 다음 단계 이름들** (없으면 빈 배열) */
  abstract listChildren(prefix: string): Promise<string[]>;
  /** prefix 아래를 통째로 지운다 (없어도 조용히 성공) */
  abstract deletePrefix(prefix: string): Promise<void>;
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

  // ── 스트림 계열 (청크 업로드) ─────────────────────────────────────

  async putStream(key: string, src: Readable): Promise<number> {
    const p = this.pathOf(key);
    try {
      await mkdir(dirname(p), { recursive: true });
    } catch {
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
    // **pipeline 으로 흘린다** — 파일 크기와 무관하게 메모리는 상수다.
    // 중간에 끊기면 반쪽 파일이 남는데, 조각 PUT 은 멱등이라 다시 보내면
    // 덮어쓴다. 그래도 크기가 안 맞는 채로 남지 않도록 호출부가 검사한다.
    await pipeline(src, createWriteStream(p));
    return (await this.size(key)) ?? 0;
  }

  async size(key: string): Promise<number | null> {
    try {
      const s = await stat(this.pathOf(key));
      return s.isFile() ? s.size : null;
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      return null;
    }
  }

  async concat(destKey: string, srcKeys: string[]): Promise<number> {
    const dest = this.pathOf(destKey);
    try {
      await mkdir(dirname(dest), { recursive: true });
    } catch {
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
    // 'a' 로 열고 조각을 차례로 흘린다 — 조각 하나 크기만 오간다.
    // 이미 있던 파일에 덧붙지 않도록 먼저 지운다.
    await rm(dest, { force: true });
    let total = 0;
    for (const k of srcKeys) {
      const src = this.pathOf(k);
      await pipeline(createReadStream(src), createWriteStream(dest, { flags: 'a' }));
      total += (await stat(src)).size;
    }
    return total;
  }

  async readSmall(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      return null;
    }
  }

  async listChildren(prefix: string): Promise<string[]> {
    try {
      return await readdir(this.pathOf(prefix));
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      return [];
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    try {
      await rm(this.pathOf(prefix), { recursive: true, force: true });
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(STORAGE_HINT);
    }
  }
}
