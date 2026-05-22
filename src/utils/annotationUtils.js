import { genId, now } from '../store/db';

// ─── 마커 기호 ────────────────────────────────────────────────────────────────
const MARKERS = ['*', '**', '***'];

// count = 현재 블록에 이미 존재하는 annotations.length (0-based)
export function generateMarkerId(count) {
  if (count < MARKERS.length) return MARKERS[count];
  return `(${count + 1})`;
}

// ─── Annotation 객체 생성 ─────────────────────────────────────────────────────
// existingAnnotations: 현재 블록의 annotations 배열 (markerId 순번 결정에 사용)
// position은 항상 'below'로 고정 (side 옵션 제거)
export function createAnnotation(
  { selectedText = '', note = '' } = {},
  existingAnnotations = []
) {
  return {
    id: genId(),
    markerId: generateMarkerId(existingAnnotations.length),
    selectedText,
    note,
    position: 'below',
    createdAt: now(),
    updatedAt: now(),
  };
}

// ─── 정렬 ────────────────────────────────────────────────────────────────────
const MARKER_ORDER = { '*': 0, '**': 1, '***': 2 };

export function sortAnnotationsByOrder(annotations) {
  if (!Array.isArray(annotations)) return [];
  return [...annotations].sort((a, b) => {
    const oa = MARKER_ORDER[a.markerId] ?? Infinity;
    const ob = MARKER_ORDER[b.markerId] ?? Infinity;
    if (oa !== ob) return oa - ob;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}
