/**
 * 검색어를 **SQL 에 넣을 수 있는 모양으로** 다듬는다 (2026-09-17).
 *
 * 문서함 검색(`MapsService.list`·`listShared`)과 지식창고 검색
 * (`PublishService.listListed`)이 같은 규칙을 쓰게 하려고 한 자리에 모았다.
 * 검색은 세 곳에 있지만 **다듬는 규칙은 한 벌**이어야 한다 — 두 벌이면
 * 언젠가 한쪽만 고쳐진다.
 *
 * ★ 제어문자를 지우는 이유 — **NUL 하나로 500 이 났다** (2026-09-17 실측).
 *   PostgreSQL 의 `text` 는 NUL 을 담지 못해, 파라미터로 들어가는 순간
 *   `22021 character_not_in_repertoire` 로 질의가 통째로 터진다. 지식창고
 *   검색은 **비인증**이라 누구나 `?q=a%00b` 를 보낼 수 있었고, 문서함
 *   검색도 로그인만 하면 같은 일이 났다(둘 다 실측으로 확인).
 *   거절하지 않고 **지우고 계속하는** 쪽을 골랐다 — 사용자가 일부러 넣는
 *   글자가 아니고, 400 을 돌려줘도 사용자가 할 수 있는 일이 없다.
 *
 * ★ 길이를 자르는 이유 — 긴 패턴은 ILIKE 비용만 키우고 찾는 데는 쓸모가
 *   없다. 역시 거절하지 않고 자른다(`limit` 을 다루는 방식과 같다).
 *
 * ★ **정규식 대신 코드포인트로 비교한다.** 문자 집합에 이스케이프를 적으면
 *   편집 도구를 거치면서 그 문자 자체로 바뀌는 사고가 난다(이 파일에서
 *   실제로 겪었다 — 소스에 진짜 NUL 이 들어가 git 이 바이너리로 보았다).
 *   범위 비교는 그럴 자리가 없다.
 */

/** 검색어 기본 상한. 한글 100자면 어떤 검색어보다 길다 */
export const SEARCH_TERM_MAX = 100;

/** C0 제어문자(NUL·탭·줄바꿈 …)와 DEL 인가 */
function isControl(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x20 || c === 0x7f;
}

/**
 * 사용자가 보낸 검색어 → 쓸 수 있는 검색어.
 * 빈 말(공백뿐·제어문자뿐)이면 `''` 이고, 부르는 쪽은 그걸 "검색 안 함"
 * 으로 본다.
 *
 * 탭·줄바꿈도 제어문자라 함께 지운다 — 한 줄짜리 검색어에 들어갈 일이
 * 없고, 들어가면 색인의 줄 구분과 섞여 뜻이 흐려진다.
 */
export function searchTerm(raw: unknown, max = SEARCH_TERM_MAX): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw) if (!isControl(ch)) out += ch;
  return out.trim().slice(0, max);
}

/**
 * `ILIKE ... ESCAPE '\'` 에 넣을 패턴.
 *
 * 패턴 문자(`%`·`_`)와 이스케이프 문자(`\`)를 막는다. 안 막으면 `_` 하나로
 * **아무 한 글자나** 걸리고 `%` 하나로 전부가 걸린다.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
