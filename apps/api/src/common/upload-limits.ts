import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// 업로드(multipart) 한도 — 첨부·퍼블리싱 미리보기가 함께 쓴다 (2026-09-12).
//
// ★ **왜 두는가** — multer 의 위험한 기본값은 전부 `Infinity` 다.
//   `multer 2.3.0` 은 필드 이름으로 메모리를 부풀리는 공격을 막을 **손잡이를
//   주기만 하고**, 기본값은 여전히 `Infinity` 다(GHSA-535w-7cp7-47q4).
//   그래서 **올리는 것만으로는 안 막힌다** — 여기서 값을 정해 줘야 한다.
//
//   막는 것은 두 가지다.
//   ① `a[999999999]=x` 한 줄이 길이 10억짜리 성긴 배열을 만든다. 만드는 쪽은
//      몇 바이트, 받는 쪽은 그 배열을 훑거나 JSON 으로 만들 때 메모리·CPU 를
//      통째로 쓴다 → `fieldArrayIndexLimit`.
//   ② `a[b][c][d]…` 로 깊이를 늘려 같은 일을 한다 → `fieldNestingDepth`.
//
// ★ **왜 이 값인가** — 우리 업로드 폼이 보내는 필드는 `file` **하나뿐**이고
//   배열도 중첩도 쓰지 않는다(`attachments.controller.ts` ·
//   `publish.controller.ts`). 0 으로 둘 수도 있지만, 나중에 `tags[0]` 같은
//   평범한 필드를 더할 때 막히지 않도록 넉넉한 작은 수로 둔다.
//
// ★ **파일 크기는 여기서 막지 않는다.** 한도를 넘겼을 때 사용자에게 보이는
//   문장을 우리가 쥐고 있기 때문이다 — `attachments.controller.ts` 가
//   `ATTACHMENT_MAX_MB` 로 재서 "첨부 1개는 최대 N MB 까지입니다" 를 낸다.
//   여기에 `fileSize` 를 넣으면 그 자리 대신 multer 가 먼저 끊어
//   `LIMIT_FILE_SIZE` 가 500 으로 나간다.
//
// ★ **왜 캐스팅이 있나** — 두 한도 모두 multer 런타임은 받아들이지만
//   `@nestjs/platform-express` 의 `MulterOptions['limits']` 타입에는 아직
//   `fieldNestingDepth` · `fieldArrayIndexLimit` 가 없다(`@types/multer` 는
//   앞엣것만 안다). **타입이 런타임보다 뒤처진 것**이라, 부르는 쪽마다
//   캐스팅을 흩뿌리지 않고 여기 한 자리에서만 좁힌다. 타입이 따라오면
//   `as unknown as` 를 지우면 된다.
export const UPLOAD_LIMITS = {
  /** `a[3]` 의 3 — 이보다 큰 첨자는 거절한다 (multer 2.3.0+) */
  fieldArrayIndexLimit: 100,
  /** `a[b][c]` 는 2단계 */
  fieldNestingDepth: 4,
} as unknown as MulterOptions['limits'];
