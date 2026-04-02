# 대본 작업실 — 기능 구현 계획서

> 작성일: 2026-04-01
> 상태: 진행 중

---

## 목차

1. ✅ [소셜 로그인 (카카오 / 구글)](#1-소셜-로그인-카카오--구글) — 구글 로그인 + Drive 동기화 완료
2. [광고 영역 3곳](#2-광고-영역-3곳)
3. ✅ [PDF 출력 오류 근본 해결](#3-pdf-출력-오류-근본-해결) — ensureFontsRegistered() 가드 적용 완료
4. ✅ [한글(HWPX) 출력 문제 해결](#4-한글hwpx-출력-문제-해결) — ID 버그·footer 참조·대사 탭 모두 수정 완료
5. ✅ [대사 양식 이름-대사 간격 제안](#5-대사-양식-이름-대사-간격-제안) — MenuBar 슬라이더 추가 완료
6. [사용 가이드 개선 (두 방향)](#6-사용-가이드-개선-두-방향)
7. [오류 반영 시스템 + 페이지 방식](#7-오류-반영-시스템--페이지-방식)
8. [체크리스트 + 작업로그 연동 현황 및 방향](#8-체크리스트--작업로그-연동-현황-및-방향)

---

## 1. 소셜 로그인 (카카오 / 구글)

### 현재 상태

`src/App.jsx`에 Google Identity Services **인증(Authentication)** 로그인이 이미 구현되어 있다.
로그인 상태(`authUser`)는 `MenuBar` 컴포넌트 로컬 state에만 있어 새로고침 시 사라진다.
카카오 / 네이버 버튼은 UI에 "준비 중" 표시만 있는 상태.

```javascript
// App.jsx:283-304 — 현재 구글 구현
window.google.accounts.id.initialize({
  client_id: GOOGLE_CLIENT_ID,
  callback: (response) => {
    const payload = decodeJwt(response.credential); // ID Token → 사용자 정보
    onLogin?.({ name, email, picture });
  },
});
```

---

### 1-A 구글 로그인 완성 (인증)

현재 구현이 거의 완성된 상태. 로그인 상태를 localStorage에 유지하도록 보완한다.

#### Step 1 — Google Cloud Console 설정

```
1. Google Cloud Console → API 및 서비스 → OAuth 2.0 클라이언트 ID 생성
2. 승인된 JavaScript 출처에 사이트 도메인 추가
3. 필요한 OAuth 스코프: openid, email, profile (신원 확인만)
```

#### Step 2 — index.html에 GIS 스크립트 추가 (이미 있으면 생략)

```html
<!-- index.html <head> -->
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

#### Step 3 — .env 설정

```
VITE_GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
```

#### Step 4 — 로그인 상태 localStorage 유지

```javascript
// App.jsx — LoginModal 수정안 (인증만)

function LoginModal({ onClose, onLogin }) {
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        const payload = decodeJwt(response.credential);
        if (!payload) { setError('로그인 실패'); return; }
        const userData = { name: payload.name, email: payload.email, picture: payload.picture };
        // localStorage에 저장 → 새로고침 후에도 유지
        localStorage.setItem('drama_auth_user', JSON.stringify(userData));
        onLogin?.(userData);
        onClose();
      },
    });
    if (googleBtnRef.current) {
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard', theme: 'outline', size: 'large', locale: 'ko', width: 280,
      });
    }
  }, [onClose, onLogin]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" ...>
      <div ...>
        <div>로그인 / 회원가입</div>
        {GOOGLE_CLIENT_ID
          ? <div ref={googleBtnRef} />
          : <div>VITE_GOOGLE_CLIENT_ID 환경변수가 없습니다.</div>
        }
        {error && <div>{error}</div>}
        <div style={{ color: '#aaa', fontSize: 10 }}>Kakao 로그인은 준비 중입니다</div>
      </div>
    </div>
  );
}
```

#### Step 5 — App 초기화 시 로그인 상태 복구

```javascript
// App.jsx — 앱 로드 시 저장된 인증 정보 복구
const [authUser, setAuthUser] = useState(() => {
  try {
    const saved = localStorage.getItem('drama_auth_user');
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
});

// 로그아웃 시
function handleLogout() {
  localStorage.removeItem('drama_auth_user');
  setAuthUser(null);
  window.google?.accounts.id.disableAutoSelect();
}
```

**트레이드오프:**
- 로그인 상태는 브라우저 localStorage에만 저장. 기기 간 동기화 없음 (현재 목표 범위 밖)
- Google OAuth 심사 없이 바로 사용 가능 (신원 확인 스코프만 사용)

**수정 파일:** `src/App.jsx`, `.env`

---

### 1-B 카카오 로그인 추가

카카오 로그인 상태 표시와 향후 서버 연동 준비용.

**필요 작업:**

1. Kakao Developers에서 앱 생성 → JavaScript 키 발급
2. `.env`에 추가:
   ```
   VITE_KAKAO_JS_KEY=abcd1234...
   ```
3. `index.html`에 Kakao SDK 추가:
   ```html
   <script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
           integrity="sha384-..." crossorigin="anonymous"></script>
   ```
4. `App.jsx`의 `LoginModal`에 카카오 버튼 추가:
   ```javascript
   const handleKakaoLogin = () => {
     // 팝업 방식 (SPA 친화적)
     window.Kakao.Auth.login({
       success: (authObj) => {
         window.Kakao.API.request({
           url: '/v2/user/me',
           success: (res) => {
             const { nickname, profile_image } = res.kakao_account.profile;
             const userData = { name: nickname, picture: profile_image, provider: 'kakao' };
             localStorage.setItem('drama_auth_user', JSON.stringify(userData));
             onLogin?.(userData);
             onClose();
           },
         });
       },
       fail: (err) => setError(`카카오 로그인 실패: ${err.error_description}`),
     });
   };
   ```

**트레이드오프:**
- 팝업 차단 이슈 가능. 모바일에서는 리디렉션 방식 권장.
- 카카오 앱 설정에서 사이트 도메인 등록 필수

**수정 파일:** `src/App.jsx`, `index.html`, `.env`

---

## 2. 광고 영역 3곳

### 현재 상태

`src/components/PrintPreviewModal.jsx`에만 placeholder가 있다:

```javascript
// PrintPreviewModal.jsx:294-310 — 이미 있는 placeholder
<div style={{
  margin: '12px 16px 16px',
  height: '72px',
  border: '1px dashed #b0b0b0',
  background: '#e8e8e8',
  // ...
}}>광고 영역</div>
```

나머지 2곳은 추가 필요.

---

### 광고 영역 1 — 검토 링크 하단 (`SharedReviewView.jsx`)

**위치:** 피드백 패널 하단 또는 미리보기 하단

```javascript
// src/components/SharedReviewView.jsx 하단 피드백 패널 안
// 피드백 textarea 아래에 추가

<div style={{
  margin: '12px 0 0',
  padding: '10px',
  background: '#f0f0f0',
  borderRadius: '6px',
  textAlign: 'center',
  fontSize: '11px',
  color: '#999',
  minHeight: '60px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}}>
  {/* 광고 슬롯 — 추후 Google AdSense / Kakao AdFit 삽입 */}
  광고 영역
</div>
```

---

### 광고 영역 2 — 사이트 하단 (`App.jsx`)

**위치:** 메인 레이아웃 최하단

```javascript
// App.jsx — 메인 레이아웃 return 하단에 추가
// 현재 레이아웃 구조:
// <div className="flex flex-col h-screen">
//   <MenuBar />
//   <div className="flex flex-1"> ... 3패널 ... </div>
//   ↓ 여기에 추가
//   <footer>광고 영역</footer>
// </div>

<footer style={{
  height: '60px',
  background: 'var(--c-panel)',
  borderTop: '1px solid var(--c-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: '11px',
  color: '#bbb',
}}>
  광고 영역
</footer>
```

---

### 광고 영역 3 — 출력 팝업 하단 (`PrintPreviewModal.jsx`)

이미 placeholder 있음. 실제 광고로 교체할 때:

```javascript
// PrintPreviewModal.jsx:294 — 현재 placeholder를 AdSlot 컴포넌트로 교체
<AdSlot slotId="print-preview-bottom" height={72} />
```

---

### 광고 전환 타이밍 (AdSlot 컴포넌트 설계)

```javascript
// src/components/AdSlot.jsx — 새 파일
// 광고 플랫폼 미연결 시 placeholder 표시, 연결 시 실제 광고 표시

function AdSlot({ slotId, height = 72 }) {
  const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || '';
  const ADFITUNIT     = import.meta.env.VITE_KAKAO_ADFIT_UNIT || '';

  // 환경변수 없음 → placeholder
  if (!ADSENSE_CLIENT && !ADFITUNIT) {
    return <div style={{ height, background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 11 }}>광고 영역</div>;
  }

  // Google AdSense
  if (ADSENSE_CLIENT) {
    return (
      <ins className="adsbygoogle"
           style={{ display: 'block', height }}
           data-ad-client={ADSENSE_CLIENT}
           data-ad-slot={slotId} />
    );
  }

  // Kakao AdFit
  return <ins className="kakao_ad_area" data-ad-unit={ADFITUNIT} data-ad-width="320" data-ad-height={height} />;
}
```

**트레이드오프:**
- **Google AdSense**: 승인 절차 필요, 트래픽 기준 있음, 광고 단가 높음
- **Kakao AdFit**: 국내 서비스에 최적화, 승인 빠름, 단가 낮음
- **직접 광고**: 별도 계약 필요, 단가 최고, 초기 트래픽 부족 시 비현실적
- **권장 순서**: AdFit 먼저 → 트래픽 늘면 AdSense로 전환

**수정 파일:** `src/components/SharedReviewView.jsx`, `src/App.jsx`, `src/components/PrintPreviewModal.jsx`, `src/components/AdSlot.jsx` (신규), `.env`

---

## 3. PDF 출력 오류 근본 해결

### 현재 증상 및 오류 원인 분석

오류 메시지: `Cannot read properties of undefined (reading 'hasOwnProperty')`

**근본 원인:** `src/print/printPdf.jsx` 최상단에서 폰트 등록이 **모듈 로드 시 1회 실행**된다:

```javascript
// printPdf.jsx:23-39 — 현재 문제의 코드
FONTS.filter(f => f.sourceType === 'bundled').forEach(f => {
  Font.register({ family: f.cssFamily, fonts: variants });
});
```

이 코드가 문제인 이유:
1. **Vite HMR(hot module reload)**: 개발 중 파일 저장 시 모듈이 재실행되면서 `Font.register()`가 중복 호출됨. 폰트 레지스트리가 오염된 상태에서 `pdf().toBlob()`을 호출하면 pdfkit 내부 `PDFDocument` 생성이 실패하고 `this.info`가 `undefined`가 됨 → `hasOwnProperty` 오류.
2. **React StrictMode 이중 렌더**: 모듈 레벨은 영향 없지만, 폰트 resolve 단계에서 중복 상태가 생길 수 있음.
3. **폰트 파일 크기**: HCRBatang.ttf가 28MB로, 첫 로드 시 timeout이 발생할 수 있음.

---

### 해결 방안 A (권장) — 폰트 등록을 함수 내부로 이동 + 등록 가드

```javascript
// src/print/printPdf.jsx 수정안

let _fontsRegistered = false;

function ensureFontsRegistered() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;

  // 기존 등록 초기화 (HMR 재등록 방지)
  try { Font.clear(); } catch (_) { /* API 없으면 무시 */ }

  FONTS.filter(f => f.sourceType === 'bundled').forEach(f => {
    const variants = [];
    const { normal, bold, italic, boldItalic } = f.pdfFiles;
    const isVfFont = f.pdfVfOnly === true;
    if (normal) variants.push({ src: normal, fontWeight: 400, fontStyle: 'normal' });
    if (bold && !isVfFont && bold !== normal)
      variants.push({ src: bold, fontWeight: 700, fontStyle: 'normal' });
    if (italic)     variants.push({ src: italic,     fontWeight: 400, fontStyle: 'italic' });
    if (boldItalic) variants.push({ src: boldItalic, fontWeight: 700, fontStyle: 'italic' });
    if (variants.length > 0) Font.register({ family: f.cssFamily, fonts: variants });
  });

  Font.registerHyphenationCallback(w => [w]);
}

export async function exportPdf(appState, selections, { onStep = () => {} } = {}) {
  ensureFontsRegistered();  // ← 호출 시마다 안전하게 확인
  // ... 나머지 동일
}
```

---

### 해결 방안 B — PDF 렌더링을 Web Worker로 분리

```javascript
// src/print/pdfWorker.js (신규 Web Worker 파일)
import { pdf, Font, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
// Font 등록 + 렌더링 전체를 Worker에서 실행
// → 메인 스레드 HMR과 완전히 격리됨

self.onmessage = async (e) => {
  const { printModel } = e.data;
  // ... 렌더링 후 ArrayBuffer 전송
  const blob = await pdf(doc).toBlob();
  const buffer = await blob.arrayBuffer();
  self.postMessage({ buffer }, [buffer]);
};
```

**트레이드오프:**
- 방안 A: 구현 간단, 즉시 적용 가능. HMR 재등록 문제는 해결되나 이미 오염된 캐시는 브라우저 새로고침 필요.
- 방안 B: 완전한 격리로 근본 해결. 구현 복잡도 높음. `@react-pdf/renderer`의 Worker 지원 여부 확인 필요.
- **권장**: 방안 A 먼저 적용 후 여전히 발생하면 방안 B로 전환.

---

### 해결 방안 C — 폰트 파일 경량화

HCRBatang.ttf 28MB는 너무 크다. PDF 내장 시 불필요한 글리프를 제거한 서브셋 폰트로 교체:

```
현재: HCRBatang.ttf (28.4MB), HCRBatang-Bold.ttf (30.7MB)
목표: HCRBatang-subset.woff2 (2~4MB) — 한글 KS완성형 11172자 + 라틴만 포함
```

도구: `pyftsubset` (fonttools) 또는 `glyphhanger`

**트레이드오프:** 서브셋 시 일부 특수문자/한자 빠질 수 있음. 대본 집필 용도에서는 실질적 문제 없음.

**수정 파일:** `src/print/printPdf.jsx`

---

## 4. 한글(HWPX) 출력 문제 해결

### 현재 문제점 분석

`src/print/hwpxBuilder.js`에서 발견된 이슈:

#### 문제 1 — `hp:p` 자식 요소 ID 공유

```javascript
// hwpxBuilder.js:53-59 — 현재 코드
function para(text, ...) {
  const id = _pid++;
  return `<hp:p id="${id}" ...>
    <hp:pPr id="${id}" .../>   ← 같은 id!
    <hp:run id="${id}" ...>    ← 같은 id!
    <hp:pEnd id="${id}" .../>  ← 같은 id!
  </hp:p>`;
}
```

HWPML 스펙에서 `hp:pPr`, `hp:run`, `hp:pEnd`는 각각 **고유한 id**가 필요하다. 한글에서 파싱 시 중복 ID로 인해 "파일이 손상되었습니다" 오류 발생 가능.

**수정안:**
```javascript
function para(text, { cid = 0, parid = 0, sid = 0 } = {}) {
  const pId   = _pid++;
  const pPrId = _pid++;
  const runId = _pid++;
  const pEndId = _pid++;
  if (!text) {
    return `  <hp:p id="${pId}" listCnt="1" listID="0">
    <hp:pPr id="${pPrId}" paraPrIDRef="${parid}" styleIDRef="${sid}" .../>
    <hp:pEnd id="${pEndId}" charPrIDRef="${cid}"/>
  </hp:p>`;
  }
  return `  <hp:p id="${pId}" listCnt="2" listID="0">
    <hp:pPr id="${pPrId}" paraPrIDRef="${parid}" styleIDRef="${sid}" .../>
    <hp:run id="${runId}" charPrIDRef="${cid}">
      <hp:t xml:space="preserve">${esc(text)}</hp:t>
    </hp:run>
    <hp:pEnd id="${pEndId}" charPrIDRef="${cid}"/>
  </hp:p>`;
}
```

#### 문제 2 — 페이지 번호 footer 참조 오류

```javascript
// hwpxBuilder.js:285-286 — 현재 코드
<hs:footerIDRef foot="0" odd="0" even="0"/>
<hs:headerIDRef head="0" odd="0" even="0"/>
```

`foot="0"`, `head="0"`은 각각 id=0인 footer/header 객체를 참조하지만, `header.xml`에 footer/header 정의가 없다. 한글이 이 참조를 찾지 못해 파일 손상으로 처리할 수 있다.

**수정안:**
```javascript
// 참조를 비활성화 (footer/header 없음을 명시)
<hs:footerIDRef foot="-1" odd="-1" even="-1"/>
<hs:headerIDRef head="-1" odd="-1" even="-1"/>
```

#### 문제 3 — 대사 블록 간격

```javascript
// hwpxBuilder.js:244-246 — 현재 코드
case 'dialogue':
  normal(`${block.charName ? block.charName + '   ' : ''}${block.content || ''}`);
  // ↑ 공백 3개로 간격 표현 — 비례 폰트에서 실제 간격이 들쭉날쭉
```

**수정안:** 탭 문자(`\t`) 사용 + paraShape에 tabStop 정의:

```javascript
// header.xml의 paraShape에 tabStop 추가 (대화 전용 paraShape id=3)
`<hh:paraShape id="3" ... tabStop="7087">` // 25mm tab stop

// dialogue 렌더링
case 'dialogue':
  normal(`${block.charName || ''}\t${block.content || ''}`,
    { parid: 3 });  // 대화 전용 paraShape
```

**수정 파일:** `src/print/hwpxBuilder.js`

---

## 5. 대사 양식 이름-대사 간격 제안

### 현재 상태

현재 `dialogueGap: '7em'`(기본값)이 PDF/미리보기/DOCX에서 각각 다른 방식으로 적용된다:

| 렌더러 | 구현 방식 | 문제 |
|--------|----------|------|
| PDF (`printPdf.jsx`) | `charCell: { width: dialogueGapPt }` 고정폭 열 | 단일 고정 폭 |
| 미리보기 (`PreviewRenderer.jsx`) | `span` width: dialogueGapPt pt | 근사치 |
| DOCX (`printDocx.js`) | `tabStops: [{ position: gapTwips }]` | 탭 기반, 정확함 |
| HWPX (`hwpxBuilder.js`) | 공백 3개 | 부정확 |

---

### 방향 A — 사용자 조절 가능한 em 단위 유지 (현행 개선)

현재 `stylePreset.dialogueGap`을 `'7em'`에서 사용자가 직접 조절하도록 UI 추가.

```javascript
// App.jsx MenuBar 또는 스타일 설정 패널에 추가
<label>대사 간격
  <input type="range" min="4" max="14" step="0.5"
    value={parseFloat(stylePreset.dialogueGap)}
    onChange={e => dispatch({ type: 'SET_STYLE_PRESET',
      payload: { dialogueGap: `${e.target.value}em` } })}
  />
  <span>{stylePreset.dialogueGap}</span>
</label>
```

**장점:** 단순, 기존 코드 그대로 활용
**단점:** em 기준이라 폰트 크기 바꾸면 비율 유지는 되나 절대 폭이 달라짐

---

### 방향 B — 최장 인물명 기준 자동 계산

회차 내 가장 긴 인물명을 기준으로 dialogueGap을 자동 설정.

```javascript
// PrintModel.js 또는 렌더러 내부
function autoDialogueGap(blocks, fontSize) {
  const maxCharLen = blocks
    .filter(b => b.type === 'dialogue' && b.charName)
    .reduce((max, b) => Math.max(max, b.charName.length), 0);
  // 한글 1자 ≈ 1em, 최소 4em, 여유 2자 추가
  const emCount = Math.max(4, maxCharLen + 2);
  return `${emCount}em`;
}
```

**장점:** 콘텐츠에 최적화, 인물명이 짧으면 줄 낭비 없음
**단점:** 회차마다 간격이 달라져 일관성 깨짐 (드라마 대본 관행과 다를 수 있음)

---

### 방향 C — mm/pt 단위 직접 지정 (방송 대본 표준 준수)

방송 대본 표준(MBC/KBS 형식)에서는 인물명은 고정 폭(대략 25~30mm)을 사용한다.

```javascript
// stylePreset에 새 필드 추가
dialogueGapMode: 'em' | 'mm',  // 단위 선택
dialogueGapMm: 25,              // mm 직접 지정 시 사용

// LineTokenizer.js 수정
const dialogueGapPt = preset.dialogueGapMode === 'mm'
  ? (preset.dialogueGapMm ?? 25) * PT_PER_MM
  : parseFloat(preset.dialogueGap || '7') * preset.fontSize;
```

**장점:** 표준 대본 형식과 일치, 출력물의 일관성 보장
**단점:** 구현 복잡도 증가, UI에 단위 전환 옵션 추가 필요

---

### 방향 D — 인물명 별도 컬럼으로 시각적 분리 (프리미엄 옵션)

PDF에서 인물명을 별도 페이지 컬럼으로 완전 분리.

```javascript
// printPdf.jsx — DialogueParagraph 컴포넌트
// 현재: charCell(고정폭) + speechCell(flex:1)
// 개선: 인물명 right-align + 경계선(|) + 대사 left-align
<View style={{ flexDirection: 'row' }}>
  <Text style={{ width: dialogueGapPt, textAlign: 'right', paddingRight: 6, fontWeight: 700 }}>
    {token.charName}
  </Text>
  <Text style={{ color: '#ccc' }}> | </Text>
  <Text style={{ flex: 1, paddingLeft: 6 }}>{token.text}</Text>
</View>
```

**트레이드오프:**
- 가장 완성도 높은 결과물
- PDF 전용 (DOCX/HWPX에는 별도 구현 필요)
- 구분선이 취향에 따라 호불호 갈릴 수 있음

**권장 방향:** 방향 A(현행 유지)에서 UI에 슬라이더를 추가하는 것이 가장 빠른 개선. 추후 방향 C(mm 직접 지정)로 업그레이드.

**수정 파일:** `src/App.jsx` (설정 UI), `src/store/AppContext.jsx` (stylePreset), `src/print/LineTokenizer.js`, `src/print/printPdf.jsx`, `src/print/printDocx.js`

---

## 6. 사용 가이드 개선 (두 방향)

### 현재 상태

`src/components/OnboardingTour.jsx`에 9단계 모달 투어가 구현되어 있다.

```javascript
// OnboardingTour.jsx:11 — 현재 STEPS 배열
const STEPS = [
  { tourId: 'menubar',          title: '상단 메뉴바',          placement: 'bottom' },
  { tourId: 'center-panel',     title: '대본 편집기',          placement: 'center' },
  { tourId: 'right-panel',      title: '씬 개요',              placement: 'left'   },
  { tourId: 'scene-block-btns', title: 'S# / 지문 / 대사',    placement: 'bottom' },
  { tourId: 'right-panel',      title: '인물 현황',            placement: 'left'   },
  { tourId: 'right-panel',      title: '출력 미리보기',        placement: 'left'   },
  { tourId: 'right-panel',      title: '체크리스트 탭',        placement: 'left'   },
  { tourId: null,               title: '공유 링크 & 피드백',   placement: 'center' },
  { tourId: 'work-timer',       title: '작업 완료 & 마무리',   placement: 'bottom' },
];
```

**문제점:**
- 모달 투어는 한 번에 너무 많은 정보 전달 (9단계)
- 처음 방문 후 다시 보려면 마이페이지 → 설정 → "가이드 다시 보기" 버튼을 찾아야 함
- 특정 기능에서 막혔을 때 그 기능만 설명을 볼 방법이 없음

---

### 방향 A — 현행 모달 투어 개선 (콘텐츠 + UX 개선)

온보딩 투어를 유지하되 개선:

```javascript
// OnboardingTour.jsx 수정안

// 1. 단계를 3단계로 압축 (핵심만)
const STEPS_COMPACT = [
  { title: '회차와 대본',   desc: '왼쪽에서 회차 선택 → 가운데에서 대본 작성 (S#/지문/대사)' },
  { title: '씬 관리',       desc: '오른쪽에서 씬 목록 확인, 상태 변경, 씬 클릭으로 이동' },
  { title: '완성 & 출력',   desc: '완료 버튼 → 작업시간 기록. 출력 버튼 → PDF/DOCX 저장' },
];

// 2. 각 단계에 "건너뛰기" 외 "이 단계 다시 보지 않기" 추가
// 3. 단계 간 페이드 애니메이션
// 4. 마이페이지 → "다시 시작" 위치를 더 명확하게 (현재 설정 탭 내 숨겨져 있음)
```

**장점:** 기존 코드 활용, 구현 부담 낮음
**단점:** 여전히 "한 번 보고 끝"인 구조, 개별 기능 도움말 불가

---

### 방향 B — 메뉴별 최초 1회 컨텍스트 힌트 (신규)

사용자가 특정 탭/기능을 **처음 클릭할 때만** 해당 기능 설명이 작은 팝업으로 표시.

```javascript
// src/components/FeatureHint.jsx (신규)
const HINTS = {
  'script':    { title: '대본 편집기', desc: 'S# → 씬번호, 지문 → 행동묘사, 대사 → 인물 대사. Ctrl+1/2/3으로 전환.' },
  'synopsis':  { title: '시놉시스',   desc: '장르, 주제, 기획의도, 줄거리를 작성하면 출력에 포함됩니다.' },
  'treatment': { title: '트리트먼트', desc: '줄거리 개요를 작성하고 "대본으로 가져오기"로 씬을 자동 생성할 수 있습니다.' },
  'scenelist': { title: '씬리스트',   desc: '대본의 씬 정보를 표로 정리합니다. 내용/비고는 직접 입력 가능합니다.' },
  // ...
};

// 사용: 각 탭 전환 시 최초 1회만 표시
// 저장: localStorage drama_seenHints = ["script", "synopsis", ...]

export function FeatureHint({ featureKey }) {
  const [seen, setSeen] = useState(() => {
    const list = JSON.parse(localStorage.getItem('drama_seenHints') || '[]');
    return list.includes(featureKey);
  });
  if (seen) return null;
  const hint = HINTS[featureKey];
  if (!hint) return null;
  return (
    <div className="feature-hint-bubble" onClick={() => {
      setSeen(true);
      const list = JSON.parse(localStorage.getItem('drama_seenHints') || '[]');
      localStorage.setItem('drama_seenHints', JSON.stringify([...list, featureKey]));
    }}>
      <strong>{hint.title}</strong>: {hint.desc}
      <span className="close">✕ 닫기</span>
    </div>
  );
}
```

**장점:** 사용자가 필요한 순간에 정확한 정보 제공, 이미 아는 기능은 방해 없음
**단점:** 신규 파일 추가, 각 탭/기능에 삽입 작업 필요

---

### 권장 전략

두 방향을 **단계적으로** 적용:
1. **즉시**: 방향 A — 기존 투어 콘텐츠를 3단계로 압축하고, "다시 시작" 버튼을 더 잘 보이게 배치
2. **추후**: 방향 B — 핵심 탭 5개(대본, 트리트먼트, 씬리스트, 인물, 출력)에만 최초 1회 힌트 추가

**수정 파일:** `src/components/OnboardingTour.jsx`, `src/components/MyPage.jsx`, `src/components/FeatureHint.jsx` (신규, 방향 B 시)

---

## 7. 오류 반영 시스템 + 페이지 방식

### 목표 플로우

```
사용자 오류 제보
    ↓
오류 저장 (localStorage + 서버)
    ↓
Claude Code가 취합 및 분석
    ↓
수정 계획 → 개발자(나)에게 고지
    ↓
승인 후 → 구현 + 결과 보고
```

---

### Phase 1 — 오류 수집 UI (프론트엔드만)

`src/components/MyPage.jsx`의 `errors` 탭이 현재 placeholder 상태. 이를 실제 오류 제보 폼으로 구현:

```javascript
// MyPage.jsx — ErrorsTab 컴포넌트 (현재 placeholder 교체)
function ErrorsTab() {
  const [type, setType] = useState('bug');     // 'bug' | 'feature' | 'ui'
  const [desc, setDesc] = useState('');
  const [page, setPage] = useState('');        // 어느 화면에서 발생했는지
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    const report = {
      id:          Math.random().toString(36).slice(2),
      type,
      description: desc,
      page,
      userAgent:   navigator.userAgent,
      timestamp:   new Date().toISOString(),
      appVersion:  import.meta.env.VITE_APP_VERSION || 'dev',
    };
    // Phase 1: localStorage에만 저장
    const existing = JSON.parse(localStorage.getItem('drama_errorReports') || '[]');
    localStorage.setItem('drama_errorReports', JSON.stringify([...existing, report]));
    setSubmitted(true);
    // Phase 2: 서버 전송 추가
  };

  return ( /* 폼 UI */ );
}
```

---

### Phase 2 — 오류 집계 페이지 (정적 파일 방식)

서버 없이도 Claude Code가 접근할 수 있는 방식:

**방법 A — GitHub Issues 활용:**
```javascript
// 오류 제보 시 GitHub Issues API 호출
const response = await fetch('https://api.github.com/repos/{owner}/{repo}/issues', {
  method: 'POST',
  headers: { Authorization: `Bearer ${VITE_GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: `[${type}] ${desc.slice(0, 60)}`,
    body:  `## 오류 제보\n\n**유형:** ${type}\n**화면:** ${page}\n**설명:** ${desc}\n**UA:** ${userAgent}\n**시간:** ${timestamp}`,
    labels: [type],
  }),
});
```

**방법 B — Google Forms + Sheet 연동:**
- 무료, 서버 불필요
- 제보가 Google Sheet에 자동 저장
- Claude Code가 Sheet를 조회해 취합

**방법 C — Supabase (권장, 무료 티어):**
```javascript
// 오류 제보 테이블: error_reports (id, type, desc, page, ua, timestamp)
const { error } = await supabase.from('error_reports').insert({ type, description: desc, page, ... });
```

---

### Phase 3 — Claude Code 취합 및 고지 워크플로

```
1. Claude Code가 주기적으로 오류 DB 조회
2. 유형별 분류 (UI 버그 / 출력 문제 / 기능 요청)
3. plan.md에 새 섹션 추가 (자동 생성)
4. 메시지/알림으로 개발자에게 고지
5. 승인 받으면 구현 시작
6. 구현 완료 후 해결된 오류 마킹
```

**트레이드오프:**
- **GitHub Issues**: 공개 저장소라면 사용자 오류가 노출됨. Private repo 필요.
- **Google Sheet**: 무료이나 Claude Code에서 직접 읽기 위한 API 인증 필요.
- **Supabase**: 가장 체계적, Row Level Security로 보안 설정 가능. 무료 500MB.

**권장:** Phase 1(localStorage 저장)만 먼저 구현. 트래픽 생기면 Supabase Phase 2.

**신규 파일:** `src/components/ErrorReportForm.jsx`, `.env`에 서버 키 추가

---

## 8. 체크리스트 + 작업로그 연동 현황 및 방향

### 현재 구현 상태

**구현 완료:**

```javascript
// App.jsx:196-199 — WorkTimer 내부
const buildSnapshot = () =>
  checklistRef.current
    .filter(it => it.projectId === projectId && it.done)
    .map(it => ({ id: it.id, text: it.text, docId: it.docId || null }));

// App.jsx:232-240 — 완료 버튼 클릭 시
dispatch({ type: 'ADD_WORK_LOG', payload: {
  projectId,
  documentId,
  startedAt: startedAt.current,
  completedAt: Date.now(),
  activeDurationSec: elapsedRef.current,
  dateKey: ...,
  completedChecklistSnapshot: buildSnapshot(), // ← 체크 완료 항목 스냅샷
}});
```

즉 **작업완료 시 체크된 항목의 스냅샷이 workTimeLog에 저장**되고 있다.

```javascript
// MyPage.jsx:141 — 로그 표시 (최근 10개)
const recentLogs = useMemo(
  () => [...workTimeLogs].sort((a, b) => b.completedAt - a.completedAt).slice(0, 10),
  [workTimeLogs]
);
```

---

### 현재 미구현 부분

1. **마이페이지에서 `completedChecklistSnapshot` 미표시**: 로그 항목을 클릭하면 "당시 완료된 체크리스트"를 볼 수 있어야 하는데, UI에 구현되지 않았다.

2. **체크리스트 항목의 누적 완료율**: 특정 항목이 몇 번의 세션에 걸쳐 체크/해제됐는지 통계 없음.

3. **문서별 체크리스트 완료 현황**: 특정 회차의 체크리스트 완료 비율을 씬리스트나 아웃라인에서 시각화하는 기능 없음.

---

### 향후 방향

**방향 A — 로그 상세 뷰 추가 (즉시 구현 가능)**

```javascript
// MyPage.jsx — LogItem 클릭 시 상세 펼치기
function LogItem({ log }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <div onClick={() => setExpanded(!expanded)}>
        {log.dateKey} | {formatDuration(log.activeDurationSec)} | {getProjectTitle(log.projectId)}
      </div>
      {expanded && log.completedChecklistSnapshot?.length > 0 && (
        <ul style={{ paddingLeft: 16, fontSize: 11, color: 'var(--c-text5)' }}>
          {log.completedChecklistSnapshot.map(item => (
            <li key={item.id}>✓ {item.text}{item.docId ? ` (${item.docId})` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**방향 B — 체크리스트 완료 통계 (중기)**

```javascript
// selectors 또는 MyPage 내 useMemo
function getChecklistStats(workTimeLogs, checklistItems) {
  const itemCompletionCount = {};
  workTimeLogs.forEach(log => {
    (log.completedChecklistSnapshot || []).forEach(snap => {
      itemCompletionCount[snap.id] = (itemCompletionCount[snap.id] || 0) + 1;
    });
  });
  // "이 항목은 7번의 세션에서 완료됨" 같은 통계
  return itemCompletionCount;
}
```

**방향 C — 회차별 완료 진행률 표시 (장기)**

```javascript
// RightPanel.jsx 또는 LeftPanel.jsx에 추가
// 각 회차 옆에 체크리스트 완료율 표시
// 예: "2회 ████░░░ 67%"
```

**권장 순서:**
1. **즉시**: 방향 A — 로그 상세 뷰 (completedChecklistSnapshot 표시)
2. **다음 스프린트**: 방향 B — 항목별 완료 횟수 통계
3. **나중**: 방향 C — 회차별 진행률 시각화

**수정 파일:** `src/components/MyPage.jsx` (방향 A/B), `src/components/LeftPanel.jsx` 또는 `RightPanel.jsx` (방향 C)

---

## 구현 우선순위 요약

| # | 항목 | 난이도 | 효과 | 권장 순서 |
|---|------|--------|------|-----------|
| 3 | PDF 출력 오류 해결 (방안 A) | 낮음 | 매우 높음 | **1순위** |
| 4 | HWPX 출력 문제 (ID/footer 수정) | 낮음 | 높음 | **2순위** |
| 8 | 체크리스트 로그 상세 뷰 | 낮음 | 중간 | **3순위** |
| 2 | 광고 영역 AdSlot 컴포넌트 | 낮음 | 높음 | **4순위** |
| 1 | 구글 로그인 활성화 (.env 설정) | 낮음 | 중간 | **5순위** |
| 5 | 대사 간격 슬라이더 UI (방향 A) | 낮음 | 중간 | **6순위** |
| 6 | 온보딩 투어 압축 (방향 A) | 중간 | 중간 | **7순위** |
| 1 | 카카오 로그인 | 중간 | 높음 | **8순위** |
| 7 | 오류 반영 시스템 Phase 1 | 낮음 | 중간 | **9순위** |
| 6 | 컨텍스트 힌트 (방향 B) | 높음 | 높음 | **10순위** |
| 7 | 오류 반영 서버 연동 Phase 2 | 높음 | 높음 | **이후** |

---

*이 계획서는 실제 소스 코드(`src/`)를 기반으로 작성되었으며, 구현 전 검토용이다.*
