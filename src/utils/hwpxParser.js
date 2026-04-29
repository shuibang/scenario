import JSZip from 'jszip';

/**
 * HWPX 파일 → 문단 텍스트 배열
 * JSZip + 브라우저 내장 DOMParser 사용 (fast-xml-parser 불필요)
 */
export async function parseHwpxFile(file) {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buffer);

  if (!zip.file('META-INF/container.xml')) {
    throw new Error('올바른 HWPX 파일이 아닙니다 (container.xml 없음)');
  }

  // header.xml에서 outline 식별자 두 갈래 추출
  // - styleIDRef 매칭: engName="Outline 1" 스타일 id Set
  // - paraPrIDRef 매칭: <hh:paraPr> 안에 <hh:heading type="OUTLINE"/>이 있는 paraPr id Set
  // (한컴 양식은 둘 중 하나만 거는 경우가 있어 OR로 잡아야 회차 번호가 누락되지 않음)
  const headerText = await readHeaderText(zip);
  const outlineStyleIds = extractOutlineStyleIdsFromHeader(headerText);
  const outlineParaPrIds = extractOutlineParaPrIdsFromHeader(headerText);

  const sectionEntries = [];
  zip.forEach((path, entry) => {
    if (/^Contents\/section\d+\.xml$/i.test(path)) {
      sectionEntries.push({ path, entry });
    }
  });
  if (!sectionEntries.length) {
    throw new Error('본문 섹션을 찾을 수 없습니다 (section*.xml 없음)');
  }
  sectionEntries.sort((a, b) => {
    const n = s => parseInt(s.path.match(/section(\d+)/i)?.[1] ?? '0', 10);
    return n(a) - n(b);
  });

  const paragraphs = [];
  const parser = new DOMParser();
  let outlineCounter = 0;   // 전체 섹션 누적 (한컴 동작 동일)

  for (const { entry } of sectionEntries) {
    const xmlText = await entry.async('text');
    const doc = parser.parseFromString(xmlText, 'application/xml');

    // HTMLCollection은 브라우저에선 iterable이지만 일부 XML DOM 구현(@xmldom 등)에선 아님 — 배열화로 환경 독립.
    const pNodes = Array.from(doc.getElementsByTagNameNS('*', 'p'));
    for (const p of pNodes) {
      let text = extractText(p);
      const styleIDRef = p.getAttribute('styleIDRef') ?? '';
      const paraPrIDRef = p.getAttribute('paraPrIDRef') ?? '';

      const isOutline = outlineStyleIds.has(styleIDRef) || outlineParaPrIds.has(paraPrIDRef);
      if (isOutline && text.trim()) {
        outlineCounter++;
        text = `${outlineCounter}. ${text}`;
      }
      paragraphs.push({ text });
    }
  }

  return {
    paragraphs,
    metadata: {
      sectionCount: sectionEntries.length,
      paragraphCount: paragraphs.length,
    },
  };
}

/**
 * Contents/header.xml 텍스트를 안전하게 읽음 (없거나 실패 시 null).
 */
async function readHeaderText(zip) {
  try {
    const headerFile = zip.file('Contents/header.xml');
    if (!headerFile) return null;
    return await headerFile.async('text');
  } catch (e) {
    console.warn('[hwpxParser] header.xml 읽기 실패:', e);
    return null;
  }
}

/**
 * header.xml 텍스트 → engName="Outline 1" 스타일의 id Set.
 * 별도 XML 파서 미도입 (한컴 양식이 self-closing <hh:style ... /> 형태로 일관) — 정규식 매칭.
 * @param {string|null} headerText
 * @returns {Set<string>}
 */
export function extractOutlineStyleIdsFromHeader(headerText) {
  const ids = new Set();
  if (!headerText) return ids;
  const styleRe = /<hh:style\s+([^>]+?)\/?>/g;
  for (const m of headerText.matchAll(styleRe)) {
    const attrs = m[1];
    if (!/engName="Outline 1"/.test(attrs)) continue;
    const idMatch = attrs.match(/\bid="(\d+)"/);
    if (idMatch) ids.add(idMatch[1]);
  }
  return ids;
}

/**
 * header.xml 텍스트 → <hh:paraPr> 중 <hh:heading type="OUTLINE"/>을 포함하는 id Set.
 * paraProperties 섹션을 먼저 좁힌 뒤, paraPr 블록(`<hh:paraPr ...> ... </hh:paraPr>`)을
 * 개별 추출해 각 블록 내에서 OUTLINE heading 유무를 검사한다.
 * Why: 비-greedy 한 줄 정규식으로 검색하면 이웃 paraPr의 heading이 새어 들어와 오인식될 수 있음.
 * @param {string|null} headerText
 * @returns {Set<string>}
 */
export function extractOutlineParaPrIdsFromHeader(headerText) {
  const ids = new Set();
  if (!headerText) return ids;
  const paraPrSection = headerText.match(/<hh:paraProperties[\s\S]*?<\/hh:paraProperties>/)?.[0];
  if (!paraPrSection) return ids;
  const blockRe = /<hh:paraPr\s+id="(\d+)"[\s\S]*?<\/hh:paraPr>/g;
  for (const m of paraPrSection.matchAll(blockRe)) {
    if (/<hh:heading\s+type="OUTLINE"/.test(m[0])) {
      ids.add(m[1]);
    }
  }
  return ids;
}

/**
 * <hp:p> 노드에서 텍스트 추출
 * hp:t 안의 텍스트 노드는 그대로, <hp:tab/>은 \t로 보존 (대사 인식용 구분자)
 * t 외부의 sibling tab도 처리. 다른 컨테이너(run 등)는 재귀 순회.
 */
export function extractText(pNode) {
  const parts = [];
  function elementChildren(node) {
    // 브라우저 DOM은 .children(HTMLCollection of elements)을 제공.
    // 일부 XML DOM 구현(@xmldom 등)은 .children이 없어 childNodes에서 element만 추리는 폴백 필요.
    if (node.children) return node.children;
    if (!node.childNodes) return [];
    return Array.from(node.childNodes).filter(n => n.nodeType === 1);
  }
  function allChildNodes(node) {
    // childNodes 또한 일부 구현에서 비-iterable. for-of 안전하게 배열로 정규화.
    if (!node.childNodes) return [];
    return Array.from(node.childNodes);
  }
  function walk(node) {
    for (const child of elementChildren(node)) {
      if (child.localName === 't') {
        for (const sub of allChildNodes(child)) {
          if (sub.nodeType === 3 /* TEXT_NODE */) {
            parts.push(sub.nodeValue ?? '');
          } else if (sub.localName === 'tab') {
            parts.push('\t');
          } else {
            walk(sub);
          }
        }
      } else if (child.localName === 'tab') {
        parts.push('\t');
      } else {
        walk(child);
      }
    }
  }
  walk(pNode);
  return parts.join('');
}
