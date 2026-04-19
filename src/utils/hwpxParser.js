import JSZip from 'jszip';

/**
 * HWPX 파일 → 문단 텍스트 배열
 * JSZip + 브라우저 내장 DOMParser 사용 (fast-xml-parser 불필요)
 */
export async function parseHwpxFile(file) {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buffer);

  // container.xml 존재 확인
  if (!zip.file('META-INF/container.xml')) {
    throw new Error('올바른 HWPX 파일이 아닙니다 (container.xml 없음)');
  }

  // Contents/section*.xml 수집 & 정렬
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

  for (const { entry } of sectionEntries) {
    const xmlText = await entry.async('text');
    const doc = parser.parseFromString(xmlText, 'application/xml');

    // hp:p 요소 전체 수집
    const pNodes = doc.getElementsByTagNameNS('*', 'p');
    for (const p of pNodes) {
      const text = extractText(p);
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
 * <hp:p> 노드에서 텍스트 추출
 * hp:t 텍스트 노드만 수집 (서식 무시)
 */
function extractText(pNode) {
  // hp:run > hp:t 구조 — 네임스페이스 무관하게 localName으로 매칭
  const tNodes = [];
  walkElements(pNode, (el) => {
    if (el.localName === 't') tNodes.push(el);
  });
  return tNodes.map(t => t.textContent ?? '').join('');
}

function walkElements(node, cb) {
  for (const child of node.children ?? []) {
    cb(child);
    walkElements(child, cb);
  }
}
