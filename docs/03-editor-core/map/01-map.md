# 01. MAP 기능 상세 정의 

## MAP
-문서 버전: v1.0
-작성일: 2026-04-05

### 1. 기능 목적

* 사용자가 **마인드맵 문서(Map)** 를 생성하고 관리하기 위한 최상위 기능
* Node, Layout, Save, Collaboration, Export, Publish 등의 모든 기능이 연결되는 **기준 단위**
* 하나의 Map은 하나의 주제, 문서, 프로젝트, 작업 공간을 의미한다

---

### 2. 기능 범위

#### 포함

* Map 생성
* Map 조회/열기
* Map 기본 정보 수정
* Map 삭제
* Map 유형 관리 (`personal`, `collaborative`)
* Map 기본 설정 관리
* Map 복제

#### 제외

* 노드 생성/수정/삭제
* 노드 내용 편집
* 레이아웃 계산
* 자동 저장/버전 저장
* 발행(Publishing) 및 공유 세부 정책
* 협업 실시간 동기화

---

### 3. 세부 기능 목록

| 기능ID   | 기능명       | 설명                     | 주요 동작            |
| ------ | --------- | ---------------------- | ---------------- |
| MAP-01 | Map 생성    | 새 마인드맵 생성              | root node 자동 생성  |
| MAP-02 | Map 조회    | 기존 Map 열기              | 전체 node 로드 및 렌더링 |
| MAP-03 | Map 수정    | 이름, 설명, 기본 설정 변경       | 즉시 반영            |
| MAP-04 | Map 삭제    | Map 삭제 처리              | soft delete      |
| MAP-05 | Map 유형 설정 | 개인 맵/협업 맵 지정           | 권한 구조에 영향        |
| MAP-06 | Map 복제    | 기존 Map 전체 복사           | 새 map_id 생성      |
| MAP-07 | Map 기본 설정 | 기본 layout, 기본 스타일 등 설정 | 신규 node 기본값에 영향  |

---

### 4. 기능 정의 (What)

MAP 기능은 **마인드맵 문서 자체를 생성, 식별, 관리하는 기능**이다.

* 하나의 Map은 여러 Node를 포함한다
* 모든 Node는 반드시 하나의 Map에 소속된다
* 모든 편집/저장/협업/발행 기능은 `map_id`를 기준으로 동작한다
* Map은 반드시 **root node 1개**를 가진다

---

### 5. 동작 방식 (How)

#### 5.1 Map 생성

1. 사용자가 “새 맵 만들기”를 선택한다
2. 맵 이름, 설명, 맵 유형을 입력한다
3. 시스템은 새 `map_id`를 생성한다
4. 시스템은 root node를 자동 생성한다
5. 기본 layout 및 초기 설정을 적용한다
6. 생성 완료 후 편집 화면으로 진입한다

#### 5.2 Map 열기

1. 사용자가 맵 목록에서 특정 맵을 선택한다
2. 시스템은 Map 기본 정보와 Node 데이터를 조회한다
3. 저장 구조를 편집/렌더링 구조로 변환한다
4. layout 계산 후 canvas에 표시한다

#### 5.3 Map 수정

1. 사용자가 Map 제목, 설명, 설정을 수정한다
2. 시스템은 변경 내용을 검증한다
3. 정상일 경우 저장하고 즉시 화면에 반영한다

#### 5.4 Map 삭제

1. 사용자가 삭제를 요청한다
2. 시스템은 권한을 확인한다
3. 실제 물리 삭제 대신 soft delete 처리한다
4. 기본 목록에서는 숨긴다

---

### 6. 규칙 (Rule)

## 6.1 기본 구조 규칙

* Map은 반드시 root node 1개를 포함해야 한다
* root node는 Map 생성 시 자동 생성된다
* root node가 없는 Map은 유효하지 않다
* 모든 node는 반드시 하나의 `map_id`에 소속되어야 한다

## 6.2 생성 규칙

* Map 생성 시 기본 `map_type`은 `personal`이다
* 기본 화면 표시명은 다음과 같다

  * `personal` → **개인 맵**
  * `collaborative` → **협업 맵**
* Map 생성 직후 root node를 자동 생성해야 한다
* 맵 이름이 비어 있으면 임시 기본 이름을 부여할 수 있다

  * 예: `Untitled Map`

## 6.3 수정 규칙

* 제목, 설명, 설정은 권한이 있는 사용자만 수정 가능하다
* `map_type` 변경은 권한 정책 검증 후 허용한다
* `personal`에서 다른 사용자를 편집 참여자로 추가하면 `collaborative` 전환이 가능해야 한다
* `collaborative`는 협업 기능과 권한 기능의 전제가 된다

## 6.4 삭제 규칙

* Map 삭제는 기본적으로 soft delete로 처리한다
* 삭제된 Map은 일반 조회 목록에서 보이지 않아야 한다
* 삭제된 Map에 속한 node 역시 일반 편집 대상에서 제외된다
* 삭제 복구 가능 여부는 VERSION_HISTORY / 휴지통 정책과 연계하여 별도 정의한다

## 6.5 map_type 규칙

| 값             | 화면 표시 | 설명                     |
| ------------- | ----- | ---------------------- |
| personal      | 개인 맵  | 기본적으로 한 사용자가 작성/관리하는 맵 |
| collaborative | 협업 맵  | 여러 사용자가 함께 편집 가능한 맵    |

### 세부 규칙

* `personal`은 기본 생성 유형이다
* `personal` 맵도 향후 publish 가능하다
* `collaborative` 맵도 publish 가능하다
* `map_type`은 “편집 운영 방식”을 의미하며, publish 상태와는 별개이다
* `collaborative`는 사용자 초대, 권한, 실시간 동기화와 연결된다
* `personal`이라고 해서 반드시 외부 공개 불가를 의미하지는 않는다

## 6.6 Publishing 규칙 (강화 버전)

### 6.6.1 개념 정의

* Publishing은 Map을 **외부에 읽기 전용으로 공개하는 기능**이다
* Publishing은 Map의 `map_type`과 **완전히 독립적인 개념**이다
* `personal` / `collaborative` 맵 모두 publish 가능하다

---

### 6.6.2 Publishing 상태 정의

| 상태          | 설명                   |
| ----------- | -------------------- |
| unpublished | 발행되지 않음              |
| restricted  | 지정된 사용자만 viewer 접근   |
| link-public | URL을 아는 모든 사용자 접근    |
| embed       | iframe 또는 외부 페이지 삽입용 |

---

### 6.6.3 핵심 규칙

#### 접근 관련

* publish된 Map은 기본적으로 **viewer 전용 (읽기 전용)** 이다
* publish 화면에서는 다음 기능을 제공하지 않는다:

  * node 생성/삭제
  * node 이동
  * 스타일 변경
  * 협업 기능

---

#### map_type과 관계

* `personal` 맵도 publish 가능
* `collaborative` 맵도 publish 가능
* publish 여부는 협업 여부와 무관하다

---

#### 데이터 동기화

* publish된 Map은 **원본 Map의 최신 상태를 반영**해야 한다
* 별도의 복사본을 생성하지 않는다 (기본 정책)
* 단, 향후 snapshot publish는 확장 기능으로 고려 가능

---

#### URL 정책

* publish URL은 다음 특성을 가진다:

  * 추측 불가능한 토큰 기반
  * 필요 시 재발급 가능
  * 비활성화 가능

---

#### iframe 정책

* embed 모드는 다음을 만족해야 한다:

  * 편집 UI 제거
  * 협업 UI 제거
  * 최소 viewer UI만 제공
  * 외부 도메인에서도 정상 표시

---

#### 검색 노출 정책 (옵션)

* link-public publish는:

  * 검색엔진 노출 여부 설정 가능
  * 기본값은 “비노출(noindex)” 권장

---

#### 보안 정책

* restricted publish는 반드시 인증/권한 체크 필요
* link-public은 URL 기반 접근 허용 (로그인 없이 가능)
* 민감 데이터 포함 시 publish 제한 가능

---

## 6.7 ID 및 식별 규칙

* `map_id`는 전역 고유값이어야 한다
* UUID 사용을 권장한다
* `node_id`는 최소한 map 범위 내에서 유일해야 한다
* 모든 하위 데이터는 `map_id` 기준으로 조회 가능해야 한다

---

### 7. 예외 / 경계 (Edge Case)

Edge Case는 “이 기능이 실패하거나 이상 상황일 때 시스템이 어떻게 안전하게 처리할지”를 정의하는 부분이다. 기준 유형은 빈 값, 최대값, 중복, 권한 없음, 존재하지 않음, 충돌, 장애, 금지 대상 등을 포함한다. 

#### 7.1 빈 값 / 누락 값

* 맵 이름 없이 생성

  * 기본 이름 자동 부여 또는 생성 차단
* map_type 누락

  * 기본값 `personal` 적용

#### 7.2 최소값 / 최대값

* 맵 이름 최대 길이 초과

  * 저장 차단 + 오류 메시지
* 설명 최대 길이 초과

  * 저장 차단 또는 입력 제한

#### 7.3 중복 상황

* 동일 사용자가 같은 이름의 Map 여러 개 생성

  * 허용 가능
  * 단, 목록에서 구분값(생성일/수정일) 제공 권장

#### 7.4 권한 없음

* viewer가 Map 수정 시도

  * 차단 + 읽기 전용 안내
* editor가 삭제 권한 없이 삭제 시도

  * 차단

#### 7.5 존재하지 않음 / 삭제됨

* 존재하지 않는 `map_id` 접근

  * 404 또는 접근 불가 처리
* 이미 삭제된 Map 접근

  * 복구 권한이 없으면 조회 불가

#### 7.6 충돌 상황

* 협업 중 한 사용자가 Map 이름 수정, 다른 사용자가 설정 수정

  * 필드 단위 병합 또는 최신값 정책 정의 필요
* 한 사용자가 Map 삭제, 다른 사용자가 편집 중

  * 삭제 우선 시 편집 차단 및 안내

#### 7.7 네트워크 / 시스템 장애

* Map 생성 중 저장 실패

  * 생성 실패 안내, 부분 생성 방지 필요
* Map 로딩 중 장애

  * 재시도 / 임시 오류 안내 / 캐시 fallback 고려

#### 7.8 기능상 금지 대상

* root node 없는 Map 저장 금지
* 잘못된 `map_type` 값 저장 금지
* 삭제된 Map에 새 node 추가 금지

## 🔥 7.9 Publishing 관련 Edge Case

### 7.9.1 상태 충돌

* Map이 unpublished 상태인데 publish URL 접근
  → 접근 차단 (404 또는 접근 불가)

---

### 7.9.2 권한 문제

* restricted publish인데 비허용 사용자 접근
  → 접근 차단 + 로그인 유도

---

### 7.9.3 URL 관련

* 만료된 publish token 접근
  → 접근 불가 처리
* 재발급된 URL로 이전 URL 접근
  → 차단

---

### 7.9.4 데이터 변경 중

* 사용자가 Map 수정 중 publish viewer 접근
  → 최신 저장 기준으로 표시 (dirty state 노출 금지)

---

### 7.9.5 삭제/비활성화

* Map 삭제 후 publish URL 접근
  → 접근 불가
* publish 해제 후 기존 URL 접근
  → 접근 불가

---

### 7.9.6 협업 충돌

* 협업 중 Map 내용 변경 + publish viewer 열람
  → 최신 상태 반영 (실시간 또는 일정 주기 sync)

---

### 7.9.7 네트워크 장애

* publish viewer 로딩 실패
  → 재시도 / fallback 메시지

---

### 7.9.8 금지 대상

* root node 없는 Map publish 금지
* 손상된 데이터 상태 publish 금지

---

---

### 8. 권한 규칙

| 역할      | Map 조회 | Map 수정 | Map 삭제 | 유형 변경  | 협업자 초대 |
| ------- | ------ | ------ | ------ | ------ | ------ |
| creator | 가능     | 가능     | 가능     | 가능     | 가능     |
| editor  | 가능     | 일부 가능  | 불가(기본) | 불가(기본) | 불가(기본) |
| viewer  | 가능     | 불가     | 불가     | 불가     | 불가     |

#### 추가 규칙

* `collaborative` 맵은 사용자별 역할 관리가 필요하다
* `personal` 맵은 기본적으로 creator 단독 관리 구조를 가진다
* `personal` → `collaborative` 전환 시 권한 테이블/초대 정보가 필요할 수 있다

---

### 9. DB 영향

#### 관련 테이블

* `maps`
* `nodes`
* 향후 협업 연계:

  * `map_members`
  * `map_permissions`
  * `map_publish`

#### maps 테이블 예시

```sql
maps (
  map_id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  map_type ENUM('personal','collaborative') NOT NULL DEFAULT 'personal',
  layout_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false
)
```
#### maps 테이블 확장 (추천)

```sql
publish_status ENUM(
  'unpublished',
  'restricted',
  'link-public',
  'embed'
) DEFAULT 'unpublished',

publish_token VARCHAR(255),
publish_enabled BOOLEAN DEFAULT false,
publish_allow_iframe BOOLEAN DEFAULT false
```

#### restricted용 (필요 시)

```sql
map_publish_permissions
- id
- map_id
- user_id
- role ('viewer')
```

#### 생성 시 영향

* `maps` 신규 insert
* root node 자동 insert

#### 수정 시 영향

* `name`, `description`, `map_type`, `layout_type`, `updated_at` 변경 가능

#### 삭제 시 영향

* `is_deleted = true`
* 관련 node / 협업 / 발행 데이터의 조회 정책도 함께 영향 받음

---

### 10. API 영향

#### 10.1 Map 생성

```http
POST /maps
```

요청 예시

```json
{
  "name": "Ubuntu 설치 절차",
  "description": "초보자용 설치 가이드",
  "map_type": "personal"
}
```

응답 예시

```json
{
  "map_id": "uuid",
  "name": "Ubuntu 설치 절차",
  "map_type": "personal",
  "display_map_type": "개인 맵"
}
```

#### 10.2 Map 조회

```http
GET /maps/{map_id}
```

#### 10.3 Map 수정

```http
PATCH /maps/{map_id}
```

수정 가능 항목 예시

* `name`
* `description`
* `map_type`
* `layout_type`

#### 10.4 Map 삭제

```http
DELETE /maps/{map_id}
```

#### 10.5 Map 복제

```http
POST /maps/{map_id}/duplicate
```

# ✅ 10.6. API 영향 (Publishing 최소 정의)

MAP 문서에서는 간단히 연결만

---

### Publish 설정

```http
POST /maps/{map_id}/publish
```

---

### Publish 조회

```http
GET /maps/{map_id}/publish
```

---

### Publish 해제

```http
DELETE /maps/{map_id}/publish
```

---

### Viewer 접근

```http
GET /published/{token}
```


---

### 11. 연관 기능

* NODE_EDITING
* NODE_CONTENT
* LAYOUT
* SAVE
* HISTORY_UNDO_REDO
* VERSION_HISTORY
* MAP COLLABORATION
* PUBLISH_SHARE
* EXPORT
* IMPORT

---

### 12. 예시 시나리오

#### 시나리오 1. 개인 맵 생성

1. 사용자가 새 맵 만들기를 선택한다
2. 맵 이름을 “Linux 공부”로 입력한다
3. map_type은 기본값 `personal`로 생성된다
4. 화면에는 “개인 맵”으로 표시된다
5. root node가 자동 생성되어 편집 화면이 열린다

#### 시나리오 2. 협업 맵 생성

1. 사용자가 새 맵 만들기에서 `collaborative`를 선택한다
2. 맵 생성 후 다른 사용자를 초대한다
3. 초대된 사용자는 권한에 따라 편집 또는 보기만 가능하다
4. 화면에는 “협업 맵”으로 표시된다

#### 시나리오 3. 개인 맵을 협업 맵으로 전환

1. 기존 `personal` 맵을 사용 중이다
2. 소유자가 팀원 2명을 초대하려고 한다
3. 시스템은 `map_type`을 `collaborative`로 변경하도록 유도한다
4. 권한 설정 후 협업 편집이 가능해진다

---

### 13. 구현 우선순위

| 항목                                | 우선순위 | 비고                |
| --------------------------------- | ---- | ----------------- |
| Map 생성/조회/수정/삭제                   | MVP  | 필수                |
| map_type = personal/collaborative | MVP  | 필수                |
| root node 자동 생성                   | MVP  | 필수                |
| Map 복제                            | 2차   | 유용                |
| personal ↔ collaborative 전환 정책    | 2차   | 협업 기능과 연계         |
| 발행과의 정합성 연결                       | 2차   | PUBLISH_SHARE와 연계 |

---
