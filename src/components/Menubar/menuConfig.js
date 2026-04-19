// ─── Menu structure data ──────────────────────────────────────────────────────
// action 문자열은 App.jsx onMenuAction 핸들러와 1:1 매핑
// disabled: true → 클릭 무시, 회색 표시, disabledLabel 우측에 표시
// type: 'header'       → 섹션 제목 (비클릭)
// type: 'shortcutInfo' → 단축키 참고 항목 (비클릭, label+shortcut 표시)

export const menuConfig = [
  {
    id: 'file',
    label: '파일',
    altKey: 'f',
    items: [
      { id: 'new-project',  label: '새 작품',           shortcut: 'Ctrl+Alt+N',  action: 'file:new' },
      {
        id: 'open', label: '열기', hasSubmenu: true,
        submenu: [
          { id: 'open-list', label: '내 작품 목록…',    shortcut: 'Ctrl+O',      action: 'file:openList' },
          { id: 'open-file', label: '파일에서 열기…',   shortcut: 'Ctrl+Alt+O',  action: 'file:openFile' },
        ],
      },
      'separator',
      { id: 'save',    label: '저장',             shortcut: 'Ctrl+S',      action: 'file:save' },
      { id: 'save-as', label: '파일로 내보내기…', shortcut: 'Ctrl+Alt+S',  action: 'file:saveAs' },
      { id: 'export',  label: '내보내기',          shortcut: 'Ctrl+P',      action: 'file:export' },
      'separator',
      {
        id: 'import', label: '가져오기', hasSubmenu: true,
        submenu: [
          { id: 'import-hwpx',     label: 'HWPX에서 가져오기',     action: 'file:importHwpx' },
          { id: 'import-docx',     label: 'DOCX에서 가져오기',     action: 'file:importDocx' },
          { id: 'import-fdx',      label: 'FDX에서 가져오기',      action: 'file:importFdx',      disabled: true, disabledLabel: '준비 중' },
          { id: 'import-fountain', label: 'Fountain에서 가져오기', action: 'file:importFountain', disabled: true, disabledLabel: '준비 중' },
        ],
      },
      'separator',
      { id: 'share',    label: '링크 공유…',   shortcut: 'Ctrl+Alt+L', action: 'file:share' },
      { id: 'snapshot', label: '백업 / 복원…',                          action: 'file:snapshot' },
      { id: 'recent',   label: '최근 작품',    hasSubmenu: true, dynamic: 'recentProjects', submenu: [] },
      'separator',
      { id: 'project-info', label: '작품 정보…', action: 'file:projectInfo' },
    ],
  },

  {
    id: 'edit',
    label: '편집',
    altKey: 'e',
    items: [
      { id: 'undo',       label: '실행 취소',   shortcut: 'Ctrl+Z', action: 'edit:undo' },
      { id: 'redo',       label: '다시 실행',   shortcut: 'Ctrl+Y', action: 'edit:redo' },
      'separator',
      { id: 'cut',        label: '잘라내기',    shortcut: 'Ctrl+X', action: 'edit:cut' },
      { id: 'copy',       label: '복사',        shortcut: 'Ctrl+C', action: 'edit:copy' },
      { id: 'paste',      label: '붙여넣기',    shortcut: 'Ctrl+V', action: 'edit:paste' },
      'separator',
      { id: 'select-all', label: '모두 선택',   shortcut: 'Ctrl+A', action: 'edit:selectAll' },
      { id: 'find',       label: '찾기',        shortcut: 'Ctrl+F', action: 'edit:find' },
      { id: 'replace',    label: '바꾸기',      shortcut: 'Ctrl+H', action: 'edit:replace' },
    ],
  },

  {
    id: 'view',
    label: '보기',
    altKey: 'v',
    items: [
      { id: 'toggle-explorer', label: '프로젝트 탐색기', shortcut: 'Ctrl+Alt+1', action: 'view:toggleExplorer', checkable: true },
      { id: 'toggle-topbar',   label: '상단바',                                   action: 'view:toggleTopbar',   checkable: true },
      { id: 'split-view',      label: '분할 보기',        shortcut: 'Ctrl+Alt+2', action: 'view:splitView',      checkable: true },
      { id: 'focus-mode',      label: '집중 모드',        shortcut: 'F11',        action: 'view:focusMode' },
      'separator',
      { id: 'fullscreen',      label: '전체 화면',        shortcut: 'F12',        action: 'view:fullscreen' },
    ],
  },

  {
    id: 'insert',
    label: '삽입',
    altKey: 'i',
    items: [
      { id: 'insert-scene',    label: '씬 헤딩',  shortcut: 'Ctrl+Shift+1', action: 'insert:scene' },
      { id: 'insert-action',   label: '지문',     shortcut: 'Ctrl+Shift+2', action: 'insert:action' },
      { id: 'insert-dialogue', label: '대사',     shortcut: 'Ctrl+Shift+3', action: 'insert:dialogue' },
      'separator',
      { id: 'insert-character', label: '등장 인물', shortcut: 'Ctrl+Shift+4', action: 'insert:charCheck' },
      { id: 'insert-sceneref',  label: '씬 연결',  shortcut: 'Ctrl+Shift+5', action: 'insert:sceneRef' },
      { id: 'insert-symbol',    label: '기타',     shortcut: 'Ctrl+Shift+6', action: 'insert:symbol' },
      { id: 'insert-tag',       label: '태그',     shortcut: 'Ctrl+Shift+7', action: 'insert:tag' },
      'separator',
      { id: 'insert-note',    label: '노트',  action: 'insert:note',    disabled: true, disabledLabel: '준비 중' },
      { id: 'insert-comment', label: '주석',  action: 'insert:comment', disabled: true, disabledLabel: '준비 중' },
    ],
  },

  {
    id: 'format',
    label: '서식',
    altKey: 'o',
    items: [
      { id: 'bold',      label: '굵게',     shortcut: 'Ctrl+B', action: 'format:bold' },
      { id: 'italic',    label: '기울임',   shortcut: 'Ctrl+I', action: 'format:italic' },
      { id: 'underline', label: '밑줄',     shortcut: 'Ctrl+U', action: 'format:underline' },
      'separator',
      { id: 'format-style-settings', label: '기본 스타일…',    action: 'format:styleSettings' },
      { id: 'format-scene-format',   label: '씬헤더 형식…',    action: 'format:sceneFormat' },
      { id: 'format-user-settings',  label: '사용자 설정…',      action: 'format:userSettings' },
      { id: 'format-tag-manage',     label: '태그 / 기타 단축어…', action: 'format:tagManage' },
    ],
  },

  {
    id: 'tools',
    label: '도구',
    altKey: 't',
    items: [
      { id: 'spellcheck', label: '맞춤법 검사', action: 'tools:spellcheck', disabled: true, disabledLabel: '준비 중' },
      { id: 'wordcount',  label: '글자수 세기', action: 'tools:wordcount' },
      'separator',
      { id: 'settings',   label: '설정…',       action: 'tools:settings' },
    ],
  },

  {
    id: 'help',
    label: '도움말',
    altKey: 'h',
    items: [
      { id: 'manual', label: '사용 설명서', action: 'help:manual' },
      {
        id: 'shortcuts', label: '단축키 목록', hasSubmenu: true,
        submenu: [
          { id: 'sc-h1',        label: '파일',        type: 'header' },
          { id: 'sc-new',       label: '새 작품',     shortcut: 'Ctrl+Alt+N', type: 'shortcutInfo' },
          { id: 'sc-open',      label: '열기',        shortcut: 'Ctrl+O',     type: 'shortcutInfo' },
          { id: 'sc-save',      label: '저장',        shortcut: 'Ctrl+S',     type: 'shortcutInfo' },
          { id: 'sc-export',    label: '내보내기',    shortcut: 'Ctrl+P',     type: 'shortcutInfo' },
          { id: 'sc-share',     label: '링크 공유',   shortcut: 'Ctrl+Alt+L', type: 'shortcutInfo' },
          'separator',
          { id: 'sc-h2',        label: '편집',        type: 'header' },
          { id: 'sc-undo',      label: '실행 취소',   shortcut: 'Ctrl+Z',     type: 'shortcutInfo' },
          { id: 'sc-redo',      label: '다시 실행',   shortcut: 'Ctrl+Y',     type: 'shortcutInfo' },
          { id: 'sc-bold',      label: '굵게',        shortcut: 'Ctrl+B',     type: 'shortcutInfo' },
          { id: 'sc-italic',    label: '기울임',      shortcut: 'Ctrl+I',     type: 'shortcutInfo' },
          { id: 'sc-underline', label: '밑줄',        shortcut: 'Ctrl+U',     type: 'shortcutInfo' },
          'separator',
          { id: 'sc-h3',        label: '블록 삽입',   type: 'header' },
          { id: 'sc-scene',     label: '씬 헤딩',     shortcut: 'Ctrl+Shift+1', type: 'shortcutInfo' },
          { id: 'sc-action',    label: '지문',        shortcut: 'Ctrl+Shift+2', type: 'shortcutInfo' },
          { id: 'sc-dialogue',  label: '대사',        shortcut: 'Ctrl+Shift+3', type: 'shortcutInfo' },
          { id: 'sc-char',      label: '등장 인물',   shortcut: 'Ctrl+Shift+4', type: 'shortcutInfo' },
          { id: 'sc-ref',       label: '씬 연결',     shortcut: 'Ctrl+Shift+5', type: 'shortcutInfo' },
          { id: 'sc-sym',       label: '기타',        shortcut: 'Ctrl+Shift+6', type: 'shortcutInfo' },
          { id: 'sc-tag',       label: '태그',        shortcut: 'Ctrl+Shift+7', type: 'shortcutInfo' },
          'separator',
          { id: 'sc-h3b',           label: '에디터 입력',         type: 'header' },
          { id: 'sc-space2-scene',  label: '씬헤더 기호 삽입',    shortcut: 'Space × 2',  type: 'shortcutInfo' },
          { id: 'sc-space2-paren',  label: '괄호체 삽입 ( )',      shortcut: 'Space × 2',  type: 'shortcutInfo' },
          { id: 'sc-action-enter',  label: '인물명+Enter → 대사', shortcut: 'Enter',       type: 'shortcutInfo' },
          'separator',
          { id: 'sc-h4',        label: '보기',        type: 'header' },
          { id: 'sc-explorer',  label: '탐색기 토글', shortcut: 'Ctrl+Alt+1', type: 'shortcutInfo' },
          { id: 'sc-focus',     label: '집중 모드',   shortcut: 'F11',        type: 'shortcutInfo' },
          { id: 'sc-full',      label: '전체 화면',   shortcut: 'F12',        type: 'shortcutInfo' },
        ],
      },
      'separator',
      { id: 'notices', label: '공지사항',    action: 'help:notices' },
      { id: 'qa',      label: 'Q&A',         action: 'help:qa' },
      'separator',
      { id: 'about', label: '업데이트 내역', action: 'help:about' },
    ],
  },
];
