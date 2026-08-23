// vault-plan — 문서함(폴더 트리 + 맵)을 **vault 의 상대 경로 표**로 바꾼다.
//
// 설계: docs/04-extensions/vault-mirror.md §3
//
// 슬라이스 1(`vault-path.ts`)이 "이름 하나를 어떻게 짓는가" 였다면, 여기는
// **"전체가 어느 자리에 놓이는가"** 다. 디스크에 손대지 않는 순수 함수다.
//
// ★ 폴더 이름도 겹친다. `map_folders` 에는 이름 unique 제약이 없어서 같은
//   부모 밑에 같은 이름의 폴더가 둘 있을 수 있다. 맵과 **같은 규칙**으로
//   가른다 — 먼저 만들어진 것이 원래 이름을 지키고 나중 것이 id 를 단다.
//   여기서 안 가르면 두 폴더의 맵이 **한 디렉터리에 섞여** 서로 덮어쓴다.

import { assignMapFileNames, shortId, vaultFolderName, vaultRelPath } from './vault-path';

export interface VaultFolderRow {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string | Date;
}

export interface VaultMapRow {
  mapId: string;
  title: string;
  /** `null` = 홈(vault 루트) */
  folderId: string | null;
  createdAt: string | Date;
}

export interface VaultPlanEntry {
  mapId: string;
  /** vault 루트 기준 상대 경로 (`연구/RAG.md`) */
  relPath: string;
}

function byCreatedThenId<T extends { createdAt: string | Date; id?: string; mapId?: string }>(
  a: T, b: T,
): number {
  const ta = new Date(a.createdAt).getTime();
  const tb = new Date(b.createdAt).getTime();
  if (ta !== tb) return ta - tb;
  const ia = a.id ?? a.mapId ?? '';
  const ib = b.id ?? b.mapId ?? '';
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

/**
 * 폴더 하나하나에 **디렉터리 이름**을 나눠 준다 — 같은 부모 안에서 겹치지 않게.
 *
 * 맵 파일 이름과 같은 규칙이다(`assignMapFileNames` 의 주석 참조):
 * 먼저 만들어진 것이 원래 이름을 지키고, 대소문자만 다른 것도 겹치는 것으로
 * 본다(macOS·Windows 에서만 나는 덮어쓰기를 리눅스 CI 로는 못 잡는다).
 */
export function assignFolderNames(folders: VaultFolderRow[]): Map<string, string> {
  const byParent = new Map<string, VaultFolderRow[]>();
  for (const f of folders) {
    const key = f.parentId ?? '';
    const list = byParent.get(key);
    if (list) list.push(f); else byParent.set(key, [f]);
  }
  const out = new Map<string, string>();
  for (const list of byParent.values()) {
    const taken = new Set<string>();
    for (const f of [...list].sort(byCreatedThenId)) {
      let name = vaultFolderName(f.name, f.id);
      if (taken.has(name.toLowerCase())) {
        name = vaultFolderName(`${name}-${shortId(f.id)}`, f.id);
      }
      taken.add(name.toLowerCase());
      out.set(f.id, name);
    }
  }
  return out;
}

/**
 * 폴더 id → 루트부터의 디렉터리 이름들.
 *
 * 부모가 없거나(지워졌거나) **고리가 생기면** 홈으로 올린다 — 지우지 않는다.
 * 트리 규칙에서 배운 것과 같다: **아무것도 버리지 않는다**
 * (`@emm/tree-rules` 의 고아 처리와 같은 원칙).
 */
export function folderPathOf(
  folderId: string | null,
  folders: Map<string, VaultFolderRow>,
  names: Map<string, string>,
): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let cur = folderId;
  while (cur) {
    if (seen.has(cur)) break;          // 고리 — 거기서 멈추고 홈 쪽으로 붙인다
    seen.add(cur);
    const f = folders.get(cur);
    if (!f) break;                     // 부모가 없다 — 홈으로 올린다
    path.unshift(names.get(cur) ?? vaultFolderName(f.name, f.id));
    cur = f.parentId;
  }
  return path;
}

/**
 * 문서함 전체 → **맵마다의 상대 경로**.
 *
 * 겹침은 두 단계로 가른다.
 *   ① 폴더 이름을 같은 부모 안에서 가른다 (`assignFolderNames`)
 *   ② 맵 파일 이름을 **같은 디렉터리 안에서** 가른다
 *
 * ②의 기준이 `folderId` 가 아니라 **디렉터리 경로**인 것이 중요하다. 폴더
 * 둘이 이름 정규화 끝에 같은 디렉터리가 되는 일은 ①이 막지만, 부모가
 * 사라져 **둘 다 홈으로 올라오는** 경우는 ①이 못 막는다. 그때도 맵이
 * 섞이지 않으려면 마지막 판정을 경로로 해야 한다.
 */
export function buildVaultPlan(
  folders: VaultFolderRow[], maps: VaultMapRow[],
): VaultPlanEntry[] {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const folderNames = assignFolderNames(folders);

  // 맵을 **디렉터리 경로별로** 모은다
  const byDir = new Map<string, { dir: string[]; maps: VaultMapRow[] }>();
  for (const m of maps) {
    const dir = folderPathOf(m.folderId, folderById, folderNames);
    const key = dir.join('/').toLowerCase();
    const bucket = byDir.get(key);
    if (bucket) bucket.maps.push(m);
    else byDir.set(key, { dir, maps: [m] });
  }

  const out: VaultPlanEntry[] = [];
  for (const { dir, maps: inDir } of byDir.values()) {
    const names = assignMapFileNames(
      inDir.map((m) => ({ mapId: m.mapId, title: m.title, createdAt: m.createdAt })),
    );
    for (const m of inDir) {
      out.push({ mapId: m.mapId, relPath: vaultRelPath(dir, names.get(m.mapId)!) });
    }
  }
  // 입력 순서와 무관하게 같은 답을 주도록 정렬해 돌려준다 (검증·로그가 안정된다)
  return out.sort((a, b) => (a.mapId < b.mapId ? -1 : a.mapId > b.mapId ? 1 : 0));
}
