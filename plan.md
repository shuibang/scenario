# 대본 작업실 — 작업 플랜

> 최종 수정: 2026-04-03

## 워크플로우
수정 요청 → plan.md에 계획 정리 → 코드 수정 → 사용자 내부서버 점검 → 빌드 요청 시 빌드 & 푸시

---

## 현재 배포 상태

### 배포 완료 (origin/main @ 5cc570e)
- Synopsis 흑화면: `inset:0` → 명시적 top/right/bottom/left (구형 브라우저)
- Synopsis JS 크래시: `migrateDoc` spread로 숫자 타임스탬프가 섞이던 버그
- 모바일 레이아웃: `100svh/dvh` → `position: fixed; bottom:0`
- MobileOnboardingTour: activeDoc 변경 시 힌트 오버레이 초기화

### 로컬 완료 — 내부서버 확인 후 빌드 대기
- WorkTimer: 다른 창 전환 시 즉시 멈추기 (blur/visibilitychange)
- ScriptEditor 흑화면: 루트 div를 `position:absolute` 방식으로 변경
- 기타 버튼 스타일 통일
- Script 진입 시 하단 패널 자동 닫힘
- **기타/연결/대사 이름선택창 → React Portal로 렌더**: `createPortal(…, document.body)` — 앱 레이아웃 stacking context 탈출 (이번 작업 — 확인 필요)
- **SymbolPicker**: open/pos 분리 → `dropPos: null|{top,left}` 단일 state로 통합, 위치 없으면 렌더 안 함
- **대사 자동오픈 guard**: rect.bottom > 60일 때만 picker 오픈 (toolbar 가리기 방지)
- **CharPickerOverlay/SceneRefPicker**: 외부 클릭으로 닫힘 추가, "Enter로 닫기" placeholder 제거
- **대사 버튼 → 이름선택창 자동 열기** + 선택없이 닫으면 빨간 "선택안함" 표시 (이번 작업 — 확인 필요)
- **피커 상호 닫힘**: 등장/연결/기타 열면 대사 이름선택창도 닫힘 (이번 작업 — 확인 필요)
- **기타 선택지 디자인 통일**: CharPickerOverlay/SceneRefPicker 스타일 맞춤 (이번 작업 — 확인 필요)
- **상단 툴바 버튼 통일**: 데스크톱에만 표시, 모바일은 하단 플로팅 툴바만 사용 (이번 작업 — 확인 필요)

---

## 다음 예정 작업 (2026-04-03, 모바일 수정 세션)

### 우선순위 순서

#### ① 화면 흔들림 수정 [긴급 — 타이핑 불가 수준]
- **증상:** 타이핑할 때 편집 화면이 위아래로 심하게 흔들림
- **원인 추정:** ScriptEditor.jsx의 `selectionchange` 이벤트 → `scrollTo({ behavior: 'smooth' })` 가 매 키 입력마다 발동, smooth 스크롤 애니메이션이 연속으로 중첩되며 진동
- **수정 위치:** `src/components/ScriptEditor.jsx` — `handleSelectionChange` 내 `scrollTo` 옵션
- **수정 방향:** `behavior: 'smooth'` → `behavior: 'instant'` 또는 커서가 뷰 밖으로 벗어날 때만 스크롤하도록 조건 추가

#### ② 플로팅 버튼 위치 버그 [긴급 — 버튼 사용 불가]
- **증상:** 키보드가 올라와 있을 때 플로팅 툴바(S#/지문/대사/등장/연결/기타)가 최하단으로 스크롤해야만 보이고, 위로 올라가면 사라짐
- **원인 추정:** ScriptEditor의 `hasKeyboard` 감지(`screen.height` 비율)와 App.jsx의 `keyboardUp`(`vvHeight`) 감지가 분리되어 있어 타이밍/조건 불일치 가능성. 또는 `position: fixed; bottom: 56px` 가 실제 키보드 위 visible 영역 기준이 아닌 layout viewport 기준으로 계산되는 문제.
- **수정 위치:** `src/components/ScriptEditor.jsx` — floating toolbar position
- **수정 방향:** App.jsx의 `vvHeight`/`keyboardUp` 값을 props로 받아 쓰거나, CSS `bottom` 값을 safe-area 포함 계산으로 보완

#### ③ 키보드 뜰 때 하단 패널 자동 닫기 [중간]
- **증상:** 키보드 올라오면 MobileBottomPanel이 열린 상태 유지 → 편집 공간 한 줄뿐
- **수정 위치:** `src/App.jsx` — Shell 컴포넌트
- **수정 방향:** `keyboardUp`이 true가 되면 `setMobileBottomOpen(false)` 호출하는 useEffect 추가
- **규칙:** 메뉴/자료/설계 탭에만 적용. 메모 탭은 입력란이 하단이므로 예외.

#### ④ 시놉시스 레이아웃 상태 확인 및 복원
- **증상:** 이번 세션에서 요청 없이 레이아웃이 변경됨 (항목명 왼쪽 25%, 내용 오른쪽 75% 레이아웃이 망가진 것으로 추정)
- **수정 방향:** 현재 SynopsisEditor.jsx 확인 → research.md 기준과 다르면 복원

#### ⑤ 인물 페이지 레이아웃 개선 [새 기능]
- **요청:** 인물 터치 시 왼쪽에 인덱스(이름 목록), 오른쪽에 인물 상세 전환 패널
- **수정 위치:** `src/components/CharacterPanel.jsx`
- **수정 방향:** 선택된 인물이 없으면 목록 전체 표시, 선택하면 좌측=이름 인덱스(좁게), 우측=상세 정보(넓게) 분할 레이아웃

#### ⑥ 트리트먼트 씬 연동 [버그]
- **증상:** 대본 본문에서 씬번호 추가해도 트리트먼트에 연동이 전혀 안 됨 (씬번호조차 안 뜸)
- **수정 위치:** `src/components/TreatmentPage.jsx` 및 관련 sync 로직
- **수정 방향:** 대본 씬번호 블록 → 트리트먼트 씬 자동 생성/연동 전체 로직 점검 및 수정

---

#### ⑦ 씬연결 버튼 동작 안 함 [버그]
- **증상:** 모바일에서 씬연결 버튼 눌러도 반응 없음
- **수정 위치:** `src/components/ScriptEditor.jsx` — 모바일 플로팅 툴바 내 연결 버튼 onMouseDown 핸들러
- **수정 방향:** 모바일에서는 `onMouseDown` 대신 `onPointerDown` 또는 `onClick` 사용 검토

#### ⑧ 기타 버튼 선택창 아래로 뜨며 가려짐 [버그]
- **증상:** 기타(SymbolPicker) 버튼 누르면 드롭다운이 버튼 위가 아닌 아래로 나타나 다른 UI에 가려짐
- **수정 위치:** `src/components/ScriptEditor.jsx` — SymbolPicker 드롭다운 위치 계산
- **수정 방향:** `top: rect.bottom + 4` 대신 화면 하단 공간이 부족하면 `bottom: (viewport - rect.top) + 4` 방식으로 위로 뜨도록 변경

#### ⑨ 본문 패널 빈 영역 터치 시 커서 위치 [버그]
- **증상:** 본문 내용 아래 빈 공간 어딘가를 터치하면 그 Y좌표에 해당하는 줄에 커서가 생김. 의도는 빈 영역 터치 시 마지막 줄로 커서 이동해야 함
- **수정 위치:** `src/components/ScriptEditor.jsx` — 스크롤 영역 onClick 핸들러 (`focusEnd` 호출 부분)
- **수정 방향:** 클릭 대상이 `[data-editor-surface]` 안이면 기본 동작 허용, 밖(빈 영역)이면 `focusEnd()` 호출 — 현재도 이 로직이 있으나 모바일 터치에서 제대로 동작 안 하는 것으로 추정. `onClick` → `onPointerDown` 변경 검토

---

### 진행 상태
- [x] ① 화면 흔들림 — 코드 수정 완료, 실 모바일 배포 후 최종 확인 필요
- [x] ② 플로팅 버튼 위치 — 코드 수정 완료, 실 모바일 배포 후 최종 확인 필요
- [x] ③ 하단 패널 자동 닫기 — 코드 수정 완료, 실 모바일 배포 후 최종 확인 필요
- [x] ⑤ 인물 페이지 레이아웃 — 분할 뷰 구현 완료, 배포 후 확인 필요
- [x] ⑥ 트리트먼트 씬 연동 — pendingScriptReload 플래그로 ScriptEditor 강제 리로드 수정
- [x] ⑦ 씬연결 버튼 — onMouseDown → onPointerDown 변경
- [x] ⑧ 기타 버튼 선택창 위치 — 하단 공간 부족 시 위로 뒤집기
- [x] ⑨ 본문 빈 영역 터치 커서 — EditorSurface minHeight:'100%' 제거
