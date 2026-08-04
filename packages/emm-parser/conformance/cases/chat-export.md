# 홈서버 백업 전략 정리

**User:** Anonymous  
**Created:** 1/15/2026 10:00:00  
**Updated:** 1/15/2026 10:40:00  
**Exported:** 1/15/2026 11:00:00  
**Link:** [https://chatgpt.com/c/00000000-0000-0000-0000-000000000000](https://chatgpt.com/c/00000000-0000-0000-0000-000000000000)  

> 합성 코퍼스 — ChatGPT 대화 내보내기 **형식**(헤더 블록 + Prompt/Response
> 반복 + 인용 응답 + 링크 + 코드)을 재현한 창작 예시입니다.

## Prompt:
2026. 1. 15. 오전 10:00:01

집에 있는 미니 PC 한 대로 사진과 문서를 안전하게 백업하는 방법을 초보자 수준으로 자세히 설명해줘

## Response:
2026. 1. 15. 오전 10:00:05

> **홈서버 백업의 3-2-1 원칙**
>
> 데이터 사본을 **3개** 유지하고, 서로 다른 **2가지** 매체에 저장하며, 그중 **1개**는 집 밖(오프사이트)에 둡니다. 이 원칙만 지켜도 화재·도난·디스크 고장 대부분을 견딜 수 있습니다.
>
> **참고 자료**
>
> [3-2-1 backup rule overview](https://example.com/backup-321)
> [Choosing NAS vs external drive](https://example.com/nas-vs-drive)

핵심 단계는 다음과 같습니다.

**1단계 — 로컬 1차 사본**

외장 SSD에 주 1회 전체 복사본을 만듭니다.

```bash
rsync -a --delete /home/user/photos/ /mnt/backup/photos/
rsync -a --delete /home/user/docs/   /mnt/backup/docs/
```

**2단계 — 버전 보존**

실수로 지운 파일을 되살리려면 스냅샷 도구를 씁니다.

```bash
restic init --repo /mnt/backup/restic
restic backup /home/user/photos /home/user/docs
restic snapshots
```

**3단계 — 오프사이트 사본**

- 클라우드 저장소 1곳에 암호화 후 동기화
- 또는 외장 디스크를 매월 교대로 회사 사물함에 보관

## Prompt:
2026. 1. 15. 오전 10:20:11

복구 연습은 어떻게 해?

## Response:
2026. 1. 15. 오전 10:20:15

> **복구 리허설이 백업의 완성입니다**
>
> 백업이 있어도 복구를 해 본 적이 없다면 절반만 준비된 것입니다. 분기마다 임의 파일 3개를 골라 실제로 되살려 보세요.

절차:

1. 스냅샷 목록에서 시점 선택
2. 임시 폴더로 복원
   ```bash
   restic restore latest --target /tmp/restore-test --include photos/2026-01
   ```
3. 원본과 해시 비교

| 점검 항목 | 주기 |
|-----------|------|
| 복구 리허설 | 분기 1회 |
| 디스크 SMART 검사 | 월 1회 |
| 오프사이트 교대 | 월 1회 |

이 정도면 초보자도 안전한 백업 체계를 갖출 수 있습니다.
