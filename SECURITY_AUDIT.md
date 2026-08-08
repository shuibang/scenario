# 보안 점검 기록

마지막 점검일: 2026-08-08

---

## 점검 도구

```bash
node security-audit.mjs   # OWASP Top 10 자동 스캔
npm audit                  # 의존성 취약점 스캔
```

---

## 2026-08-08 점검 결과 (3차 — 공유 링크 노출 경로 감사)

발단: 챗GPT 공유 링크가 구글에 색인된 사건과 같은 리스크가 대작에도 있는지 확인.

### 색인 노출 리스크 — 구조적으로 없음 (조사 결론)

챗GPT 는 `/share/{id}` 를 **서버가 렌더링**했고 "검색 노출 허용" 옵션이 있어 색인됐다.
대작의 공유 링크는 해시 프래그먼트 기반이라 성립하지 않는다.

| 근거 | 확인 위치 |
|------|----------|
| React Router 없이 `window.location.hash` 로만 라우팅 — `/review/:id` 같은 서버 라우트 부재 | `App.jsx:3135-3141`, `usePageTracking.js:6` |
| Vercel rewrites 는 `/app`, `/app/(.*)` → `/app.html` 뿐 — 서버는 항상 같은 껍데기만 응답 | `vercel.json` rewrites |
| 해시(`#`)는 브라우저 정책상 HTTP 요청에 포함되지 않음 → 크롤러가 토큰을 볼 수 없음 | — |
| `sitemap.xml` 에 `/app`·공유 경로 없음 (정적 페이지 12개만) | `public/sitemap.xml` |

> `public/robots.txt` 는 `Allow: /` 이고 `/app` 에 `noindex` 가 없다. 다만 sitemap·백링크로
> 유도되지 않고 콘텐츠가 해시 뒤에 있어 실질 리스크는 낮음. 방어를 더하려면 `/app` 에
> `X-Robots-Tag: noindex` 추가를 검토.

### 수정 완료 항목

| 파일 | 내용 | 심각도 |
|------|------|--------|
| `hooks/usePageTracking.js` | GA4 `page_view` 의 `page_path` 에 hash 원본을 그대로 전송하던 것을 `sanitizeHashForAnalytics()` 로 마스킹 — `#review=`/`#log=`/`#delivery=` 의 **접근 토큰(UUID)** 과 `#sl=` 의 **씬리스트 본문(base64)** 이 Google Analytics 로 유출되던 확정 유출 차단 | 🔴 High |
| `utils/reviewShare.js` | `loadReviewPayload`/`loadLogPayload` 가 `review_links` 를 anon key 로 직접 select 하던 것을 `get_legacy_link_payload` RPC(SECURITY DEFINER, id 단건 + 만료 검증) 호출로 전환 | 🔴 High |
| `migrations/20260808120000` | **`"public select with expiry"` 정책 회수** — `qual=(expires_at > now())` 에 id 조건이 없어, anon key 로 `from('review_links').select('*')` 하면 UUID 없이 활성 링크 전체의 payload(대본 스냅샷·작업기록)를 통째로 가져올 수 있던 구멍 차단 | 🔴 High |
| `migrations/20260807120000` | `get_legacy_link_payload` 의 `id = p_link_id` → `::text` 캐스트 (`review_links.id` 는 text 타입 — 캐스트 없으면 `operator does not exist: text = uuid` 로 `#log=` 열람 실패) | 🟡 Medium |

### review_links 접근 통제 현재 상태

1·2차 점검에서 "콘솔 수동 확인 필요"로 남아 있던 항목이 이번에 해소됐다.

- **anon 테이블 직접 SELECT: 불가** — 공개 열람은 전부 SECURITY DEFINER RPC 경유
  - `get_legacy_link_payload` — `#review=` 레거시, `#log=`
  - `get_feedback_link_bundle` — `#review=` feedback_version
  - 두 RPC 모두 링크 id 를 파라미터로 받아 **만료 안 된 단건만** 반환
- **유지 중인 정책**: `review_links_admin_select`(AdminPage 의존),
  `review_links_feedback_owner_insert`/`_update`/`_delete`(링크 생성·수정·삭제 경로 의존)
- **작가 대시보드는 `review_links` 를 읽지 않음** — `feedback_versions`/`feedback_sessions`(소유자 전용 RLS)만 조회.
  따라서 정책 회수 시 owner SELECT 정책 추가가 불필요했다. (`reviewShare.js:312-348`)

> ⚠️ 이 저장소는 Supabase CLI 연결이 없다(`config.toml` 없음). `supabase/migrations/*.sql` 은
> 기록용이며 프로덕션 반영은 콘솔 SQL 에디터에서 수동 실행한다. 위 정책 회수·RPC 는
> 모두 콘솔 적용 완료.

### 미해결 / 후속 확인

- [ ] anon key(로그아웃)로 `from('review_links').select('*')` → 빈 배열 실측 확인
- [ ] 관리자 계정으로 어드민 검토링크 목록 정상 표시 확인(`admin_select` 동반 삭제 여부)
- [ ] `App.jsx:2857` 의 무음 catch — `#log=` 로드 실패를 전부 삼켜 "유효하지 않은 링크"로만 표시.
      위 `::text` 캐스트 버그의 원인 파악이 늦어진 직접 원인이므로 EXPIRED/NOT_FOUND 구분 권장

---

## 2026-04-10 점검 결과 (2차 — 공격자 시점 심층 감사)

### 수정 완료 항목

| 파일 | 내용 | 심각도 |
|------|------|--------|
| `ScriptEditor.jsx` | `sanitizeInlineHtml` DOMPurify 2차 sanitize 추가, `setBlockHtml` 래핑 | 🔴 High |
| `SynopsisEditor.jsx` | `el.innerHTML = value` → `DOMPurify.sanitize()` 래핑 | 🔴 High |
| `src/utils/urlSchemas.js` (신규) | `#share=` / `#log=` / `#review=` 파라미터 Zod 스키마 검증 3종 | 🔴 High |
| `AppContext.jsx` | `#share=` 처리 전 `window.confirm` 추가 (비인증 DB 덮어쓰기 방지) | 🔴 High |
| `reviewShare.js` | `saveReviewPayload` — `supabase.auth.getSession()` 체크, 비로그인 시 throw | 🔴 High |
| `reviewShare.js` | 공유링크 ID `Math.random()` 8자리 → `crypto.randomUUID()` 128비트 | 🔴 High |
| `db.js` | 모든 레코드 ID `genId` → `crypto.randomUUID()` | 🔴 High |
| `ResourcePanel.jsx` | 이미지 5MB 제한 — 1차(`file.size`) + 2차(`base64` 결과 길이) 이중 검사 | 🟡 Medium |
| `MyPage.jsx` | 폰트 10MB 제한 — 1차(`file.size`) + 2차(`buffer.byteLength`) 이중 검사 | 🟡 Medium |
| `App.jsx` | `#preview-landing` → `import.meta.env.DEV` 조건으로 production 차단 | 🟡 Medium |
| `App.jsx` / `App.v2.jsx` | 공개 라우트 전체에 auth 상태 주석 명시 | 🟢 Low |
| `urlSchemas.js` | `dbRecord`에 `__proto__` / `constructor` / `prototype` 키 필터 transform | 🟡 Medium |
| `ResourcePanel.jsx` | `drama_resource_view` 화이트리스트 (`'grid' \| 'list'`) | 🟡 Medium |
| `LineTokenizer.js` | 디버그 블록 제거 — 대본 텍스트 40자 직접 출력(`t.text.slice(0,40)`) 포함 | 🟢 Low |
| `printPdf.jsx` / `printDocx.js` / `PrintPreviewModal.jsx` | 디버그 `console.log` 전량 제거 | 🟢 Low |

---

## 2026-04-10 점검 결과 (1차)

### 수정 완료 항목

| 커밋 | 내용 | 심각도 |
|------|------|--------|
| `f9bbc8e` | 공유링크 ID `Math.random()` 8자리 → `crypto.randomUUID()` 128비트 | 🔴 High |
| `9080cb5` | 폰트 업로드 매직바이트 3단계 검증 추가 (확장자 우회 방지) | 🟡 Medium |
| `bd5b5b1` | Vite 취약점 패치 `npm audit fix` (Path Traversal 등 3개 high) | 🔴 High |
| `7324242` | 작업기록 공유링크 `#log=BASE64` → `#log=UUID` Supabase 저장 방식 전환 | 🟡 Medium |

---

## OWASP Top 10 현재 상태

#### A01 — Broken Access Control
- ✅ 공유링크 ID: `crypto.randomUUID()` (128비트) 적용
- ✅ 모든 레코드 ID: `crypto.randomUUID()` 적용 (`db.js`)
- ✅ `review_links` INSERT: 로그인 사용자만 가능 (`getSession()` 체크)
- ✅ `#share=` URL: import 전 `window.confirm` 확인
- ✅ `#preview-landing`: DEV 환경에서만 접근 가능
- ✅ `review_links` 테이블 RLS 정책 — **2026-08-08 해소**. anon 대량조회를 허용하던
  `"public select with expiry"` 회수, 공개 열람은 SECURITY DEFINER RPC 경유로 전환 (3차 점검 참조)

#### A02 — Cryptographic Failures
- ✅ 하드코딩 시크릿 없음
- ✅ `.env` → `.gitignore` 등록 및 미추적 확인
- ✅ HTTPS만 사용
- ✅ 모든 ID 생성 → `crypto.randomUUID()` (CSPRNG)

#### A03 — Injection
- ✅ SQL 인젝션: Supabase SDK 파라미터 바인딩, Raw SQL 없음
- ✅ XSS: `esc()` + `DOMPurify` (ScriptEditor, SynopsisEditor) 적용
- ✅ `dangerouslySetInnerHTML` 사용 없음
- ✅ URL 파라미터: Zod 스키마 검증 (`#share=` / `#log=` / `#review=`)
- ✅ Prototype Pollution: `dbRecord` 파싱 시 위험 키 필터
- ⚠️ `blocksToHtml()` → innerHTML: 내부 생성 HTML, 사용자 입력은 `esc()` 통과 후 삽입

#### A04 — Insecure Design
- ✅ 이미지 업로드: MIME 타입 + 1차(`file.size`) + 2차(`base64`) 이중 용량 검사
- ✅ 폰트 업로드: 확장자 whitelist + 용량 + 매직바이트 3단계 검증
- ✅ localStorage 값: 화이트리스트 검증 (`drama_resource_view`)
- ⚠️ Rate limiting: 클라이언트 레벨 없음, Supabase/서버 설정에 의존

#### A05 — Security Misconfiguration
- ✅ `.env` gitignore 등록 및 미추적 확인
- ✅ `vercel.json` 보안 헤더 설정됨 — X-Frame-Options(DENY), X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy, CSP(`object-src 'none'`, `base-uri 'self'` 포함) (2026-08-08 확인)

#### A06 — Vulnerable Components
- ✅ `npm audit` 결과: **0개** (2026-04-10 기준)
- ✅ DOMPurify 적용 (ScriptEditor 3곳, SynopsisEditor 1곳)
- ✅ Zod 스키마 검증 적용 (URL 파라미터 3종)

#### A07 — Authentication Failures
- ✅ OAuth state 파라미터 검증: Supabase SDK PKCE 자동 처리
- ✅ 로그아웃 시 토큰 무효화: 서버(Supabase) + 클라이언트 모두 정리
- ✅ 토큰 만료 처리: 만료 1분 전 선제 무효화 + `isTokenValid()` + `refreshDriveToken()` 자동 갱신
- ⚠️ `provider_token` 만료시간 3600초 하드코딩 → 세션의 `expires_in` 값으로 교체 권장

#### A08 — Software & Data Integrity
- ✅ `package-lock.json` 존재 (의존성 고정)
- ✅ URL 파라미터 Zod 검증 (`#share=` / `#log=` / `#review=`)
- ⚠️ `JSON.parse` try-catch 누락: `ScriptEditor.jsx:1847`, `ScriptEditor.jsx:1867`, `db.js:88`

#### A09 — Logging & Monitoring
- ✅ `error_reports` 테이블로 에러 리포트 시스템 운영
- ✅ print 파이프라인 `console.log` 전량 제거 (대본 텍스트 노출 방지)
- ⚠️ `ScriptEditor.jsx` 빈 catch 블록 4곳 (커서 위치 복원용 — 의도적 무시)

#### A10 — SSRF
- ✅ 브라우저 전용 앱 — 서버사이드 요청 위조 경로 구조적으로 없음

---

## 인증 없이 접근 가능한 공개 엔드포인트

| URL | 컴포넌트 | 설계 의도 | 데이터 조회 경로 |
|-----|----------|-----------|-----------------|
| `/app#review={UUID}` | SharedReviewView | 대본 공유 (의도적 공개) | `get_feedback_link_bundle` → 실패 시 `get_legacy_link_payload` |
| `/app#review={BASE64}` | SharedReviewView | 구형 링크 폴백 | URL 내 base64 디코딩 (서버 저장 없음) |
| `/app#log={UUID}` | LogShareView | 작업기록 공유 (의도적 공개) | `get_legacy_link_payload` |
| `/app#delivery={UUID}` | DirectorDeliveryView | 피드백 회신 전달 (의도적 공개) | `get_feedback_link_bundle` (`link_role='reply'` 검증) |
| `/app#sl={BASE64}` | DirectorApp | 씬리스트 공유 (의도적 공개) | URL 내 base64 — **서버 저장 없음** |
| `/app#survey` | SurveyPage | 베타 설문 (의도적 공개) | — |
| `/` | LandingPage | 앱 소개 | — |

> - `/#preview-landing` 은 `DEV` 환경에서만 접근 가능 (production 차단)
> - 구형 `/#...` 해시는 `index.html` 의 동기 스크립트가 `/app#...` 으로 client-side 리다이렉트
> - 2026-08-08 이후 UUID 기반 링크는 모두 SECURITY DEFINER RPC 경유 —
>   토큰(UUID)을 아는 사람만 단건 열람 가능하며, 테이블 직접 조회는 anon 에게 차단됨

---

## 파일 업로드 보안 현황

| 업로드 포인트 | MIME 검사 | 용량 제한 | 매직바이트 |
|--------------|-----------|-----------|-----------|
| 이미지 (ResourcePanel) | ✅ `image/*` | ✅ 5MB (1차+2차) | — |
| 폰트 (MyPage) | ✅ 확장자 whitelist | ✅ 10MB (1차+2차) | ✅ TTF/OTF/WOFF/WOFF2 |

---

## 다음 점검 시 확인 항목

### Supabase 콘솔 (코드로 확인 불가)
- [x] `review_links` 테이블 RLS 정책 확인 — **2026-08-08 완료**
  - 발견: `"public select with expiry"` 가 `USING (expires_at > now())` 만 걸려 있어
    **id 조건 없이** anon 에게 활성 행 전체를 노출 (아래 "확인 필요"로 적어둔 정책이
    실제로 구멍이었음 — 만료 필터만으로는 대량조회를 막지 못한다)
  - 조치: 해당 정책 회수 + 공개 열람을 SECURITY DEFINER RPC 로 전환
    (`20260731120000`, `20260807120000`, `20260808120000`)
- [ ] `error_reports` 테이블 RLS 정책 확인
- [ ] `survey_responses` 테이블 RLS 정책 확인
- [ ] Authentication → Redirect URLs 목록 (운영 도메인만 등록 확인)

> 교훈: 공개 링크 테이블의 SELECT 정책은 만료 조건만으로 부족하고,
> **id 를 아는 단건만** 반환되도록 RPC 로 감싸야 한다.

### 코드 개선 권장
- [x] `vercel.json` 보안 헤더 추가 (X-Frame-Options, CSP) — 적용 완료
- [ ] `provider_token` 만료시간 세션의 `expires_in` 값으로 교체
- [ ] `/app` 에 `X-Robots-Tag: noindex` 검토 (현재 `robots.txt` 는 `Allow: /`)
- [ ] `JSON.parse` try-catch 누락 3곳 처리 (`ScriptEditor.jsx:1847`, `1867`, `db.js:88`)
- [ ] `error_reports` INSERT에 `user_id` 추가 (스팸 추적용)

### 정기 점검
- [ ] `npm audit` 실행 (취약점 0개 유지)
- [ ] 공유링크 만료 정책 확인 (review: 7일)
