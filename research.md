# 대본 작업실 — 전체 아키텍처 및 작동 원리 상세 보고서

> 최초 작성: 2026-04-01
> 최종 수정: 2026-04-01 (v2 폴더 삭제, 단일 구조로 정리)
> 대상 코드베이스: `src/` 전체

---

## 목차

1. [앱 전체 구조 개요](#1-앱-전체-구조-개요)
2. [상태 관리 시스템 (AppContext)](#2-상태-관리-시스템-appcontext)
3. [데이터 모델](#3-데이터-모델)
4. [주요 컴포넌트](#4-주요-컴포넌트)
5. [출력 / 내보내기 파이프라인](#5-출력--내보내기-파이프라인)
6. [폰트 시스템](#6-폰트-시스템)
7. [미리보기 시스템](#7-미리보기-시스템)
8. [localStorage 저장 / 복구](#8-localstorage-저장--복구)
9. [공유 / 검토 링크 시스템](#9-공유--검토-링크-시스템)
10. [단축키 및 UX 인터랙션](#10-단축키-및-ux-인터랙션)
11. [CSS 및 디자인 시스템](#11-css-및-디자인-시스템)
12. [핵심 데이터 흐름 시나리오](#12-핵심-데이터-흐름-시나리오)
13. [알려진 제약 및 한계](#13-알려진-제약-및-한계)

---

## 1. 앱 전체 구조 개요

### 1.1 기술 스택

| 계층 | 기술 |
|------|------|
| UI 프레임워크 | React 18 (JSX, hooks, context) |
| 번들러 | Vite |
| CSS | Tailwind CSS + CSS Variables (CSS-in-JS 혼용) |
| 상태 관리 | React `useReducer` + Context (Redux 패턴, 외부 라이브러리 없음) |
| 영속성 | `localStorage` (서버 없음, 완전 클라이언트) |
| PDF 출력 | `@react-pdf/renderer` v3.4.5 |
| DOCX 출력 | `docx` (OOXML 생성기) |
| HWPX 출력 | JSZip 기반 커스텀 빌더 (HWPML 2.0) |
| 폰트 | 번들 TTF (`/public/fonts/`) + OS 시스템 폰트 폴백 |

### 1.2 디렉토리 구조

```
src/
├── main.jsx                     # 엔트리 — App.jsx 직접 마운트
├── App.jsx                      # 앱 셸 + 공유 검토 뷰 분기
├── store/
│   ├── AppContext.jsx            # Context Provider + useReducer
│   └── db.js                    # localStorage 읽기/쓰기 헬퍼
├── components/
│   ├── LeftPanel.jsx             # 좌측 패널 (프로젝트/회차 트리)
│   ├── RightPanel.jsx            # 우측 패널 (아웃라인/정보)
│   ├── ScriptEditor.jsx          # 대본 편집기
│   ├── CoverEditor.jsx           # 표지 편집
│   ├── SynopsisEditor.jsx        # 시놉시스 편집
│   ├── CharacterPanel.jsx        # 인물 패널
│   ├── TreatmentPage.jsx         # 트리트먼트 페이지
│   ├── StructurePage.jsx         # 구조 페이지
│   ├── SceneListPage.jsx         # 씬리스트 페이지
│   ├── BiographyPage.jsx         # 인물이력서 페이지
│   ├── RelationshipsPage.jsx     # 인물관계도 페이지
│   ├── ResourcePanel.jsx         # 참고자료 패널
│   ├── MyPage.jsx                # 마이페이지
│   ├── OnboardingTour.jsx        # 온보딩 투어
│   ├── PrintPreviewModal.jsx     # 출력 설정 모달
│   ├── SharedReviewView.jsx      # 공유 검토 링크 뷰어
│   ├── QnATab.jsx                # Q&A 탭 UI
│   └── QnAData.js                # Q&A 콘텐츠 데이터
├── print/
│   ├── PrintModel.js             # appState → PrintDocument (렌더러 무관)
│   ├── printPdf.jsx              # @react-pdf/renderer PDF 출력
│   ├── printDocx.js              # docx OOXML DOCX 출력
│   ├── hwpxBuilder.js            # JSZip HWPX 출력
│   ├── hancomExporter.js         # 한컴 호환 DOCX (함초롱바탕 고정)
│   ├── LineTokenizer.js          # 토큰화 + 페이지네이션
│   ├── PreviewRenderer.jsx       # HTML A4 미리보기
│   └── FontRegistry.js           # 폰트 카탈로그 + 가용성 검사
├── data/                         # 정적 데이터 (예: 장르 목록 등)
└── utils/                        # 공통 유틸리티
```

### 1.3 진입점 (main.jsx)

```javascript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

버전 분기 없이 `App.jsx`를 바로 로드한다.

### 1.4 앱 셸 분기 (App.jsx)

```javascript
// 공유 검토 링크로 접속한 경우 → 읽기 전용 뷰
if (window.location.hash.startsWith('#review=')) {
  return <SharedReviewView />;
}

// 일반 접속 → 편집기 UI
return <AppContext.Provider>...<MainLayout /></AppContext.Provider>;
```

---

## 2. 상태 관리 시스템 (AppContext)

### 2.1 구조

`src/store/AppContext.jsx`는 앱 전체 상태를 단일 Context + `useReducer`로 관리한다.

```javascript
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadInitialState);

  // 상태 변경 시 localStorage 자동저장 (디바운스)
  useEffect(() => {
    const timer = setTimeout(() => saveToLocalStorage(state), 500);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
```

### 2.2 전체 상태 형태 (State Shape)

```javascript
{
  // ── 프로젝트 / 회차 ────────────────────────────
  projects:    Project[],          // 작품 목록
  episodes:    Episode[],          // 모든 작품의 회차 통합
  activeProjectId: string | null,
  activeEpisodeId: string | null,

  // ── 콘텐츠 ────────────────────────────────────
  characters:  Character[],        // 인물 목록
  scenes:      Scene[],            // 씬 목록
  scriptBlocks: ScriptBlock[],     // 대본 블록 목록
  coverDocs:   CoverDoc[],         // 표지 문서
  synopsisDocs: SynopsisDoc[],     // 시놉시스 문서
  resources:   Resource[],         // 참고자료

  // ── UI 상태 ────────────────────────────────────
  activeDoc: 'cover' | 'synopsis' | 'script' | 'characters' | ...,
  stylePreset: StylePreset,        // 출력 폰트/여백 설정
}
```

### 2.3 리듀서 주요 액션

| 액션 | 설명 |
|------|------|
| `SET_ACTIVE_PROJECT` | 활성 프로젝트 변경 |
| `SET_ACTIVE_EPISODE` | 활성 회차 변경 |
| `ADD_PROJECT` / `DELETE_PROJECT` | 프로젝트 CRUD |
| `ADD_EPISODE` / `DELETE_EPISODE` | 회차 CRUD + 번호 재정렬 |
| `SET_SCRIPT_BLOCKS` | 회차 대본 블록 교체 |
| `SET_SCENES` | 씬 목록 교체 |
| `ADD_CHARACTER` / `UPDATE_CHARACTER` / `DELETE_CHARACTER` | 인물 CRUD |
| `UPDATE_COVER` | 표지 내용 수정 |
| `UPDATE_SYNOPSIS` | 시놉시스 수정 |
| `SET_STYLE_PRESET` | 출력 스타일 변경 |

### 2.4 localStorage 저장 (db.js)

```javascript
const PREFIX = 'drama_';

export const getAll  = (key) => JSON.parse(localStorage.getItem(PREFIX + key) || '[]');
export const setAll  = (key, data) => localStorage.setItem(PREFIX + key, JSON.stringify(data));
export const getItem = (key) => JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
export const setItem = (key, data) => localStorage.setItem(PREFIX + key, JSON.stringify(data));
```

**저장 키 목록:**

| 키 | 내용 |
|----|------|
| `drama_projects` | 프로젝트 배열 |
| `drama_episodes` | 회차 배열 |
| `drama_characters` | 인물 배열 |
| `drama_scenes` | 씬 배열 |
| `drama_scriptBlocks` | 대본 블록 배열 |
| `drama_coverDocs` | 표지 배열 |
| `drama_synopsisDocs` | 시놉시스 배열 |
| `drama_resources` | 참고자료 배열 |
| `drama_stylePresets` | 출력 스타일 프리셋 |

---

## 3. 데이터 모델

### 3.1 Project

```typescript
{
  id: string;
  title: string;
  createdAt: string;  // ISO
  updatedAt: string;
}
```

### 3.2 Episode

```typescript
{
  id: string;
  projectId: string;
  number: number;      // 1, 2, 3… (삭제 시 자동 재번호)
  title: string;
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 ScriptBlock

```typescript
{
  id: string;
  episodeId: string;
  projectId: string;
  type: 'scene_number' | 'action' | 'dialogue' | 'parenthetical' | 'transition';
  content: string;          // 본문 텍스트
  label: string;            // "S#1." (scene_number만), 나머지 ""
  sceneId?: string;         // scene_number 블록만
  characterId?: string;     // dialogue 블록만
  characterName?: string;   // dialogue 블록만 (표시용)
  createdAt: string;
  updatedAt: string;
}
```

### 3.4 Scene

```typescript
{
  id: string;
  episodeId: string;
  projectId: string;
  sceneSeq: number;          // 1, 2, 3… (에디터 순서)
  label: string;             // "S#1."
  location: string;          // 장소
  subLocation: string;       // 세부장소
  timeOfDay: string;         // "낮" | "밤" | "아침"
  specialSituation?: string; // "회상" | "꿈"
  status: 'draft' | 'writing' | 'done';
  tags: string[];
  characterIds: string[];    // 등장인물 ID 목록
  createdAt: string;
  updatedAt: string;
}
```

### 3.5 Character

```typescript
{
  id: string;
  projectId: string;
  name: string;
  role: 'lead' | 'support' | 'extra';
  gender: string;
  age: string;
  job: string;
  description: string;
  extraFields: Array<{ id: string; label: string; value: string }>;
  relationships: Array<{ id: string; targetId: string; label: string }>;
  createdAt: string;
}
```

### 3.6 CoverDoc

```typescript
{
  id: string;
  projectId: string;
  title: string;
  fields: Array<{ id: string; label: string; value: string }>;
  // 예: { label: '작가', value: '홍길동' }, { label: '장르', value: '로맨스' }
}
```

### 3.7 SynopsisDoc

```typescript
{
  id: string;
  projectId: string;
  genre: string;
  theme: string;
  intent: string;   // 기획의도
  story: string;    // 줄거리
  characters: Character[];  // 시놉시스용 인물 설정
  sections: Array<{ id: string; title: string; content: string }>;
}
```

---

## 4. 주요 컴포넌트

### 4.1 App.jsx — 셸 및 라우팅

- 공유 검토 링크(`#review=`) 감지 → `SharedReviewView` 렌더링
- 일반 접속 → `AppProvider` 감싸기 + 메인 레이아웃 렌더링
- `buildReviewURL(state, selections)` 함수 export (PrintPreviewModal에서 사용)
- 좌측/우측 패널 표시 토글, 광고 영역 표시 조건 관리

### 4.2 LeftPanel.jsx — 프로젝트 / 회차 트리

- 프로젝트 목록 + 회차 목록 (접기/펼치기)
- 회차 인라인 추가 (Enter 확정, Escape 취소)
- 활성 항목 하이라이트
- Dispatch: `SET_ACTIVE_PROJECT`, `SET_ACTIVE_EPISODE`, `ADD_EPISODE`

### 4.3 ScriptEditor.jsx — 대본 편집기

- 회차별 `ScriptBlock[]` 편집
- 블록 타입 툴바 (씬번호 / 지문 / 대사 / 괄호체 / 전환)
- 인물 선택 피커 (대사 블록)
- 단축키 지원 (Ctrl+1/2/3)
- 편집 내용 → 디바운스 → `SET_SCRIPT_BLOCKS` dispatch

### 4.4 CoverEditor.jsx — 표지

- 작품명, 부제목, 작가, 장르, 방송사 등 필드 편집
- `UPDATE_COVER` dispatch

### 4.5 SynopsisEditor.jsx — 시놉시스

- 장르, 주제, 기획의도, 인물설정, 줄거리 편집
- `UPDATE_SYNOPSIS` dispatch

### 4.6 CharacterPanel.jsx — 인물 관리

- 인물 목록 (역할별 정렬: 주연 → 조연 → 단역)
- 인물 상세 편집 (이름, 역할, 성별, 나이, 직업, 소개)
- 추가 항목 (커스텀 필드)
- 인물 관계 입력
- CRUD dispatch

### 4.7 SceneListPage.jsx — 씬리스트

- 씬 목록을 표 형태로 표시
- 씬번호, 장소, 시간대: 대본에서 파생 (읽기 전용)
- 내용, 비고: 직접 편집 가능
- 씬 상태 토글 (draft / writing / done)

### 4.8 TreatmentPage.jsx — 트리트먼트

- 회차 아웃라인을 항목별로 작성
- 항목을 대본으로 가져오기 (씬번호 + 지문 자동 생성)
- 가져오기 후 원본 항목 유지

### 4.9 StructurePage.jsx — 구조 점검

- 전체 회차 씬을 태그/상태 기준으로 시각화
- Save the Cat, 7시퀀스 등 구조 지침 참고

### 4.10 PrintPreviewModal.jsx — 출력 설정 모달

- 출력 대상 선택 (표지, 시놉시스, 회차별, 인물소개)
- 출력 형식 선택 (PDF / DOCX / 한글DOCX / HWPX)
- 우측: A4 실시간 미리보기 (PreviewRenderer)
- 폰트 경고 배너 (PDF 임베딩 불가 폰트 사용 시)
- 검토 링크 공유 버튼
- 단계별 진행 상태 표시 (직렬화 → 레이아웃 → 파일 생성 → 다운로드)

### 4.11 SharedReviewView.jsx — 검토 뷰어

- `#review=BASE64` 해시 디코딩
- 선택된 범위의 대본을 읽기 전용 미리보기로 표시
- 피드백 텍스트 입력 + 클립보드 복사
- 편집 기능 없음, dispatch 없음

---

## 5. 출력 / 내보내기 파이프라인

### 5.1 전체 흐름

```
PrintPreviewModal 열기
    ↓
출력 대상 + 형식 선택
    ↓
"내보내기" 클릭
    ↓
buildPrintModel(appState, selections, preset)
    ↓
[형식별 렌더러]
  PDF      → printPdf.jsx    (@react-pdf/renderer)
  DOCX     → printDocx.js    (docx 라이브러리)
  한글DOCX → hancomExporter.js (함초롱바탕 고정 DOCX)
  HWPX     → hwpxBuilder.js  (JSZip + HWPML XML)
    ↓
Blob → URL.createObjectURL → <a> 자동 클릭 → 다운로드
```

### 5.2 PrintModel (PrintModel.js)

렌더러와 무관한 추상 문서 형식. 모든 렌더러가 이 구조를 입력으로 받는다.

```javascript
buildPrintModel(appState, selections, preset) → {
  sections: [
    // 표지 (선택 시)
    { type: 'cover', title, fields: [{ label, value }] },

    // 시놉시스 (선택 시)
    { type: 'synopsis', genre, theme, intent, story, characters: [...] },

    // 회차 (선택된 회차만)
    {
      type: 'episode',
      episodeNumber: 1,
      episodeTitle: '시작',
      blocks: [
        { type: 'scene_number', label: 'S#1.', content: 'INT. 카페 / 낮' },
        { type: 'action',       content: '이준혁이 커피를 마신다.' },
        { type: 'dialogue',     charName: '이준혁', content: '저 여기 자주 와요?' },
      ]
    },

    // 인물소개 (선택 시)
    { type: 'characters', characters: [...] },
  ],
  preset,
  projectTitle,
}
```

### 5.3 LineTokenizer (LineTokenizer.js)

**목적:** 각 블록의 세로 공간 소비량을 계산하여 A4 페이지 분할

**레이아웃 계산 (getLayoutMetrics):**

```javascript
export function getLayoutMetrics(preset) {
  const contentWmm  = 210 - margins.left - margins.right;  // A4 너비 - 여백
  const contentHmm  = 297 - margins.top  - margins.bottom; // A4 높이 - 여백
  const contentWpt  = contentWmm * 2.8346;   // ≈ 425pt
  const contentHpt  = contentHmm * 2.8346;   // ≈ 658pt
  const lineHpt     = fontSize * lineHeight;  // ≈ 17.6pt
  const linesPerPage = Math.floor(contentHpt / lineHpt);   // ≈ 37줄

  // 대화 간격 (pt)
  const dialogueGapPt = parseFloat(preset.dialogueGap) * fontSize;  // 7em → 77pt

  // 평균 글자 폭: 한국어 ≈ fontSize, 라틴 ≈ 0.6×fontSize → 평균 ≈ 0.78×fontSize
  const avgCharPt     = fontSize * 0.78;
  const charsPerLine  = Math.floor(contentWpt / avgCharPt);
  const charsInSpeech = Math.max(20, Math.floor((contentWpt - dialogueGapPt) / avgCharPt));

  return { contentWpt, contentHpt, lineHpt, linesPerPage,
           dialogueGapPt, charsPerLine, charsInSpeech, ... };
}
```

**토큰 높이 계산:**

```javascript
const TOKEN_HEIGHTS = {
  ep_title:      (lh, fs) => ((fs + 2) * lh + 14) / (fs * lh),
  scene_number:  (lh, fs) => 1 + 12 / (fs * lh),
  blank:         ()       => 1,
  action:        (lh, fs) => 1 + 1  / (fs * lh),
  dialogue:      (lh, fs) => 1 + 1  / (fs * lh),
  parenthetical: (lh, fs) => 1 + 1  / (fs * lh),
};
```

**페이지네이션:**

```javascript
export function paginate(tokens, metrics) {
  const pages = [];
  let page = [], used = 0;

  for (const token of tokens) {
    const h = token.height || 1;
    if (used + h > metrics.linesPerPage && page.length > 0) {
      pages.push(page);
      page = []; used = 0;
    }
    page.push(token);
    used += h;
  }
  if (page.length > 0) pages.push(page);
  return pages.length ? pages : [[]];
}
```

### 5.4 PDF 출력 (printPdf.jsx)

**라이브러리:** `@react-pdf/renderer` v3.4.5

**폰트 등록 (앱 시작 시 1회):**

```javascript
FONTS.filter(f => f.sourceType === 'bundled').forEach(f => {
  const variants = [];
  if (f.pdfFiles.normal) variants.push({ src: f.pdfFiles.normal, fontWeight: 400 });
  if (f.pdfFiles.bold && !f.pdfVfOnly) variants.push({ src: f.pdfFiles.bold, fontWeight: 700 });
  if (variants.length > 0) Font.register({ family: f.cssFamily, fonts: variants });
});
Font.registerHyphenationCallback(w => [w]);  // 한국어 하이픈 비활성화
```

**주요 스타일 (makeStyles):**

```javascript
{
  page:        { fontFamily, fontSize, lineHeight, color: '#000', padding: margins },
  scene:       { fontWeight: 700, marginTop: 10, marginBottom: 2 },
  action:      { marginLeft: 8, marginBottom: 1 },
  dialogueRow: { flexDirection: 'row', marginBottom: 1 },
  charCell:    { width: dialogueGapPt, fontWeight: 700, flexShrink: 0 },
  speechCell:  { flex: 1 },
  paren:       { marginLeft: dialogueGapPt, fontSize: fs - 1, color: '#444' },
  // ※ fontStyle: 'italic' 없음 — 한국어 번들 폰트에 이탤릭 변형 없음
  transition:  { textAlign: 'right', marginVertical: 4 },
  pageNum:     { position: 'absolute', bottom: '15mm', textAlign: 'center' },
}
```

**에러 처리:**

```javascript
} catch (err) {
  if (err.message?.includes('font') || err.message?.includes('resolve')) {
    throw new Error(`폰트 오류: ${err.message}\n\n'함초롱바탕' 글꼴로 변경 후 다시 시도하세요.`);
  }
  if (err.message?.includes('hasOwnProperty') || err.message?.includes('undefined')) {
    throw new Error(`PDF 렌더링 오류\n\n해결 방법:\n• 개발 서버를 재시작하세요\n• '함초롱바탕'으로 변경 후 다시 시도하세요.`);
  }
  throw err;
}
```

### 5.5 DOCX 출력 (printDocx.js)

**라이브러리:** `docx` (OOXML 생성기)

- 단위: mm → twip (`convertMillimetersToTwip`), pt → half-pt
- 줄 간격: `LineRuleType.EXACT`, fontSize × lineHeight × 20 twips
- 대화 레이아웃: 탭스톱(TabStop) 기반 — 인물명 + `\t` + 대사
- 섹션별 페이지 번호 초기화: 각 회차마다 `pageNumbers: { start: 1 }`
- 표지: footer 없는 섹션 (페이지 번호 없음)

### 5.6 HWPX 출력 (hwpxBuilder.js)

**형식:** JSZip 기반 ZIP → HWPML 2.0 XML

```
output.hwpx (ZIP)
├── mimetype                    (비압축 저장)
├── META-INF/container.xml
├── Contents/
│   ├── content.hpf             (OPF 매니페스트)
│   ├── header.xml              (폰트, 스타일, 페이지 레이아웃)
│   └── section0.xml            (본문)
```

HWP 단위: 1 unit ≈ 0.003527mm. A4 = 59528 × 84188 unit.

### 5.7 한컴 호환 DOCX (hancomExporter.js)

- 함초롱바탕(HCRBatang) 폰트 고정
- HWP 2014+ 및 한컴오피스에서 열 수 있는 표준 DOCX

---

## 6. 폰트 시스템

### 6.1 FontRegistry.js — 단일 폰트 카탈로그

**FONTS 배열 구조:**

```javascript
{
  id:          'hcr-batang',
  displayName: '함초롱바탕',
  cssFamily:   'HCRBatang',
  cssStack:    "'HCRBatang', 'Batang', serif",
  sourceType:  'bundled',    // 'system'이면 PDF 임베딩 불가
  pdfVfOnly:   false,        // true이면 weight 400만 등록
  pdfFiles: {
    normal:    '/fonts/HCRBatang.ttf',
    bold:      '/fonts/HCRBatang-Bold.ttf',
    italic:    null,
    boldItalic: null,
  },
  docxName: 'HCR Batang',
}
```

**폰트 유형:**

| 폰트 | sourceType | PDF 임베딩 | 비고 |
|------|-----------|-----------|------|
| 함초롱바탕 | bundled | ✅ | 기본 폰트, 이탤릭 없음 |
| Noto Serif KR | bundled | ✅ | Regular + Bold |
| Noto Sans KR | bundled | ✅ | VF + Regular/Bold |
| 맑은 고딕 | system | ❌ | Noto Sans KR로 자동 폴백 |
| 나눔명조 | system | ❌ | 함초롱바탕으로 자동 폴백 |

### 6.2 가용성 검사 (checkFontsAvailability)

앱 최초 PDF 출력 시 1회 실행. 번들 폰트 파일에 HEAD 요청을 보내 실제 접근 가능 여부 확인.

```javascript
const ok = await fetch(fontUrl, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
```

결과: `{ byFont: { fontId: { normal, bold, ... } }, missing: [], partialStyles: {} }`

### 6.3 폰트 상태

| 상태 | 의미 | UI 표시 |
|------|------|---------|
| `FULL` | normal + bold 모두 있음 | `PDF ✓` |
| `PARTIAL` | normal만 있음 | `PDF △` |
| `UNAVAILABLE` | normal 파일 없음 | `PDF ✗` |
| `SYSTEM` | 시스템 폰트 (임베딩 불가) | `화면 전용` |

### 6.4 resolveFont(preset, target)

```javascript
export function resolveFont(preset, target) {
  const fontMeta = getFontByCssFamily(preset?.fontFamily) || DEFAULT_FONT;

  if (target === 'editor' || target === 'preview')
    return { cssStack: fontMeta.cssStack };

  if (target === 'pdf') {
    const effective = fontMeta.sourceType === 'system'
      ? getSystemFontFallback(fontMeta)
      : fontMeta;
    return { pdfFamily: effective.cssFamily, pdfFiles: effective.pdfFiles };
  }

  if (target === 'docx')
    return { fontName: fontMeta.docxName };
}
```

---

## 7. 미리보기 시스템

### 7.1 PreviewRenderer (PreviewRenderer.jsx)

출력 파이프라인과 동일한 데이터 흐름으로 HTML A4 페이지를 렌더링한다.

```
appState + selections
    ↓
buildPrintModel()
    ↓
tokenizeSection() + paginate()
    ↓
HTML A4 페이지 렌더링 (scale 적용)
```

**A4 스케일 계산:**

```javascript
const A4_W_PX = 794;   // 96dpi 기준 210mm
const A4_H_PX = 1123;  // 96dpi 기준 297mm
const scale   = columnWidth / A4_W_PX;  // columnWidth=340 → scale≈0.428
```

각 페이지는 CSS `transform: scale(${scale})`로 컨테이너에 맞게 축소된다.

### 7.2 토큰 종류별 HTML 렌더링

| 토큰 kind | 스타일 |
|-----------|--------|
| `scene_number` | fontWeight: 700, marginTop: 10pt |
| `action` | marginLeft: 8mm |
| `dialogue` | flex row — charName(bold, 고정폭) + speech(flex: 1) |
| `parenthetical` | marginLeft: dialogueGapPt, fontStyle: italic |
| `transition` | textAlign: right |
| `ep_title` | fontSize+2, fontWeight: 700, textAlign: center |
| `blank` | 빈 div, 1줄 높이 |

---

## 8. localStorage 저장 / 복구

### 8.1 저장 키

| 키 | 내용 | 갱신 시점 |
|----|------|----------|
| `drama_projects` | 프로젝트 배열 | 상태 변경 시 디바운스 자동저장 |
| `drama_episodes` | 회차 배열 | 동상 |
| `drama_characters` | 인물 배열 | 동상 |
| `drama_scenes` | 씬 배열 | 동상 |
| `drama_scriptBlocks` | 대본 블록 배열 | 동상 |
| `drama_coverDocs` | 표지 배열 | 동상 |
| `drama_synopsisDocs` | 시놉시스 배열 | 동상 |
| `drama_resources` | 참고자료 배열 | 동상 |
| `drama_stylePresets` | 출력 스타일 프리셋 | 동상 |

### 8.2 초기화 흐름

```javascript
function loadInitialState() {
  // localStorage에서 각 키 읽기
  // 없으면 빈 배열 / 기본값으로 초기화
  return {
    projects:    getAll('projects'),
    episodes:    getAll('episodes'),
    characters:  getAll('characters'),
    // ...
    stylePreset: getItem('stylePresets') ?? DEFAULT_STYLE_PRESET,
  };
}
```

### 8.3 제약

- 브라우저별 5~10MB 용량 제한
- 같은 브라우저 / 같은 origin에서만 접근 가능
- localStorage 초기화 시 복구 불가 → 주기적인 파일 내보내기 권장

---

## 9. 공유 / 검토 링크 시스템

### 9.1 링크 생성 (buildReviewURL — App.jsx)

```javascript
export function buildReviewURL(state, selections) {
  const payload = {
    appState: filterStateBySelections(state, selections),
    selections,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${window.location.origin}${window.location.pathname}#review=${encoded}`;
}
```

- URL 해시(`#review=BASE64`)에 선택 범위의 상태를 인코딩
- 서버 불필요, 완전 클라이언트 사이드
- URL 길이가 실질적인 한계 (브라우저별 수십만 자)

### 9.2 검토 뷰어 (SharedReviewView.jsx)

```javascript
// App.jsx 분기
if (window.location.hash.startsWith('#review=')) {
  return <SharedReviewView />;
}

// SharedReviewView 내부
const payload = JSON.parse(decodeURIComponent(escape(atob(hash))));
// → 읽기 전용 PreviewRenderer 표시 + 피드백 textarea
```

**보호 사항:**
- 에디터 접근 불가 (PreviewRenderer만 렌더링)
- 데이터 저장/수정 불가 (dispatch 없음)
- 피드백은 클립보드 복사로만 전달

---

## 10. 단축키 및 UX 인터랙션

### 10.1 에디터 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl+1` | 현재 블록 → 씬번호 |
| `Ctrl+2` | 현재 블록 → 지문 |
| `Ctrl+3` | 현재 블록 → 대사 |
| `Ctrl+S` | 즉시 저장 |
| `Enter` | 같은 타입 새 블록 추가 |
| `Shift+Enter` | 블록 내 줄바꿈 |

### 10.2 패널 표시 토글

- 좌측 패널 접기/펼치기 버튼
- 접힌 상태에서도 아이콘 표시

### 10.3 검토 링크 공유

PrintPreviewModal의 "검토 링크 공유" 버튼 → `buildReviewURL()` → 클립보드 복사

---

## 11. CSS 및 디자인 시스템

### 11.1 CSS 변수 (테마)

```css
:root {
  --c-bg:      #f8f9fa;   /* 앱 전체 배경 */
  --c-surface: #ffffff;   /* 패널, 카드 */
  --c-panel:   #f3f4f6;   /* 사이드 패널 */
  --c-border:  #e5e7eb;
  --c-border2: #d1d5db;
  --c-text:    #1f2937;   /* 본문 */
  --c-text2:   #374151;
  --c-text5:   #9ca3af;   /* 레이블, 메타 */
  --c-text6:   #d1d5db;   /* 비활성 */
  --c-accent:  #2563eb;   /* 주 버튼, 링크 */
  --c-active:  #dbeafe;   /* 선택된 항목 */
  --c-hover:   #f3f4f6;
}
```

### 11.2 스타일 프리셋 기본값

```javascript
const DEFAULT_STYLE_PRESET = {
  fontFamily:   '함초롱바탕',
  fontSize:     11,        // pt
  lineHeight:   1.6,       // 160%
  pageSize:     'A4',
  pageMargins:  { top: 35, right: 30, bottom: 30, left: 30 },  // mm
  dialogueGap:  '7em',
};
```

---

## 12. 핵심 데이터 흐름 시나리오

### 12.1 새 작품 생성

```
[새 작품] 버튼 클릭
    ↓
dispatch({ type: 'ADD_PROJECT', payload: { id, title, createdAt } })
    ↓
reducer: projects 배열에 추가
    ↓
useEffect → 500ms 후 localStorage 저장
    ↓
dispatch({ type: 'SET_ACTIVE_PROJECT', payload: id })
    ↓
activeDoc = 'cover' → CoverEditor 표시
```

### 12.2 대본 블록 편집

```
사용자 타이핑 (ScriptEditor 내부)
    ↓
편집 상태 업데이트 (컴포넌트 로컬 state)
    ↓
디바운스 (약 500ms)
    ↓
dispatch({ type: 'SET_SCRIPT_BLOCKS', payload: { episodeId, blocks } })
    ↓
reducer: scriptBlocks 배열 해당 회차 교체
    ↓
localStorage 자동저장
```

### 12.3 PDF 내보내기

```
[PDF 저장] 클릭
    ↓
exportPdf(state, selections, { onStep })
    ↓
buildPrintModel(appState, selections, preset)
    ↓
buildPdfDocument(printModel)
    → @react-pdf/renderer <Document> 구성
    → 각 섹션 tokenize + paginate
    → <PdfPage>, <CoverPage> 컴포넌트
    ↓
pdf(doc).toBlob()
    ↓
<a href=blob download="작품명.pdf"> 자동 클릭 → 다운로드
```

### 12.4 검토 링크 공유 → 검토자 피드백

```
[검토 링크 공유] 클릭
    ↓
buildReviewURL(state, sel) → BASE64 URL 생성
    ↓
navigator.clipboard.writeText(url)
    ↓
검토자: URL 접속 → hash '#review=...' 감지
    ↓
SharedReviewView 렌더링 (읽기 전용 미리보기)
    ↓
검토자: 피드백 textarea 작성 → [복사] → 작가에게 전달
```

---

## 13. 알려진 제약 및 한계

### 13.1 PDF 렌더링

| 제약 | 원인 | 대응 |
|------|------|------|
| 한국어 폰트 이탤릭 없음 | 번들 폰트에 이탤릭 파일 미포함 | `paren` 스타일에서 `fontStyle: 'italic'` 제거 |
| 시스템 폰트 임베딩 불가 | PDF는 파일 경로 접근 가능한 폰트만 가능 | 자동으로 번들 폰트 폴백 |
| "hasOwnProperty" 오류 | pdfkit 내부 오류, Vite 캐시 오염 추정 | 서버 재시작 또는 폰트 변경 |
| 페이지 분할 근사치 | LineTokenizer는 글자 수 기반 계산 | 출력 전 미리보기 확인 권장 |

### 13.2 저장

| 제약 | 내용 |
|------|------|
| 용량 제한 | 브라우저별 5~10MB |
| 기기 간 동기화 없음 | 단일 브라우저에만 저장 |
| 실수 삭제 복구 불가 | localStorage 초기화 시 복구 없음 |

### 13.3 출력 형식

| 형식 | 제약 |
|------|------|
| HWPX | 한글 2014 이상 전용, MS Word 열림 불가 |
| DOCX | 폰트 미임베딩 (OS에 폰트 설치 필요) |
| 한컴DOCX | 함초롱바탕 고정 |

---

## 14. 버그 수정 이력 (2026-04-03)

### 14.1 모바일 레이아웃 흑화면 시리즈

**근본 원인:** 구형 모바일 브라우저(Samsung Internet < 12, 구형 iOS Safari)의 CSS 미지원

| 증상 | 원인 | 수정 |
|------|------|------|
| 전체 레이아웃 찌그러짐 | `100svh` / `100dvh` 미지원 → height 0 | `position: fixed; bottom: 0` 방식으로 교체 |
| Synopsis/Script 흑화면 | CSS `inset: 0` 단축 속성 미지원 | `top/right/bottom/left` 명시로 교체 |
| Synopsis/Script 흑화면 | `flex-1 min-h-0` 체인이 구형 브라우저에서 높이 미계산 | `position: absolute; top:0; right:0; bottom:0; left:0` 방식으로 교체 |

**적용 파일:** `App.jsx`, `SynopsisEditor.jsx`, `ScriptEditor.jsx`

---

### 14.2 Synopsis JS 크래시 (흑화면)

**파일:** `src/components/SynopsisEditor.jsx`

**증상:** 시놉시스 페이지 진입 시 JavaScript 오류 → 컴포넌트 unmount → 흑화면

**원인:**
```js
// 기존 코드 — doc 전체를 spread
function migrateDoc(doc) {
  if (doc.genre !== undefined) return { logline: '', ...doc };
  //  ↑ doc에 포함된 createdAt, updatedAt (숫자) 등이 sections에 섞임
}

// 이후 stripHtml 호출 시
const plainAll = Object.values(sections).map(stripHtml).join(' ');
// → stripHtml(1234567) → (1234567 || '').replace(...)
// → TypeError: (e || "").replace is not a function
```

**수정:** `migrateDoc`에서 필요한 5개 필드만 명시적으로 추출

---

### 14.3 힌트 오버레이가 시놉시스 위에 남는 버그

**파일:** `src/components/mobile/MobileOnboardingTour.jsx`

**증상:** 표지 → 시놉시스 이동 시 이전 힌트 오버레이가 시놉시스 위를 덮음

**수정:** `activeDoc` 변경 시 `hintId`, `hintRect` 초기화하는 `useEffect` 추가

---

### 14.4 WorkTimer — 다른 창 전환 시에도 시간이 흘러가는 버그

**파일:** `src/App.jsx`

**증상:** 데스크톱에서 다른 앱/창을 열어도 타이머가 계속 진행됨

**원인:** `blur`/`visibilitychange` 이벤트 처리 없음. 30초 유예 동안 `activeRef`가 `true`로 유지됨

**수정:** `window.blur`, `document.visibilitychange` 이벤트에서 즉시 `activeRef = false`로 설정

---

### 14.5 기타 버튼 스타일 불일치

**파일:** `src/components/ScriptEditor.jsx`

`SymbolPicker` 내 "기타" 버튼이 S#/지문/대사/등장/연결 버튼과 다른 스타일 사용.
각 툴바(상단 고정 / 모바일 키보드)의 기준 스타일에 맞게 통일.

---

### 14.6 Script 진입 시 하단 패널 자동 닫힘

**파일:** `src/App.jsx`

`Shell` 컴포넌트에 `useEffect` 추가 — `activeDoc === 'script' && activeEpisodeId` 조건 시 `setMobileBottomOpen(false)` 호출.

---

## 15. 워크플로우 규칙 (2026-04-03 확정)

1. 수정 요청 → `plan.md`에 계획 정리
2. 코드 수정
3. 사용자가 내부 dev 서버에서 확인
4. 빌드 요청 시 → `npm run build` + `git push`

---

*이 보고서는 `src/` 디렉토리의 모든 소스 파일을 기반으로 작성되었다.*
*v2 폴더(`src/v2/`)는 2026-04-01 삭제되었으며 현재 코드베이스에 존재하지 않는다.*
