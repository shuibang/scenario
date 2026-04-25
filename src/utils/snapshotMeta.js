// 스냅샷 메타 계산/포맷.
// computeSnapshotMeta(payload, jsonStr?) → { projectCount, sceneCount, charCount, sizeBytes }
// formatSnapshotMetaLine(meta) → "작품 3개 · 씬 42 · 1,234자 · 86KB"
//
// charCount는 b/i/u 등 인라인 HTML 태그를 제거한 사용자 입력 문자 수.
// sceneCount는 scriptBlocks의 type==='scene_number' 개수 — 에디터에서 보이는 씬 수와 일치.
// sizeBytes는 UTF-8 인코딩 기준 바이트. 한글 1자 = 3바이트.
// 옛 스냅샷 엔트리는 새 필드가 undefined → formatSnapshotMetaLine이 작품 N개만 출력.

const HTML_TAG_RE = /<[^>]+>/g;

function stripHtml(value) {
  return String(value ?? '').replace(HTML_TAG_RE, '');
}

export function computeSnapshotMeta(payload, jsonStr) {
  const projectCount = Array.isArray(payload?.projects) ? payload.projects.length : 0;

  const blocks = Array.isArray(payload?.scriptBlocks) ? payload.scriptBlocks : [];
  let sceneCount = 0;
  let charCount = 0;
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === 'scene_number') sceneCount += 1;
    if (b.content) charCount += stripHtml(b.content).length;
  }

  let sizeBytes = 0;
  try {
    const str = jsonStr ?? JSON.stringify(payload ?? {});
    sizeBytes = new TextEncoder().encode(str).length;
  } catch {
    // TextEncoder 미지원 환경 폴백 — UTF-16 길이로 근사 (한글 정확도 떨어지나 0보다 낫다)
    sizeBytes = (jsonStr ?? '').length;
  }

  return { projectCount, sceneCount, charCount, sizeBytes };
}

export function formatChars(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return `${n.toLocaleString('ko-KR')}자`;
}

export function formatBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function formatSnapshotMetaLine(meta) {
  if (!meta) return '';
  const parts = [];
  if (typeof meta.projectCount === 'number') parts.push(`작품 ${meta.projectCount}개`);
  if (typeof meta.sceneCount === 'number') parts.push(`씬 ${meta.sceneCount}`);
  const c = formatChars(meta.charCount);
  if (c) parts.push(c);
  const b = formatBytes(meta.sizeBytes);
  if (b) parts.push(b);
  return parts.join(' · ');
}
