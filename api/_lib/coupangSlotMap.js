// AdBanner의 slot명을 검색 키워드 풀에 매핑.
// 같은 슬롯이라도 6시간 주기로 키워드가 회전하여 노출이 단조롭지 않도록 한다.
//
// 키워드는 한국어 작가/창작자 친화적인 상품 위주로 큐레이션.
// 단, 매핑이 빈약한 슬롯은 일반 베스트셀러로 폴백.

const COVER_GROUP        = ['집필 노트', '시나리오 노트', '독서대'];
const SYNOPSIS_GROUP     = ['창작 노트', '글쓰기 책'];
const BIOGRAPHY_GROUP    = ['캐릭터 빌더', '인물 사전'];
const RELATIONS_GROUP    = ['감정 카드', '캐릭터 워크북'];
const RESOURCES_GROUP    = ['디지털 노트', '아이패드 펜슬', '책상 정리'];
const TREATMENT_GROUP    = ['시나리오 책', '글쓰기 책'];
const CHARACTERS_GROUP   = ['캐릭터 워크북', '인물 사전'];
const SCENELIST_GROUP    = ['글쓰기 노트', '메모 보드'];
const SETTINGS_GROUP     = ['책상 의자', '독서등'];
const STRUCTURE_GROUP    = ['시나리오 가이드', '시나리오 작법'];
const CHECKLIST_GROUP    = ['투두 보드', '데스크 패드'];
const EDITOR_BOTTOM      = ['기계식 키보드', '버티컬 마우스', '독서대'];
const PRINT_MODAL_GROUP  = ['프린터', '복합기', 'A4 용지'];
const MOBILE_GROUP       = ['베스트셀러', '에어팟', '아이패드'];

const SLOT_KEYWORDS = {
  // ── Right panel — 2개씩 ──
  'cover-panel-1':         COVER_GROUP,
  'cover-panel-2':         COVER_GROUP,
  'synopsis-panel-1':      SYNOPSIS_GROUP,
  'synopsis-panel-2':      SYNOPSIS_GROUP,
  'biography-panel-1':     BIOGRAPHY_GROUP,
  'biography-panel-2':     BIOGRAPHY_GROUP,
  'relationships-panel-1': RELATIONS_GROUP,
  'relationships-panel-2': RELATIONS_GROUP,
  'resources-panel-1':     RESOURCES_GROUP,
  'resources-panel-2':     RESOURCES_GROUP,
  'treatment-panel-1':     TREATMENT_GROUP,
  'treatment-panel-2':     TREATMENT_GROUP,
  'characters-panel-1':    CHARACTERS_GROUP,
  'characters-panel-2':    CHARACTERS_GROUP,
  'scenelist-panel-1':     SCENELIST_GROUP,
  'scenelist-panel-2':     SCENELIST_GROUP,
  'settings-panel-1':      SETTINGS_GROUP,
  'settings-panel-2':      SETTINGS_GROUP,

  // ── Right panel — 단일 ──
  'structure-panel':       STRUCTURE_GROUP,
  'checklist':             CHECKLIST_GROUP,

  // ── 에디터 하단 ──
  'bottom-fixed-1':        EDITOR_BOTTOM,
  'bottom-fixed-2':        EDITOR_BOTTOM,
  'bottom-fixed-3':        EDITOR_BOTTOM,
  'bottom-fixed-4':        EDITOR_BOTTOM,

  // ── 출력 미리보기 모달 ──
  'print-modal-left':      PRINT_MODAL_GROUP,
  'print-modal-right':     PRINT_MODAL_GROUP,

  // ── 모바일 ──
  'mobile-bottom':         MOBILE_GROUP,
  'mobile-bottom-left':    MOBILE_GROUP,
  'mobile-memo-bottom':    MOBILE_GROUP,

  // ── 디렉터 대시보드 ──
  'director':              MOBILE_GROUP,
  'director-mobile-menu':  MOBILE_GROUP,
  'director-sidebar-1':    MOBILE_GROUP,
  'director-sidebar-2':    MOBILE_GROUP,

  // ── 정적 marketing/info 페이지 (static-ads.js) ──
  // 카카오 애드핏 정책상 모바일 단위(320×100)는 모바일에서만 → 데스크탑 하단은 쿠팡 가로 배너로.
  // html-bottom-1/2: 데스크탑 하단 쿠팡 (≥768px / #2는 ≥1280px). 나머지는 미사용(보존).
  'html-bottom-1':         ['베스트셀러', '아이패드'],
  'html-bottom-2':         ['에어팟', '독서대'],
  'html-bottom-3':         ['독서등', '데스크 패드'],
  'html-bottom-4':         ['기계식 키보드', '버티컬 마우스'],
  'html-sidebar-left':     ['집필 노트', '시나리오 책', '글쓰기 책'],
  'html-sidebar-right':    ['책상 의자', '독서등', '데스크 패드'],
};

const DEFAULT_KEYWORDS = ['베스트셀러'];
const ROTATION_MS = 6 * 60 * 60 * 1000; // 6시간

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getKeywordsForSlot(slot) {
  if (!slot) return DEFAULT_KEYWORDS;
  if (slot.startsWith('char-')) return CHARACTERS_GROUP;
  return SLOT_KEYWORDS[slot] || DEFAULT_KEYWORDS;
}

export function pickKeyword(slot, now = Date.now()) {
  const keywords = getKeywordsForSlot(slot);
  const rotation = Math.floor(now / ROTATION_MS);
  const idx = (hashString(slot || '') + rotation) % keywords.length;
  return keywords[idx];
}
