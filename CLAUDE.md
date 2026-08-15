# CLAUDE.md — 대본 작업실 (daejak.kr)

## 프로젝트 개요
한국 드라마 작가를 위한 무료 웹 기반 대본 편집기.
React + Vite + Supabase SPA, Vercel 배포, Google Drive 주 저장소.

## 기술 스택
- 프론트엔드: React, Vite
- 백엔드/DB: Supabase (RPC 포함)
- 저장소: Google Drive API v3 (SDK 없이 직접 fetch), IndexedDB
- 내보내기: HWPX(hwpxBuilder.js), DOCX(printDocx.js), PDF(printPdf.jsx)
- 유틸: JSZip, mammoth.js, LineTokenizer.js, buildPrintHtml.js
- 배포: Vercel
- 에러 모니터링: 커스텀 errorTracker.js (Sentry 아님)
- 분석: GA4
- 이메일: Resend (daejak.kr 도메인)

## 수정 전 반드시 할 것
1. 관련 파일 전체 읽기 — 추측으로 수정 금지
2. 변경 계획 먼저 보고 — 승인 후 수정 진행
3. 베타 유저 데이터 영향 확인 — 스키마/ID 포맷 변경 시 특히 주의
4. 고아 데이터 자동 삭제 금지 — console.warn만, 절대 자동 삭제 없음

## 절대 건드리지 말 것
- AdSense 설정
- `.djs` 확장자 저장 포맷 (Drive 저장 단위)
- UUID/cuid ID 포맷 — 임의 변경 시 고아 데이터 발생 이력 있음
- 베타 유저가 사용 중인 기능의 데이터 구조
- output 관련 파일(hwpxBuilder.js 등)은 명시적 요청 없이 수정 금지
- `public/notice.html` — 빌드 산출물이라 직접 수정 금지 (아래 "공지 운영 원칙" 참고)
- changelog.html 항목의 **날짜·버전 마커** — 한 번 확정하면 변경 금지. newsletter_items의 id가 여기서 나오므로(`cl-2026-08-15`, `cl-v50-51`), 바뀌면 새 항목으로 잡혀 이미 발송한 내용이 재발송된다. 제목·본문 수정은 안전함

## 한국어 IME 처리 원칙
- composingRef 가드 필수
- 저장 트리거 시 IME 조립 중 강제 commit, commit 후 DOM 직접 파싱 필요
- 누락 시 한글 마지막 글자 소실 버그 발생

## 공유 링크 원칙
- 링크 생성 시 스크립트 버전 스냅샷 생성, 피드백은 그 버전에 귀속

## 커밋 원칙
- 기능/버그픽스별 소단위 커밋, git add -p로 무관한 변경 분리
- 빌드 확인 후 커밋: npm run build + npx vitest run

## 공지 운영 원칙
- **`src/data/announcements.js`가 공지의 단일 소스**다. 공지 추가·수정·삭제는 여기서만 한다.
- **`public/notice.html`은 빌드 산출물** — `npm run build` 시 vite가 announcements.js 기준으로 `<!-- ANNOUNCEMENTS_START -->` 블록을 재생성한다. **직접 수정 금지** (수정해도 다음 빌드에서 덮어써진다).
- 두 파일이 어긋나면 **announcements.js가 정답**이다. 빌드로 재생성한 결과를 그대로 커밋해 맞춘다.
- 빌드 후 `git status`에 `public/notice.html`이 뜨는데 이번 작업 의도가 아니라면, 그건 기존 불일치가 드러난 것이다. `git checkout -- public/notice.html`로 되돌리고 별건으로 보고할 것. `git add .`로 무심코 섞어 커밋하지 말 것.
- **공지에는 중요 공지만 올린다. 기능 업데이트/변경 내역은 공지에 넣지 않는다** — 그건 changelog.html 담당이다. (과거 "메모 탭 추가" 업데이트 내역을 공지에 잘못 올렸다 내린 이력 있음)

## 뉴스레터 동기화
- changelog.html / announcements.js는 **main에 머지되면 GitHub Actions가 자동 동기화**한다 (`.github/workflows/sync-newsletter-items.yml` → `scripts/syncAnnouncements.js` → Supabase `newsletter_items`). **수동 실행 불필요.**
- 반영될 내용을 미리 보려면 `node scripts/syncAnnouncements.js --dry-run` (DB 쓰기·환경변수 없이 파싱 결과와 id 목록만 출력)
- upsert는 payload에 `created_at`이 없어 **기존 항목의 created_at을 보존**한다. 오타 수정은 재발송을 유발하지 않는다
- 주간 발송은 마지막 발송 이후 `created_at`인 항목을 모두 고른다. **과거 날짜 항목을 뒤늦게 추가하면 다음 발송에 함께 나가므로**, 발송에서 빼려면 해당 항목의 `created_at`을 각자 날짜로 내린다 (예: `supabase/migrations/20260815120000_newsletter_backfill_created_at.sql`)

## 자주 하는 실수 / 주의사항
- JSZip HWPX 파싱 시 try-catch 필수
- Whale 브라우저 SecurityError → IGNORE_PATTERNS 처리
- SPA 특성상 봇 크롤링 이슈 → index.html SEO fallback 유지
- Save the Cat 저작권 관련 콘텐츠 앱 내 포함 금지

## 멀티 디바이스 작업 원칙
- 노트북 + 서버(폰 원격) 두 곳에서 작업하므로, **작업 시작 시 항상 `git pull` 먼저** 실행할 것.
- **main 브랜치에 직접 push하지 말 것.** feature 브랜치에 push해서 Vercel이 자동으로 만드는 preview URL로 사용자가 확인하고, 명시적으로 승인할 때만 main에 merge/push할 것.
