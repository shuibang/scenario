# 보안 점검 기록

마지막 점검일: 2026-04-10

---

## 점검 도구

```bash
node security-audit.mjs   # OWASP Top 10 자동 스캔
npm audit                  # 의존성 취약점 스캔
```

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
- ⚠️ `review_links` 테이블 RLS 정책 — **Supabase 콘솔에서 수동 확인 필요**

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
- ⚠️ `vercel.json` 보안 헤더 미설정 (X-Frame-Options, CSP)

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

| URL | 컴포넌트 | 설계 의도 |
|-----|----------|-----------|
| `/#review={UUID}` | SharedReviewView | 대본 공유 (의도적 공개) |
| `/#review={BASE64}` | SharedReviewView | 구형 링크 폴백 |
| `/#log={UUID}` | LogShareView | 작업기록 공유 (의도적 공개) |
| `/#survey` | SurveyPage | 베타 설문 (의도적 공개) |
| `/` | LandingPage | 앱 소개 |

> `/#preview-landing` 은 `DEV` 환경에서만 접근 가능 (production 차단)

---

## 파일 업로드 보안 현황

| 업로드 포인트 | MIME 검사 | 용량 제한 | 매직바이트 |
|--------------|-----------|-----------|-----------|
| 이미지 (ResourcePanel) | ✅ `image/*` | ✅ 5MB (1차+2차) | — |
| 폰트 (MyPage) | ✅ 확장자 whitelist | ✅ 10MB (1차+2차) | ✅ TTF/OTF/WOFF/WOFF2 |

---

## 다음 점검 시 확인 항목

### Supabase 콘솔 (코드로 확인 불가)
- [ ] `review_links` 테이블 RLS 정책 확인
  ```sql
  -- INSERT: 인증 사용자만
  CREATE POLICY "auth insert" ON review_links FOR INSERT
    TO authenticated WITH CHECK (true);
  -- SELECT: 만료 전 링크만
  CREATE POLICY "public select" ON review_links FOR SELECT
    TO anon, authenticated USING (expires_at > now());
  ```
- [ ] `error_reports` 테이블 RLS 정책 확인
- [ ] `survey_responses` 테이블 RLS 정책 확인
- [ ] Authentication → Redirect URLs 목록 (운영 도메인만 등록 확인)

### 코드 개선 권장
- [ ] `vercel.json` 보안 헤더 추가 (X-Frame-Options, CSP)
- [ ] `provider_token` 만료시간 세션의 `expires_in` 값으로 교체
- [ ] `JSON.parse` try-catch 누락 3곳 처리 (`ScriptEditor.jsx:1847`, `1867`, `db.js:88`)
- [ ] `error_reports` INSERT에 `user_id` 추가 (스팸 추적용)

### 정기 점검
- [ ] `npm audit` 실행 (취약점 0개 유지)
- [ ] 공유링크 만료 정책 확인 (review: 7일)
