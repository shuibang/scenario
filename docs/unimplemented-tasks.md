# 미구현 과제

마지막 검토: 2026-06-27

---

## 구현 완료 (이력 보존)

| 항목 | 완료 커밋 | 비고 |
|------|-----------|------|
| PWA | `158465c` 외 다수 | `feat/pwa` 브랜치 main merge, `vite.config.js`에 VitePWA 활성 |
| 워터마크 + 유출 추적 (Phase 1.5) | `b977ae9`, `54c9ecb` | 검토링크·PDF 워터마크, 작품별 공유 설정 저장 |
| SceneListPage timeOfDay 손실 | `56b1672` | 씬리스트 장소·시간대 자동 반영 |
| UI 리디자인 브랜치 | — | `origin/ui-redesign` main merge 완료 |
| 휴지통 기능 종료 계획 철회 | `a8320b2` | 오히려 복원/영구삭제/30일 만료로 강화됨 — `TrashPage.jsx`의 종료 예정 배너 제거 필요 |

---

## 미구현 / 보류 중

### 1. Phase 2 — 대본별 포맷 아키텍처
- 상태: **계획 (미착수)**
- 현재: 포맷 설정이 전역 localStorage에 저장됨
- 문제: 여러 대본이 다른 포맷 쓸 때 충돌 가능
- 해결 방향: 포맷 설정을 대본 단위 속성으로 이관

### 2. Phase 1 — sceneFormat.js 엄격화 (#2~#8)
- 상태: **부분 완료 / 보류**
- `821252d`에서 포맷 시스템 전면 수정됐으나, 원래 계획한 세부 항목(#2~#8) 기준으로는 미완
- 우선순위 낮음 (Phase 2와 연동 설계 필요)

### 3. 배지 이모지 → SVG 교체
- 상태: **미구현**
- 현재: `src/utils/badges/catalog.js` 전 배지 emoji 사용 중
- 계획: 추후 SVG 아이콘으로 교체

### 4. DirectorDashboard — 접속기록 대본 클릭 시 자동 뷰어 로드
- 상태: **미구현**
- 위치: `src/components/director/DirectorDashboard.jsx:1136`
- 현재: 대본 메뉴 전환만 됨, 뷰어 자동 로드 없음

### 5. TrashPage 종료 예정 배너 제거
- 상태: **정리 필요**
- `TrashPage.jsx` 7번 줄 `⚠️ 향후 업데이트에서 기능 종료 예정` 주석 및 화면 내 배너가 남아있음
- 기능은 오히려 강화됐으므로 배너 제거 및 주석 삭제 필요

---

## 유료화 이후 진행

### Google 로그인 도메인 브랜딩 개선
- 상태: **보류 (유료화 이후)**
- 현재 Google 로그인 화면에 Supabase 기본 도메인(`project-ref.supabase.co`) 노출
- 목표: `auth.daejak.kr` 같은 커스텀 인증 도메인 연결

#### 작업 항목
1. Supabase Auth 커스텀 도메인 연결 (`auth.daejak.kr`)
2. DNS CNAME / 검증 레코드 반영
3. Google OAuth redirect URI 추가
4. `VITE_SUPABASE_URL` 환경 변수 교체
5. Google 앱 브랜딩 보강 (로고, 개인정보처리방침, 이용약관)

> 커스텀 인증 도메인은 Supabase 유료 플랜 필요
