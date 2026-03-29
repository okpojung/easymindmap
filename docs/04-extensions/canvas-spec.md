easymindmap — CANVAS 기능 상세 명세

최종 업데이트: 2026-03-23
관련 문서: feature-spec.md


목차

기능 목록 전체
인터랙션 매핑 (단축키 / 마우스 / 툴바)
우클릭 컨텍스트 메뉴 정의
각 기능 상세 설계

CANVAS-01 Zoom In
CANVAS-02 Zoom Out
CANVAS-03 Fit Screen
CANVAS-04 Pan Canvas
CANVAS-05 Center Node
CANVAS-06 100% View
CANVAS-07 Fullscreen Mode
CANVAS-08 Focus Node View


Zoom 레벨 정책
상태 전이 다이어그램


1. 기능 목록 전체

기능ID
기능명
설명
단계

CANVAS-01
Zoom In
캔버스 확대
V1


CANVAS-02
Zoom Out
캔버스 축소
V1


CANVAS-03
Fit Screen
전체 맵을 화면에 맞춤
V1


CANVAS-04
Pan Canvas
손바닥 모드로 캔버스 이동
V1


CANVAS-05
Center Node
선택 노드를 화면 중앙으로 이동 (줌 유지)
V1


CANVAS-06
100% View
줌 배율을 100%로 초기화
V1


CANVAS-07
Fullscreen Mode
브라우저 전체화면 전환 / ESC 종료
V1


CANVAS-08
Focus Node View
선택 노드+하위만 표시, 상위 노드 숨김
V1

2. 인터랙션 매핑
2-1. 툴바 아이콘 + 단축키 + 마우스 통합 테이블

기능ID
기능명
툴바 아이콘
단축키
마우스
기타 제스처

CANVAS-01
Zoom In
+ 버튼
Ctrl + =
Ctrl + 휠 위
트랙패드 핀치 아웃


CANVAS-02
Zoom Out
– 버튼
Ctrl + -
Ctrl + 휠 아래
트랙패드 핀치 인


CANVAS-03
Fit Screen
[ ] 버튼
Ctrl + Shift + F
—
—


CANVAS-04
Pan Canvas
손바닥(🖐) 버튼
H (토글) / Space 홀드
빈 영역 우클릭 + 드래그 / 미들버튼 드래그
트랙패드 2손가락 스크롤


CANVAS-05
Center Node
동심원(⊙) 버튼
Ctrl + Enter
노드 우클릭 → 컨텍스트 메뉴
—


CANVAS-06
100% View
100 돋보기 버튼
Ctrl + 0
—
—


CANVAS-07
Fullscreen Mode
화살표 확장(⛶) 버튼
F11 또는 Ctrl + Shift + F11
—
ESC 로 종료


CANVAS-08
Focus Node View
선택노드보기(◎) 버튼
Alt + F
노드 우클릭 → 컨텍스트 메뉴
ESC 또는 버튼 재클릭으로 해제

2-2. Pan Canvas 모드 전환 규칙
[일반 모드]
  ├─ H 키 누름 → Pan 모드 토글 ON  (커서: 🖐, 유지됨)
  ├─ Space 홀드 → Pan 모드 임시 ON (커서: 🖐, 키 놓으면 해제)
  └─ 빈 영역 우클릭 + 드래그 → Pan 동작 (모드 전환 없음, 즉시 이동)

[Pan 모드 ON]
  ├─ 클릭 + 드래그 → 캔버스 이동
  ├─ H 키 재누름 → Pan 모드 토글 OFF
  └─ ESC 키 → Pan 모드 해제


3. 우클릭 컨텍스트 메뉴
3-1. 빈 캔버스 영역 우클릭
┌─────────────────────────────┐
│  🖐  캔버스 이동 (Pan)      │  ← 드래그 시작 시 바로 Pan 동작
│  [ ] 전체 화면 맞춤 (Fit)  │
│  100 100% 보기              │
│  ⛶   전체화면 모드          │
└─────────────────────────────┘

3-2. 노드 우클릭
┌──────────────────────────────────┐
│  ⊙  이 노드를 화면 중앙으로      │  CANVAS-05
│  ◎  이 노드부터 보기 (Focus)     │  CANVAS-08
│  ─────────────────────────────   │
│  ✂  잘라내기       Ctrl+X        │
│  📋 복사           Ctrl+C        │
│  📌 붙여넣기       Ctrl+V        │
│  🔁 복제           Ctrl+D        │
│  ─────────────────────────────   │
│  🗑  삭제          Delete        │
└──────────────────────────────────┘


4. 각 기능 상세 설계

CANVAS-01 — Zoom In

항목
내용

동작
현재 줌 레벨에서 한 단계 확대


확대 기준점
마우스 위치 기준 (휠 사용 시) / 화면 중앙 기준 (버튼/단축키 사용 시)


최대 줌
400%


단계 크기
버튼·단축키: 10% 단위 / 휠: 5% 단위

CANVAS-02 — Zoom Out

항목
내용

동작
현재 줌 레벨에서 한 단계 축소


축소 기준점
마우스 위치 기준 (휠 사용 시) / 화면 중앙 기준 (버튼/단축키 사용 시)


최소 줌
10%


단계 크기
버튼·단축키: 10% 단위 / 휠: 5% 단위

CANVAS-03 — Fit Screen

항목
내용

동작
전체 노드 트리가 뷰포트 안에 들어오도록 줌 + pan 자동 조정


패딩
뷰포트 가장자리에서 최소 40px 여백 확보


줌 상한
Fit 결과가 150%를 초과하면 150%로 제한 (맵이 매우 작을 때 과도하게 확대 방지)


애니메이션
0.3s ease-out 트랜지션

CANVAS-04 — Pan Canvas

항목
내용

동작
캔버스를 화면에서 이동 (줌 변경 없음)


커서 변경
모드 진입 시 → grab (🖐) / 드래그 중 → grabbing (✊)


진입 방법
① 툴바 손바닥 버튼 클릭 (토글) ② H 키 (토글) ③ Space 홀드 (임시) ④ 빈 영역 우클릭+드래그 (즉시) ⑤ 미들버튼 드래그


해제 방법
토글 모드: H 재입력 또는 ESC / Space 홀드: Space 키 놓음


노드 클릭 방지
Pan 모드 ON 상태에서 노드 클릭 시 선택/편집 동작 차단

CANVAS-05 — Center Node

항목
내용

동작
선택된 노드를 화면 중앙으로 pan 이동. 줌 배율은 현재 상태 그대로 유지.


사전 조건
노드가 1개 이상 선택된 상태


다중 선택 시
선택된 노드들의 중심점(bounding box center)을 화면 중앙으로 이동


100% 동시 적용?
Center Node 자체는 줌 변경 없음. 100% 배율과 함께 원하는 경우:

→ 우클릭 메뉴 "이 노드를 100%로 중앙 이동" 옵션 별도 제공

→ 또는 Ctrl + Enter 후 Ctrl + 0 순서로 사용


애니메이션
0.25s ease-out pan 트랜지션


단축키
Ctrl + Enter


마우스
노드 우클릭 → 컨텍스트 메뉴 → "이 노드를 화면 중앙으로"

설계 결정 근거:
Center Node = "내가 보고 싶은 노드를 중앙에 놓는 행위" → 줌을 강제 변경하면 사용자가 설정한 배율이 리셋되어 불편.
줌 조정이 필요한 사용자는 Fit Screen(전체 맞춤) 또는 100% View를 별도로 사용하면 됨.


CANVAS-06 — 100% View

항목
내용

동작
줌 배율을 100%로 리셋. 캔버스 pan 위치는 변경하지 않음.


단축키
Ctrl + 0


툴바 아이콘
돋보기 + "100" 텍스트


사용 시나리오
Zoom In/Out을 많이 한 후 원래 배율로 빠르게 복귀할 때

CANVAS-07 — Fullscreen Mode

항목
내용

동작
브라우저 내장 Fullscreen API로 전체화면 전환. 상단 툴바 등 UI는 그대로 유지.


진입
툴바 버튼 / F11 / Ctrl + Shift + F11


종료
ESC 키


브라우저 제약
document.documentElement.requestFullscreen() 사용. 브라우저 정책상 사용자 제스처 필요.


전체화면 중 툴바
마우스를 상단으로 올리면 나타나는 Auto-hide 방식 권장

// 전체화면 진입/종료 토글 예시
const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

// ESC 키는 브라우저가 자동으로 fullscreen 종료 처리
// → fullscreenchange 이벤트로 아이콘 상태 동기화
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = !!document.fullscreenElement;
  setFullscreenIcon(isFullscreen ? 'exit' : 'enter');
});

CANVAS-08 — Focus Node View

항목
내용

동작
선택된 노드를 루트로 설정하여 해당 노드와 하위 노드만 표시, 상위 노드는 숨김


진입
툴바 버튼 / Alt + F / 노드 우클릭 → "이 노드부터 보기"


해제
ESC 또는 툴바 버튼 재클릭 → 전체 맵 복원


표시 방식
상위 노드를 DOM에서 제거하지 않고 visibility: hidden 또는 opacity 처리 (성능)


활성 표시
툴바 버튼 하이라이트 + 화면 상단에 "[노드명] 이하 보기 중" 배너 표시


중첩 적용
Focus 상태에서 다시 하위 노드에 Focus → 더 좁은 범위로 재진입 가능


Breadcrumb
화면 상단에 상위 경로 표시: Root > 전략 > AI전략 (현재 Focus)

[전체 맵]
Root
├── 전략 ← 숨김
│   ├── AI전략  ← Focus 진입점 (선택 노드)
│   │   ├── 모델 선택       ← 표시
│   │   └── 데이터 파이프라인 ← 표시
│   └── 비용절감 ← 숨김
└── 운영 ← 숨김

[Focus Node View 적용 결과]
AI전략
├── 모델 선택
└── 데이터 파이프라인

상단 배너: Root > 전략 > AI전략 (이 노드부터 보기)


5. Zoom 레벨 정책

항목
값

최소 줌
10%


최대 줌
400%


기본 줌
100%


Fit Screen 상한
150%


버튼/단축키 단계
10% 단위


휠 단계
5% 단위


표시 단위
툴바에 현재 배율 % 숫자 표시 (클릭하면 100% 단축으로 사용 가능)

Zoom 스냅 포인트 (자주 쓰는 배율에서 잠시 멈춤)
25% → 50% → 75% → 100% → 125% → 150% → 200% → 300% → 400%

휠로 줌 조작 시 위 배율에서 약 50ms 스냅 딜레이를 두어 정밀 조작 보조.

6. 상태 전이 다이어그램
[기본 상태]
  │
  ├─ H / 손바닥 버튼 ──────────────────► [Pan 모드]
  │                                          │
  │                                     H 재입력 / ESC
  │                                          │
  │◄─────────────────────────────────────────┘
  │
  ├─ Alt+F / 선택노드보기 버튼 ──────► [Focus Node 모드]
  │                                          │
  │                                     ESC / 버튼 재클릭
  │                                          │
  │◄─────────────────────────────────────────┘
  │
  ├─ F11 / 전체화면 버튼 ───────────► [Fullscreen 모드]
  │                                          │
  │                                         ESC
  │                                          │
  │◄─────────────────────────────────────────┘
  │
  └─ Pan 모드 + Focus 모드 동시 가능 (독립적 상태)
     Fullscreen 모드는 다른 모드와 독립적으로 중첩 가능


변경 이력

날짜
버전
변경 내용

2026-03-23
1.0
최초 작성. CANVAS-01~08 전체 정의. 추가 기능 3종(100%보기, 전체화면, 선택노드보기), 단축키/마우스/우클릭 컨텍스트 메뉴 전체 정의
