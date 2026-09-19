/**
 * 퍼블리싱 뷰어(`/p/{publishId}`) 위에 **돌아갈 자리**를 그릴지 판정한다
 * (2026-09-19 사용자 지적: "지식창고에서 맵을 열면 돌아가는 버튼이 없어
 * 브라우저 뒤로가기로 돌아간다").
 *
 * ★ 왜 판정을 따로 떼나 — 이 화면에는 **두 종류의 손님**이 온다.
 *
 *   ⑴ 지식창고에서 **새 탭**으로 연 사람 — 뒤로 갈 곳이 없다. 브라우저
 *      뒤로가기 버튼이 회색이다. 이 사람에게는 자리를 줘야 한다.
 *   ⑵ 남의 블로그에 붙은 링크를 **같은 탭**에서 따라온 사람 — 뒤로가기가
 *      이미 그 블로그로 데려다준다. 이 사람에게 우리가 버튼을 하나 더
 *      얹으면 **브라우저가 이미 하는 일을 흉내 낸 가짜**가 된다.
 *
 * 그래서 규칙은 하나다 — **브라우저의 뒤로가기가 할 수 없을 때만 그린다.**
 * 판정을 화면 코드 안에 두면 눈으로만 확인하게 되는데, ⑵ 는 재현하려면
 * 다른 사이트가 필요해 손으로 확인하기 어렵다. 셈만 떼어 시험한다.
 */

/**
 * 이 탭은 **새로 열린 탭**인가.
 *
 * `history.length` 가 1 이면 이 문서가 이 탭의 **첫 장**이다 — 뒤로 갈
 * 곳이 없다. `target="_blank"` 로 연 탭이 정확히 이 모양이다.
 * (0 을 주는 브라우저도 있어 `<= 1` 로 본다.)
 */
export function isFreshTab(historyLength: number): boolean {
  return historyLength <= 1;
}

/**
 * 지식창고에서 왔는가 — 맞으면 **돌아갈 주소**(`?q=` 까지 그대로).
 *
 * ★ `document.referrer` 를 쓰는 이유: 주소에 `?from=library` 같은 꼬리표를
 *   달면 **그 주소가 복사되어 돌아다닌다** — 블로그에 붙은 링크가 "지식창고로
 *   돌아가기" 를 달고 다니게 된다. 어디서 왔는지는 브라우저가 이미 알고
 *   있으니 우리가 주소를 더럽힐 이유가 없다.
 *
 * ★ **같은 오리진일 때만** 돌려준다. 바깥에서 온 주소를 그대로
 *   `location.href` 에 넣으면 남이 우리 화면의 버튼으로 아무 데나 보낼 수
 *   있다(오픈 리다이렉트). 게다가 돌려주는 것은 **경로+쿼리**뿐이라,
 *   설령 판정이 틀려도 우리 도메인 밖으로는 못 나간다.
 *
 * @param referrer `document.referrer`
 * @param origin   `window.location.origin`
 * @returns `/library?q=회의` 같은 **같은 오리진 경로**, 아니면 null
 */
export function libraryBackHref(referrer: string, origin: string): string | null {
  if (!referrer) return null;
  let u: URL;
  try {
    u = new URL(referrer);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  const path = u.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/library') return null;
  return `${path}${u.search}`;
}
