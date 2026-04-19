import { stripHtml } from './textFormat';

// ─── 정규식 특수문자 이스케이프 ──────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 블록 plainText 추출 (content만, charName 제외) ──────────────────────────
export function getBlockPlainText(block) {
  if (!block || !block.content) return '';
  if (typeof block.content === 'string') return stripHtml(block.content);
  return '';
}

// ─── 단일 문자열 치환 ────────────────────────────────────────────────────────
export function replaceInText(text, query, replacement, options = {}) {
  const { caseSensitive = false } = options;
  if (!query) return text;
  if (caseSensitive) {
    return text.split(query).join(replacement);
  }
  return text.replace(new RegExp(escapeRegex(query), 'gi'), replacement);
}

// ─── HTML 내부 text node만 치환 (태그 보존) ──────────────────────────────────
// 제약: 검색어가 태그 경계를 넘으면 매칭 안 됨
export function replaceInHtml(html, query, replacement, options = {}) {
  if (!query) return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  textNodes.forEach(tn => {
    const next = replaceInText(tn.textContent, query, replacement, options);
    if (next !== tn.textContent) tn.textContent = next;
  });
  return root.innerHTML;
}

// ─── 블록 배열 검색 ──────────────────────────────────────────────────────────
/**
 * @param {Array}  blocks
 * @param {string} query
 * @param {Object} options
 * @param {boolean}       options.caseSensitive - 기본 false
 * @param {string[]|null} options.blockTypes    - null이면 전체 블록
 * @param {string}        options.searchScope
 *   'content_only'         - content만 검색 (일반 찾기/바꾸기 기본값)
 *   'content_and_charname' - content + charName 검색 (인물 이름 변경)
 *   'charname_only'        - charName만 검색
 *
 * charName 매칭은 부분 일치가 아닌 정확 일치 (exact match).
 * 이유: charName은 짧은 단어라 부분 매칭 시 "지수" 쿼리가 "지수진"에도 걸림.
 *
 * @returns {Array<{blockId, blockType, blockIndex, matchIndex, matchText, matchField, context}>}
 */
export function findMatches(blocks, query, options = {}) {
  const { caseSensitive = false, blockTypes = null, searchScope = 'content_only' } = options;
  if (!query) return [];

  // ── DEBUG ────────────────────────────────────────────────────────────────────
  console.log('[findMatches] called', { blocksLength: blocks?.length, query, searchScope, caseSensitive, blockTypes });
  if (blocks?.[0]) {
    console.log('[findMatches] firstBlock sample', { type: blocks[0].type, charName: blocks[0].charName, characterId: blocks[0].characterId, contentPreview: String(blocks[0].content || '').slice(0, 40) });
  }
  const exactCharNameBlocks = (blocks || []).filter(b => b.charName === query);
  const caseCharNameBlocks  = (blocks || []).filter(b => typeof b.charName === 'string' && b.charName.toLowerCase() === query.toLowerCase());
  console.log('[findMatches] blocks with charName===query (exact):', exactCharNameBlocks.length, '| case-insensitive:', caseCharNameBlocks.length);
  // ────────────────────────────────────────────────────────────────────────────

  const results = [];
  const needle = caseSensitive ? query : query.toLowerCase();

  blocks.forEach((block, blockIndex) => {
    if (blockTypes && !blockTypes.includes(block.type)) return;

    // ── content 검색 ──────────────────────────────────────────────────────
    if (searchScope !== 'charname_only') {
      const plain = getBlockPlainText(block);
      const haystack = caseSensitive ? plain : plain.toLowerCase();

      let start = 0;
      while (true) {
        const idx = haystack.indexOf(needle, start);
        if (idx === -1) break;

        const ctxStart = Math.max(0, idx - 20);
        const ctxEnd   = Math.min(plain.length, idx + query.length + 20);

        results.push({
          blockId:    block.id,
          blockType:  block.type,
          blockIndex,
          matchIndex: idx,
          matchText:  plain.substring(idx, idx + query.length),
          matchField: 'content',
          context: {
            before: plain.substring(ctxStart, idx),
            match:  plain.substring(idx, idx + query.length),
            after:  plain.substring(idx + query.length, ctxEnd),
          },
        });

        start = idx + query.length;
      }
    }

    // ── charName 검색 — 정확 일치만 (인물 이름 변경 팝업에서만 사용) ────────
    if (searchScope !== 'content_only' && block.charName && typeof block.charName === 'string') {
      const charHay = caseSensitive ? block.charName : block.charName.toLowerCase();
      if (charHay === needle) {
        results.push({
          blockId:    block.id,
          blockType:  block.type,
          blockIndex,
          matchIndex: 0,
          matchText:  block.charName,
          matchField: 'charName',
          context: {
            before: '',
            match:  block.charName,
            after:  '',
          },
        });
      }
    }
  });

  console.log('[findMatches] returning', results.length, 'results', '| charName hits:', results.filter(r => r.matchField === 'charName').length, '| content hits:', results.filter(r => r.matchField === 'content').length);
  return results;
}

// ─── 블록 배열 전체 치환 ─────────────────────────────────────────────────────
/**
 * @param {Array}  blocks
 * @param {string} query
 * @param {string} replacement
 * @param {Object} options
 * @param {boolean}       options.caseSensitive - 기본 false
 * @param {string[]|null} options.blockTypes    - null이면 전체 블록
 * @param {string}        options.searchScope   - 기본 'content_only'
 * @returns {Array} 변경된 항목만 새 객체, 나머지 참조 동일
 */
export function replaceAllInBlocks(blocks, query, replacement, options = {}) {
  const { blockTypes = null, searchScope = 'content_only' } = options;
  if (!query) return blocks;

  return blocks.map(block => {
    if (blockTypes && !blockTypes.includes(block.type)) return block;

    let changed = false;
    let newBlock = block;

    // content 치환
    if (searchScope !== 'charname_only') {
      const { content } = block;
      if (content && typeof content === 'string') {
        const newContent = /<[a-z][\s\S]*>/i.test(content)
          ? replaceInHtml(content, query, replacement, options)
          : replaceInText(content, query, replacement, options);
        if (newContent !== content) {
          newBlock = { ...newBlock, content: newContent };
          changed = true;
        }
      }
    }

    // charName 치환 — 정확 일치일 때만
    if (searchScope !== 'content_only' && block.charName && typeof block.charName === 'string') {
      const charHay = options.caseSensitive ? block.charName : block.charName.toLowerCase();
      const ndl     = options.caseSensitive ? query : query.toLowerCase();
      if (charHay === ndl) {
        newBlock = { ...newBlock, charName: replacement };
        if (block.characterName) newBlock = { ...newBlock, characterName: replacement };
        changed = true;
      }
    }

    return changed ? newBlock : block;
  });
}

// ─── 선택된 블록만 치환 (미리보기 확인 후 부분 실행) ────────────────────────
/**
 * @param {Array}    blocks
 * @param {string}   query
 * @param {string}   replacement
 * @param {Object}   options          - caseSensitive, blockTypes, searchScope
 * @param {Set|null} selectedBlockIds - null이면 전체, Set이면 포함된 blockId만
 */
export function replaceInSelectedBlocks(blocks, query, replacement, options = {}, selectedBlockIds = null) {
  const { blockTypes = null, searchScope = 'content_only' } = options;
  if (!query) return blocks;

  return blocks.map(block => {
    if (selectedBlockIds && !selectedBlockIds.has(block.id)) return block;
    if (blockTypes && !blockTypes.includes(block.type)) return block;

    let changed = false;
    let newBlock = block;

    // content 치환
    if (searchScope !== 'charname_only') {
      const { content } = block;
      if (content && typeof content === 'string') {
        const newContent = /<[a-z][\s\S]*>/i.test(content)
          ? replaceInHtml(content, query, replacement, options)
          : replaceInText(content, query, replacement, options);
        if (newContent !== content) { newBlock = { ...newBlock, content: newContent }; changed = true; }
      }
    }

    // charName 치환 — 정확 일치일 때만
    if (searchScope !== 'content_only' && block.charName && typeof block.charName === 'string') {
      const charHay = options.caseSensitive ? block.charName : block.charName.toLowerCase();
      const ndl     = options.caseSensitive ? query : query.toLowerCase();
      if (charHay === ndl) {
        newBlock = { ...newBlock, charName: replacement };
        if (block.characterName) newBlock = { ...newBlock, characterName: replacement };
        changed = true;
      }
    }

    return changed ? newBlock : block;
  });
}

// ─── 시놉시스 문서 검색/치환 ─────────────────────────────────────────────────
const SYNOPSIS_FIELDS = [
  { key: 'genre',   label: '장르',    isHtml: false },
  { key: 'theme',   label: '주제',    isHtml: true  },
  { key: 'intent',  label: '기획의도', isHtml: true  },
  { key: 'logline', label: '로그라인', isHtml: true  },
  { key: 'story',   label: '줄거리',  isHtml: true  },
];

export function findInSynopsisDoc(doc, query, options = {}) {
  if (!doc || !query) return [];
  const { caseSensitive = false } = options;
  const needle = caseSensitive ? query : query.toLowerCase();
  const results = [];

  SYNOPSIS_FIELDS.forEach(({ key, label, isHtml }) => {
    const value = doc[key];
    if (!value || typeof value !== 'string') return;
    const plain = isHtml ? stripHtml(value) : value;
    const haystack = caseSensitive ? plain : plain.toLowerCase();
    let start = 0;
    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx === -1) break;
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd   = Math.min(plain.length, idx + query.length + 20);
      results.push({
        source: 'synopsisDoc', docId: doc.id, field: key, fieldLabel: label, isHtml,
        matchIndex: idx,
        context: { before: plain.substring(ctxStart, idx), match: plain.substring(idx, idx + query.length), after: plain.substring(idx + query.length, ctxEnd) },
      });
      start = idx + query.length;
    }
  });
  return results;
}

export function replaceInSynopsisDoc(doc, query, replacement, options = {}, selectedFields = null) {
  if (!doc || !query) return doc;
  let changed = false;
  const newDoc = { ...doc };
  SYNOPSIS_FIELDS.forEach(({ key, isHtml }) => {
    if (selectedFields && !selectedFields.has(key)) return;
    const value = doc[key];
    if (!value || typeof value !== 'string') return;
    const newValue = isHtml
      ? replaceInHtml(value, query, replacement, options)
      : replaceInText(value, query, replacement, options);
    if (newValue !== value) { newDoc[key] = newValue; changed = true; }
  });
  return changed ? newDoc : doc;
}

// ─── 인물 소개 검색/치환 ─────────────────────────────────────────────────────
export function findInCharacterIntro(character, query, options = {}) {
  if (!character?.intro || !query) return [];
  const { caseSensitive = false } = options;
  const needle = caseSensitive ? query : query.toLowerCase();
  const plain = character.intro;
  const haystack = caseSensitive ? plain : plain.toLowerCase();
  const results = [];
  let start = 0;
  while (true) {
    const idx = haystack.indexOf(needle, start);
    if (idx === -1) break;
    const ctxStart = Math.max(0, idx - 20);
    const ctxEnd   = Math.min(plain.length, idx + query.length + 20);
    results.push({
      source: 'characterIntro', characterId: character.id,
      characterName: character.givenName || character.name || '',
      matchIndex: idx,
      context: { before: plain.substring(ctxStart, idx), match: plain.substring(idx, idx + query.length), after: plain.substring(idx + query.length, ctxEnd) },
    });
    start = idx + query.length;
  }
  return results;
}

export function replaceInCharacterIntro(character, query, replacement, options = {}) {
  if (!character?.intro || !query) return character;
  const newIntro = replaceInText(character.intro, query, replacement, options);
  if (newIntro === character.intro) return character;
  return { ...character, intro: newIntro };
}

// ─── 에피소드 트리트먼트 검색/치환 ───────────────────────────────────────────
export function findInEpisodeSummary(episode, query, options = {}) {
  if (!episode?.summaryItems?.length || !query) return [];
  const { caseSensitive = false } = options;
  const needle = caseSensitive ? query : query.toLowerCase();
  const results = [];
  episode.summaryItems.forEach((item, itemIndex) => {
    if (!item.text || typeof item.text !== 'string') return;
    const plain = item.text;
    const haystack = caseSensitive ? plain : plain.toLowerCase();
    let start = 0;
    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx === -1) break;
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd   = Math.min(plain.length, idx + query.length + 20);
      results.push({
        source: 'episodeSummary', episodeId: episode.id,
        episodeNumber: episode.number, episodeTitle: episode.title || '',
        itemId: item.id, itemIndex, matchIndex: idx,
        context: { before: plain.substring(ctxStart, idx), match: plain.substring(idx, idx + query.length), after: plain.substring(idx + query.length, ctxEnd) },
      });
      start = idx + query.length;
    }
  });
  return results;
}

export function replaceInEpisodeSummary(episode, query, replacement, options = {}, selectedItemIds = null) {
  if (!episode?.summaryItems?.length || !query) return episode;
  let changed = false;
  const newItems = episode.summaryItems.map(item => {
    if (selectedItemIds && !selectedItemIds.has(item.id)) return item;
    if (!item.text || typeof item.text !== 'string') return item;
    const newText = replaceInText(item.text, query, replacement, options);
    if (newText === item.text) return item;
    changed = true;
    return { ...item, text: newText };
  });
  return changed ? { ...episode, summaryItems: newItems } : episode;
}

// ─── 표지 문서 검색/치환 ─────────────────────────────────────────────────────
const COVER_FIELDS = [
  { key: 'title',       label: '제목'     },
  { key: 'subtitle',    label: '부제'     },
  { key: 'writer',      label: '작가'     },
  { key: 'coWriter',    label: '공동작가' },
  { key: 'genre',       label: '장르'     },
  { key: 'broadcaster', label: '방송사'   },
  { key: 'note',        label: '메모'     },
];

export function findInCoverDoc(doc, query, options = {}) {
  if (!doc || !query) return [];
  const { caseSensitive = false } = options;
  const needle = caseSensitive ? query : query.toLowerCase();
  const results = [];

  COVER_FIELDS.forEach(({ key, label }) => {
    const value = doc[key];
    if (!value || typeof value !== 'string') return;
    const haystack = caseSensitive ? value : value.toLowerCase();
    let start = 0;
    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx === -1) break;
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd   = Math.min(value.length, idx + query.length + 20);
      results.push({
        source: 'coverDoc', docId: doc.id, field: key, fieldLabel: label, matchIndex: idx,
        context: { before: value.substring(ctxStart, idx), match: value.substring(idx, idx + query.length), after: value.substring(idx + query.length, ctxEnd) },
      });
      start = idx + query.length;
    }
  });

  const customFields = doc.fields || doc.customFields || [];
  customFields.forEach((cf, cfIndex) => {
    if (!cf.value || typeof cf.value !== 'string') return;
    const haystack = caseSensitive ? cf.value : cf.value.toLowerCase();
    let start = 0;
    while (true) {
      const idx = haystack.indexOf(needle, start);
      if (idx === -1) break;
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd   = Math.min(cf.value.length, idx + query.length + 20);
      results.push({
        source: 'coverDocCustom', docId: doc.id, fieldId: cf.id,
        fieldLabel: cf.label || `필드${cfIndex + 1}`, fieldIndex: cfIndex, matchIndex: idx,
        context: { before: cf.value.substring(ctxStart, idx), match: cf.value.substring(idx, idx + query.length), after: cf.value.substring(idx + query.length, ctxEnd) },
      });
      start = idx + query.length;
    }
  });

  return results;
}

// selection: { fields: Set<string>, customFieldIds: Set<string> } | null (= all)
export function replaceInCoverDoc(doc, query, replacement, options = {}, selection = null) {
  if (!doc || !query) return doc;
  let changed = false;
  const newDoc = { ...doc };

  COVER_FIELDS.forEach(({ key }) => {
    if (selection?.fields && !selection.fields.has(key)) return;
    const value = doc[key];
    if (!value || typeof value !== 'string') return;
    const newValue = replaceInText(value, query, replacement, options);
    if (newValue !== value) { newDoc[key] = newValue; changed = true; }
  });

  const customFields = doc.fields || doc.customFields || [];
  const newCustom = customFields.map(cf => {
    if (selection?.customFieldIds && !selection.customFieldIds.has(cf.id)) return cf;
    if (!cf.value || typeof cf.value !== 'string') return cf;
    const newValue = replaceInText(cf.value, query, replacement, options);
    if (newValue === cf.value) return cf;
    changed = true;
    return { ...cf, value: newValue };
  });
  if (doc.fields)       newDoc.fields       = newCustom;
  if (doc.customFields) newDoc.customFields = newCustom;

  return changed ? newDoc : doc;
}

// ─── 단일 블록 치환 (특정 matchIndex 하나만) ─────────────────────────────────
export function replaceOneInBlock(block, query, replacement, matchIndex, options = {}) {
  const { caseSensitive = false } = options;
  if (!query) return block;

  const { content } = block;
  if (!content || typeof content !== 'string') return block;

  const plain = getBlockPlainText(block);
  const needle = caseSensitive ? query : query.toLowerCase();
  const haystack = caseSensitive ? plain : plain.toLowerCase();

  if (haystack.indexOf(needle, matchIndex) !== matchIndex) return block;

  const before = plain.substring(0, matchIndex);
  const after  = plain.substring(matchIndex + query.length);
  const newPlain = before + replacement + after;

  const newContent = /<[a-z][\s\S]*>/i.test(content)
    ? replaceInHtml(content, query, replacement, { ...options, _once: true, _at: matchIndex })
    : newPlain;

  if (newContent === content) return block;
  return { ...block, content: newContent };
}
