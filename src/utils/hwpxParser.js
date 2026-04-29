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
 * hp:t 안의 텍스트 노드는 그대로, <hp:tab/>은 \t로 보존 (대사 인식용 구분자)
 * t 외부의 sibling tab도 처리. 다른 컨테이너(run 등)는 재귀 순회.
 */
export function extractText(pNode) {
  const parts = [];
  function walk(node) {
    for (const child of node.children ?? []) {
      if (child.localName === 't') {
        for (const sub of child.childNodes) {
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
