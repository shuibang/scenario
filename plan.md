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

## 다음 예정 작업
- 코드 정리 (꼬이거나 비효율적인 부분)
