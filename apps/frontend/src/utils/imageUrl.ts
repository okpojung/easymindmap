// 원격 사진 주소를 **받으러 가도 되는가** (2026-09-30 실사용 보고).
//
// 우리 문서를 담은 맵에는 `![](https://…png)` · `![배경](https://...)` ·
// `![대체](http URL)` 같은 **자리표시 주소**가 본문에 그대로 있다. 이런 주소로
// 사진을 받으러 가면 서버는 `getaddrinfo ENOTFOUND` 를 돌려주고, 브라우저는
// `ERR_INVALID_URL` 로 `<img>` 의 onload·onerror 어느 쪽도 부르지 않아 불러오기가
// **영원히 끝나지 않았다**(2,847노드 맵 MD 불러오기 — 160초 뒤에도 빈 채).
// 그래서 받으러 가기 전에 주소부터 가른다: URL 로 파싱되고 호스트에 글자가
// 있어야 한다. 아니면 링크로만 남긴다(주소는 잃지 않는다).

/** http(s) 이고 URL 로 파싱되며 호스트가 점·빈 문자열이 아닌 주소만 true */
export function isFetchableImageUrl(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    const u = new URL(src);
    return /[a-z0-9]/i.test(u.hostname);
  } catch {
    return false;
  }
}
